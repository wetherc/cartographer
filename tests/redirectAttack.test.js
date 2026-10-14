import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackTraitFields, coerceWeakSwing } from '../src/entities/CreatureAttacks.js';
import { createCreature, withDefaults } from '../src/entities/Creature.js';
import { fromTemplate, toTemplate } from '../src/entities/CreatureTemplate.js';
import { isWeakSwing } from '../src/combat/AttackTweaks.js';
import { attackLine, prepareSwing } from '../src/combat/WeaponSwing.js';
import { rollWeaponAttack } from '../src/app/weaponAttack.js';
import { offerRedirect, pendingRedirect, redirectSpellTargets } from '../src/app/redirectWard.js';
import { creatureFields } from '../src/view/forms/creatureFields.js';
import { readCreatureFields } from '../src/view/forms/creatureRead.js';
import { gearOptions } from '../src/view/forms/gearFields.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { roll } from '../src/dice/DiceRoller.js';
import { STAT_KEYS } from '../src/entities/Modifiers.js';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { replaceById } from '../src/entities/Roster.js';
import { createResource } from '../src/entities/Resource.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };
const BLADE = /** @type {any} */ ({
  name: 'Scimitar',
  kind: 'melee',
  damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
});
const boss = createCreature('boss', 'Boss', {
  disposition: 'hostile',
  maxHP: 21,
  location: HERE,
  weapon: BLADE,
  multiattack: 2,
  multiattackDisadvantage: 2,
  redirectAttack: true,
});
const goblin = (/** @type {string} */ id) =>
  createCreature(id, 'Goblin', { disposition: 'hostile', maxHP: 7, location: HERE });

test('coerceWeakSwing keeps a swing inside the Multiattack', () => {
  assert.equal(coerceWeakSwing('2', 2), 2);
  assert.equal(coerceWeakSwing(3, 2), undefined);
  assert.equal(coerceWeakSwing(0, 2), undefined);
  assert.equal(coerceWeakSwing(2, undefined), undefined);
  assert.deepEqual(attackTraitFields({ multiattack: 3, multiattackDisadvantage: 3 }), {
    multiattack: 3,
    multiattackDisadvantage: 3,
  });
  assert.deepEqual(attackTraitFields({ multiattackDisadvantage: 2 }), {});
  assert.deepEqual(attackTraitFields({ redirectAttack: 'yes' }), {});
});

test('the creature model keeps both traits through load and template', () => {
  assert.equal(boss.multiattackDisadvantage, 2);
  assert.equal(boss.redirectAttack, true);
  const loaded = withDefaults(boss);
  assert.equal(loaded.multiattackDisadvantage, 2);
  assert.equal(loaded.redirectAttack, true);
  const spawn = fromTemplate(toTemplate('t', boss), 'b2');
  assert.equal(spawn.multiattackDisadvantage, 2);
  assert.equal(spawn.redirectAttack, true);
  const plain = withDefaults({
    ...boss,
    multiattackDisadvantage: undefined,
    redirectAttack: false,
  });
  assert.equal('multiattackDisadvantage' in plain, false);
  assert.equal('redirectAttack' in plain, false);
});

test('isWeakSwing reads the swing number from the budget', () => {
  const main = {};
  const at = (/** @type {any} */ used) => /** @type {any} */ ({ id: 'boss', used });
  assert.equal(isWeakSwing(boss, at({}), main), false);
  assert.equal(isWeakSwing(boss, at({ action: true, attacksLeft: 1 }), main), true);
  assert.equal(isWeakSwing(boss, at({ action: true, attacksLeft: 1 }), { offhand: true }), false);
  assert.equal(isWeakSwing(boss, null, main), false);
  assert.equal(isWeakSwing({ ...boss, multiattack: undefined }, at({}), main), false);
  assert.equal(isWeakSwing({ ...boss, multiattackDisadvantage: 1 }, at({}), main), true);
});

test('the weak swing rolls with disadvantage and the log names it', () => {
  const defender = { id: 'hero', name: 'Hero', ac: 12, conditions: [] };
  const args = { attacker: boss, defender, weapon: BLADE, rng: () => 0 };
  const weak = prepareSwing({ ...args, tweaks: { weak: true } });
  assert.equal(weak.mode, 'disadvantage');
  assert.equal(prepareSwing({ ...args, tweaks: {} }).mode, null);
  const line = attackLine(weak, {
    ...args,
    tweaks: { weak: true },
    swingNote: '',
    total: 10,
    d20: undefined,
    rollMode: 'disadvantage',
    raised: 0,
    wardName: null,
    outcome: 'miss',
  });
  assert.match(line, /Multiattack disadvantage/);
});

/**
 * A fight of the boss and two goblins against a hero, with every d20 rolling
 * high so that each swing hits.
 * @param {{ role?: string, bossUsed?: any, gob2HP?: number }} [opts]
 */
function fight({ role = 'gm', bossUsed = {}, gob2HP = 7 } = {}) {
  const spent = /** @type {string[]} */ ([]);
  const app = stubApp({
    state: /** @type {any} */ ({
      role,
      characters: [withHP(createCharacter('hero', 'Hero'), 30)],
      creatures: [boss, goblin('gob1'), { ...goblin('gob2'), currentHP: gob2HP }],
      combat: {
        round: 1,
        order: [{ id: 'hero' }, { id: 'boss', used: bossUsed }, { id: 'gob1' }, { id: 'gob2' }],
      },
    }),
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
  });
  app.actions.rollDice = /** @type {any} */ (
    (/** @type {any} */ selection) => ({ result: roll(selection, () => 0.9) })
  );
  app.actions.spendBudget = /** @type {any} */ (
    (/** @type {string} */ id, /** @type {string} */ cost) => {
      spent.push(`${id}:${cost}`);
      return true;
    }
  );
  return { app, spent };
}

test('pendingRedirect offers the standing allies to a GM only', () => {
  const { app } = fight({ gob2HP: 0 });
  const redirect = pendingRedirect(app, 'boss', 'hero');
  assert.deepEqual(
    redirect?.allies.map((a) => a.id),
    ['gob1'],
  );
  assert.equal(pendingRedirect(fight({ role: 'player' }).app, 'boss', 'hero'), null);
  assert.equal(pendingRedirect(fight({ bossUsed: { reaction: true } }).app, 'boss', 'hero'), null);
  assert.equal(pendingRedirect(app, 'gob1', 'hero'), null);
  assert.equal(pendingRedirect(app, 'boss', 'boss'), null);
  assert.equal(pendingRedirect(stubApp(), 'boss', 'hero'), null);
});

test('a redirected hit lands on the ally and spends the reaction', async () => {
  const { app, spent } = fight();
  /** @type {any[]} */
  const asked = [];
  const prompt = /** @type {any} */ (
    async (
      /** @type {string} */ title,
      /** @type {any[]} */ fields,
      /** @type {any} */ options,
    ) => {
      asked.push({ title, fields, options });
      return { ally: 'gob2' };
    }
  );
  const hero = app.state.characters[0];
  await rollWeaponAttack(app, {
    attacker: hero,
    defender: { id: 'boss', name: 'Boss', ac: 10, conditions: [] },
    weapon: BLADE,
    tweaks: { freeAction: true },
    rng: () => 0.99,
    prompt,
  });
  assert.equal(asked[0].title, 'Redirect Attack');
  assert.ok(spent.includes('boss:reaction'));
  const hp = (/** @type {string} */ id) => app.state.creatures.find((c) => c.id === id)?.currentHP;
  assert.equal(hp('boss'), 21);
  assert.ok((hp('gob2') ?? 7) < 7);
  const swap = app.log.findIndex((l) =>
    /Boss uses Redirect Attack .* Goblin 2, who becomes the target/.test(l),
  );
  const swung = app.log.findIndex((l) => /^Hero attacks Goblin 2 with Scimitar/.test(l));
  assert.ok(swap >= 0 && swung > swap, 'the swap comes before the roll, which targets the ally');
  assert.match(
    asked[0].options.message,
    /^Hero attacks Boss with Scimitar\. Boss can use its reaction/,
  );
  assert.equal(asked[0].options.submitLabel, 'Swap places');
  assert.equal(asked[0].options.cancelLabel, 'Keep target');
});

test('a declined redirect leaves the hit on the defender', async () => {
  const { app, spent } = fight();
  const ally = await offerRedirect(
    app,
    { id: 'boss', name: 'Boss', allies: [{ id: 'gob1', name: 'Goblin', ac: 12, conditions: [] }] },
    'Hit.',
    { prompt: /** @type {any} */ (async () => ({ ally: '' })) },
  );
  assert.equal(ally, null);
  assert.deepEqual(spent, []);
  const cancelled = await offerRedirect(
    app,
    { id: 'boss', name: 'Boss', allies: [{ id: 'gob1', name: 'Goblin', ac: 12, conditions: [] }] },
    'Hit.',
    { prompt: /** @type {any} */ (async () => null) },
  );
  assert.equal(cancelled, null);
});

test('the creature form fills and reads both traits', () => {
  const gear = gearOptions(boss);
  const fields = creatureFields(boss, gear);
  const value = (/** @type {string} */ name) => fields.find((f) => f.name === name)?.value;
  assert.equal(value('multiattackDisadvantage'), 2);
  assert.equal(value('redirectAttack'), true);
  const blank = creatureFields(null, gear);
  assert.equal(blank.find((f) => f.name === 'multiattackDisadvantage')?.value, '');
  assert.equal(blank.find((f) => f.name === 'redirectAttack')?.value, false);
  const values = {
    name: 'Boss',
    role: '',
    disposition: 'hostile',
    notes: '',
    maxHP: '21',
    level: '',
    tier: 'mob',
    cr: '',
    weapon: '',
    armor: '',
    casterClass: '',
    multiattack: '2',
    multiattackDisadvantage: '2',
    redirectAttack: '1',
    ...Object.fromEntries(STAT_KEYS.map((key) => [`stat-${key}`, '10'])),
  };
  const read = readCreatureFields(values, gear);
  assert.equal(read.multiattackDisadvantage, 2);
  assert.equal(read.redirectAttack, true);
  const cleared = readCreatureFields(
    { ...values, multiattackDisadvantage: '', redirectAttack: '' },
    gear,
  );
  assert.equal('multiattackDisadvantage' in cleared, false);
  assert.equal('redirectAttack' in cleared, false);
});

test('the second swing of the boss rolls with disadvantage in a fight', () => {
  const { app } = fight({ bossUsed: { action: true, attacksLeft: 1 } });
  rollWeaponAttack(app, {
    attacker: boss,
    defender: { id: 'hero', name: 'Hero', ac: 10, conditions: [] },
    weapon: BLADE,
    rng: () => 0,
  });
  assert.ok(app.log.some((l) => /Multiattack disadvantage/.test(l)));
});

test('an attack spell at the boss asks first and rolls against the ally', async () => {
  const { app, spent } = fight();
  const evoker = /** @type {any} */ ({
    ...createCharacter('evoker', 'Evoker', {
      STR: 10,
      DEX: 14,
      CON: 10,
      INT: 16,
      WIS: 10,
      CHA: 10,
    }),
    classes: [{ classId: 'wizard', level: 5 }],
    level: 5,
    resources: [createResource('hp', 'Hit points', 30)],
    spellbook: { cantrips: ['fire-bolt'], known: [], prepared: [] },
  });
  app.state.characters = [...app.state.characters, evoker];
  const bolt = /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === 'fire-bolt'));
  const aim = (/** @type {string} */ id) => ({ id, name: id, ac: 10, conditions: [] });
  const plan = /** @type {any} */ (castPlan(app, evoker, bolt, [aim('boss'), aim('gob1')]));
  assert.equal(plan.ok, true, plan.message);
  /** @type {string[]} */
  const labels = [];
  await resolveCast(
    app,
    plan,
    { target: 'boss' },
    {
      writeBack: (next) => {
        app.state.characters = replaceById(app.state.characters, next);
      },
      rng: () => 0.99,
      prompt: /** @type {any} */ (
        async (/** @type {string} */ _t, /** @type {any[]} */ _f, /** @type {any} */ options) => {
          labels.push(options.message);
          return { ally: 'gob1' };
        }
      ),
    },
  );
  assert.match(labels[0], /^Fire Bolt targets boss\./);
  assert.ok(spent.includes('boss:reaction'));
  const hp = (/** @type {string} */ id) => app.state.creatures.find((c) => c.id === id)?.currentHP;
  assert.equal(hp('boss'), 21);
  assert.ok((hp('gob1') ?? 7) < 7);
});

test('redirectSpellTargets keeps the list when no target can redirect', async () => {
  const { app } = fight({ role: 'player' });
  assert.equal(
    redirectSpellTargets(app, 'Fire Bolt', [{ id: 'boss', name: 'Boss' }], 'hero', []),
    null,
  );
  const gm = fight().app;
  const next = await redirectSpellTargets(
    gm,
    'Fire Bolt',
    [{ name: 'Nobody' }, { id: 'boss', name: 'Boss' }],
    'hero',
    [],
    { prompt: /** @type {any} */ (async () => ({ ally: 'gob2' })) },
  );
  assert.deepEqual(
    next?.map((t) => t.id),
    [undefined, 'gob2'],
  );
});

test('a change to the caster during the Redirect Attack dialog stays after the cast', async () => {
  const { app } = fight();
  const evoker = /** @type {any} */ ({
    ...createCharacter('evoker', 'Evoker', {
      STR: 10,
      DEX: 14,
      CON: 10,
      INT: 16,
      WIS: 10,
      CHA: 10,
    }),
    classes: [{ classId: 'wizard', level: 5 }],
    level: 5,
    resources: [createResource('slots-1', 'Level 1 slots', 4)],
    spellbook: { cantrips: [], known: ['ray-of-sickness'], prepared: ['ray-of-sickness'] },
  });
  app.state.characters = [...app.state.characters, evoker];
  const bolt = /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === 'ray-of-sickness'));
  const aim = (/** @type {string} */ id) => ({ id, name: id, ac: 10, conditions: [] });
  const plan = /** @type {any} */ (castPlan(app, evoker, bolt, [aim('boss'), aim('gob1')]));
  assert.equal(plan.ok, true, plan.message);
  const store = (/** @type {any} */ next) => {
    app.state.characters = replaceById(app.state.characters, next);
  };
  await resolveCast(
    app,
    plan,
    { target: 'boss', slot: '1' },
    {
      writeBack: store,
      rng: () => 0.99,
      prompt: /** @type {any} */ (
        async () => {
          store({ ...app.state.characters.find((c) => c.id === 'evoker'), notes: 'patched' });
          return { ally: 'gob1' };
        }
      ),
    },
  );
  const after = app.state.characters.find((c) => c.id === 'evoker');
  assert.equal(after?.notes, 'patched');
  assert.equal(after?.resources.find((r) => r.id === 'slots-1')?.current, 3);
});

test('a caster removed during the Redirect Attack dialog casts nothing', async () => {
  const { app } = fight();
  const evoker = /** @type {any} */ ({
    ...createCharacter('evoker', 'Evoker'),
    classes: [{ classId: 'wizard', level: 5 }],
    level: 5,
    spellbook: { cantrips: ['fire-bolt'], known: [], prepared: [] },
  });
  app.state.characters = [...app.state.characters, evoker];
  const bolt = /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === 'fire-bolt'));
  const aim = (/** @type {string} */ id) => ({ id, name: id, ac: 10, conditions: [] });
  const plan = /** @type {any} */ (castPlan(app, evoker, bolt, [aim('boss'), aim('gob1')]));
  await resolveCast(
    app,
    plan,
    { target: 'boss' },
    {
      writeBack: () => assert.fail('nothing to write'),
      prompt: /** @type {any} */ (
        async () => {
          app.state.characters = app.state.characters.filter((c) => c.id !== 'evoker');
          return { ally: 'gob1' };
        }
      ),
    },
  );
  assert.equal(app.state.creatures.find((c) => c.id === 'gob1')?.currentHP, 7);
});
