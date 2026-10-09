import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerWard, pendingWard, wardRaise, wardSpellAttack } from '../src/app/shieldWard.js';
import { emptyLibrary, setActiveLibrary } from '../src/library/Library.js';
import { rollWeaponAttack } from '../src/app/weaponAttack.js';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { findCombatant } from '../src/app/combatants.js';
import { acOf } from '../src/combat/CombatView.js';
import { canSpend, spend } from '../src/combat/ActionBudget.js';
import { createParticipant, startCombat } from '../src/combat/Initiative.js';
import { roll } from '../src/dice/DiceRoller.js';
import { addItem, createCharacter } from '../src/entities/Character.js';
import { equip } from '../src/entities/Equipment.js';
import { createCondition } from '../src/entities/Conditions.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The pause before a hit lands on a defender that can cast Shield: the
 * question, the cast it leads to, and the attack checked again against the
 * raised AC, for a weapon swing and for an attack spell.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };
const SWORD = /** @type {any} */ ({
  id: 'sword',
  name: 'Sword',
  type: 'weapon',
  kind: 'melee',
  category: 'martial',
  quantity: 1,
  notes: '',
  damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
});
const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

/** The rng value that makes a d20 land on `n`. */
const d20 = (n) => (n - 1) / 20;

/** An rng that hands back the given values in order, then repeats the last one. */
function scripted(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** A level 5 wizard with DEX 14 (AC 12) who knows `spells`. */
function wizard(id, spells, slots = 4) {
  return /** @type {any} */ ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    race: 'human',
    classes: [{ classId: 'wizard', level: 5 }],
    level: 5,
    xp: 0,
    stats: { STR: 10, DEX: 14, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [
      createResource('hp', 'Hit points', 'health', 30),
      { ...createResource('slots-1', 'Level 1 slots', 'mana', 4), current: slots },
    ],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: ['fire-bolt'], known: spells, prepared: spells },
    proficiencies: undefined,
  });
}

/** A fighter with STR 16 and no weapon training: +3 to hit with the sword. */
const hero = () => createCharacter('hero', 'Hero', { STR: 16 });

/**
 * A stub app with the mage, a second caster, and the hero. `rng` drives the
 * dice tray and every other roll. The budget spend marks the part of the turn
 * on the running order, the way the real one does.
 */
function stubApp({
  rng = () => 0.5,
  role = 'gm',
  bound = null,
  mage = wizard('mage', ['shield']),
} = {}) {
  const app = baseStubApp({
    state: {
      characters: [mage, wizard('evoker', ['magic-missile']), hero()],
      creatures: [],
      role,
    },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    actions: {
      getBoundCharacterId: () => bound,
      rollDice: (/** @type {any} */ selection) => ({ result: roll(selection, rng) }),
      spendBudget: (/** @type {string} */ id, /** @type {any} */ cost) => {
        const combat = app.state.combat;
        const index = combat?.order.findIndex((p) => p.id === id) ?? -1;
        if (!combat || index < 0) return true;
        if (!canSpend(combat.order[index], cost)) return false;
        const order = [...combat.order];
        order[index] = spend(order[index], cost);
        app.state.combat = { ...combat, order };
        return true;
      },
    },
  });
  return app;
}

const pc = (app, id) => app.state.characters.find((c) => c.id === id);
const hpOf = (app, id) => pc(app, id).resources.find((r) => r.id === 'hp').current;
const slotsOf = (app, id) => pc(app, id).resources.find((r) => r.id === 'slots-1').current;
const target = (app, id) => ({ id, name: pc(app, id).name, ac: 12, conditions: [] });

/** Start a fight between the hero and the mage, with the hero acting. */
function fight(app) {
  app.state.combat = startCombat(
    [createParticipant('hero', 20), createParticipant('mage', 5), createParticipant('evoker', 3)],
    (x) => x.id,
  );
}

/** An `ask` that records each question and answers `yes`. */
function answer(yes) {
  const asked = /** @type {string[]} */ ([]);
  const ask = async (/** @type {string} */ message) => {
    asked.push(message);
    return yes;
  };
  return { asked, ask };
}

/** An `ask` that fails the test when the ward asks anything. */
const never = async () => assert.fail('the ward asked nothing here');

/** The hero swings at the mage. */
function swing(app, ask) {
  return rollWeaponAttack(app, {
    attacker: pc(app, 'hero'),
    defender: target(app, 'mage'),
    weapon: SWORD,
    tweaks: { freeAction: true },
    ask,
  });
}

test('a hit that Shield turns aside casts Shield and misses', async () => {
  const app = stubApp({ rng: scripted([d20(12), 0.5]) });
  fight(app);
  const { asked, ask } = answer(true);
  await swing(app, ask);
  assert.deepEqual(asked, [
    'Hero hits Mage with Sword (15 vs AC 12). Cast Shield as a reaction (+5 AC)?',
  ]);
  assert.equal(acOf(/** @type {any} */ (findCombatant(app, 'mage'))), 17);
  assert.equal(hpOf(app, 'mage'), 30);
  assert.equal(slotsOf(app, 'mage'), 3);
  const mage = /** @type {any} */ (app.state.combat).order.find((p) => p.id === 'mage');
  assert.equal(canSpend(mage, 'reaction'), false);
  assert.ok(
    app.log.some((l) => l.includes('15 to hit vs AC 17 (Shield +5)') && l.endsWith('miss.')),
  );
  // The spent reaction leaves nothing to offer against the next swing.
  assert.equal(pendingWard(app, 'mage', 'hero'), null);
});

test('declining Shield lets the hit land', async () => {
  const app = stubApp({ rng: scripted([d20(12), 0.5]) });
  fight(app);
  const { asked, ask } = answer(false);
  await swing(app, ask);
  assert.equal(asked.length, 1);
  assert.ok(hpOf(app, 'mage') < 30);
  assert.equal(slotsOf(app, 'mage'), 4);
});

test('a natural 20 and a roll that beats the raised AC ask nothing', () => {
  const crit = stubApp({ rng: scripted([d20(20), 0.5]) });
  fight(crit);
  assert.equal(swing(crit, never), undefined);
  assert.ok(hpOf(crit, 'mage') < 30);
  const high = stubApp({ rng: scripted([d20(14), 0.5]) });
  fight(high);
  assert.equal(swing(high, never), undefined);
  assert.ok(hpOf(high, 'mage') < 30);
});

test('pendingWard needs a ready reaction, a slot, and a viewer who may act', () => {
  const app = stubApp();
  assert.equal(pendingWard(app, 'mage', 'hero')?.spell.id, 'shield');
  assert.equal(pendingWard(app, 'mage', 'mage'), null, 'no ward against its own attack');
  assert.equal(pendingWard(app, 'hero', 'mage'), null, 'no ward spell');
  assert.equal(pendingWard(app, 'nobody', 'hero'), null);
  const noSlot = stubApp({ mage: wizard('mage', ['shield'], 0) });
  assert.equal(pendingWard(noSlot, 'mage', 'hero'), null);
  const stunned = stubApp({
    mage: { ...wizard('mage', ['shield']), conditions: [createCondition('Stunned')] },
  });
  assert.equal(pendingWard(stunned, 'mage', 'hero'), null);
  const shielded = stubApp({
    mage: { ...wizard('mage', ['shield']), conditions: [createCondition('Shield', 1)] },
  });
  assert.equal(pendingWard(shielded, 'mage', 'hero'), null);
  assert.equal(pendingWard(stubApp({ role: 'player', bound: 'hero' }), 'mage', 'hero'), null);
  assert.ok(pendingWard(stubApp({ role: 'player', bound: 'mage' }), 'mage', 'hero'));
  const plate = {
    id: 'plate',
    name: 'Plate',
    type: 'armor',
    armorWeight: 'heavy',
    baseAC: 18,
    quantity: 1,
    notes: '',
  };
  const untrained = { ...wizard('mage', ['shield']), proficiencies: hero().proficiencies };
  const armored = equip(addItem(untrained, /** @type {any} */ (plate)), 'chest', 'plate');
  assert.equal(
    pendingWard(stubApp({ mage: armored }), 'mage', 'hero'),
    null,
    'no cast in untrained armor',
  );
  // In a fight, a combatant outside the order has no reaction to spend.
  app.state.combat = startCombat([createParticipant('hero', 20)], (x) => x.id);
  assert.equal(pendingWard(app, 'mage', 'hero'), null);
});

/** Cast `spellId` from the evoker at the mage, with the rolls given. */
function castAt(app, spellId, values, rng, ask) {
  const plan = /** @type {any} */ (
    castPlan(app, pc(app, 'evoker'), spellById(spellId), [target(app, 'mage')])
  );
  assert.equal(plan.ok, true, plan.message);
  return resolveCast(app, plan, /** @type {any} */ (values), {
    writeBack: (next) => {
      app.state.characters = replaceById(app.state.characters, next);
    },
    rng,
    ask,
  });
}

test('Shield turns a Fire Bolt aside after it rolls and before it lands', async () => {
  const app = stubApp();
  const { asked, ask } = answer(true);
  // A natural 9 plus the evoker's +6 is 15 against AC 12.
  await castAt(app, 'fire-bolt', { target: 'mage' }, scripted([d20(9), 0.5]), ask);
  assert.deepEqual(asked, [
    'Fire Bolt hits Mage (15 vs AC 12). Cast Shield as a reaction (+5 AC)?',
  ]);
  assert.equal(hpOf(app, 'mage'), 30);
  const casts = app.log.findIndex((l) => l === 'Evoker casts Fire Bolt.');
  const shield = app.log.findIndex((l) => l === 'Mage casts Shield at level 1.');
  const miss = app.log.findIndex((l) => l === 'Fire Bolt: 15 to hit vs AC 17, misses Mage.');
  assert.ok(casts >= 0 && casts < shield && shield < miss, app.log.join('\n'));
});

test('Shield blocks every Magic Missile dart', async () => {
  const app = stubApp();
  const { asked, ask } = answer(true);
  await castAt(app, 'magic-missile', { slot: '1', allocation: 'mage:3' }, () => 0.5, ask);
  assert.deepEqual(asked, [
    'Magic Missile: 3 of 3 hit Mage automatically. Cast Shield as a reaction (+5 AC, blocks the spell)?',
  ]);
  assert.equal(hpOf(app, 'mage'), 30);
  assert.ok(app.log.includes('Magic Missile: 0 of 3 hit Mage (AC 17).'), app.log.join('\n'));
});

test('a spell attack with no ward in reach lands without waiting', () => {
  const app = stubApp({ mage: wizard('mage', []) });
  const out = castAt(app, 'fire-bolt', { target: 'mage' }, scripted([d20(9), 0.5]), never);
  assert.equal(out, undefined);
  assert.ok(hpOf(app, 'mage') < 30);
});

test('a defender that leaves while the question is open raises nothing', async () => {
  const app = stubApp({ rng: scripted([d20(12), 0.5]) });
  await swing(app, async () => {
    app.state.characters = app.state.characters.filter((c) => c.id !== 'mage');
    return true;
  });
  assert.ok(app.log.some((l) => l.includes('15 to hit vs AC 12') && l.endsWith('hit.')));
});

test('Shield turns aside each Scorching Ray that misses the raised AC', async () => {
  const evoker = wizard('evoker', ['scorching-ray']);
  evoker.resources.push(createResource('slots-2', 'Level 2 slots', 'mana', 2));
  const app = stubApp();
  app.state.characters = replaceById(app.state.characters, evoker);
  const { asked, ask } = answer(true);
  // The rays roll 15, 15, and 22 against AC 12.
  const rng = scripted([d20(9), 0.5, 0.5, d20(9), 0.5, 0.5, d20(16), 0.5]);
  await castAt(app, 'scorching-ray', { slot: '2', allocation: 'mage:3' }, rng, ask);
  assert.deepEqual(asked, [
    'Scorching Ray: 3 of 3 hit Mage (AC 12). Cast Shield as a reaction (+5 AC)?',
  ]);
  assert.ok(
    app.log.some((l) => l.startsWith('Scorching Ray: 1 of 3 hit Mage for')),
    app.log.join('\n'),
  );
});

test('Magic Missile skips a target that already holds Shield, with no question', async () => {
  const held = createCondition('Shield', 1, { mods: { ac: 5, blocks: ['magic-missile'] } });
  const app = stubApp({ mage: { ...wizard('mage', ['shield']), conditions: [held] } });
  await castAt(app, 'magic-missile', { slot: '1', allocation: 'mage:3' }, () => 0.5, never);
  assert.equal(hpOf(app, 'mage'), 30);
});

test('Shield of Faith does not stop Magic Missile, so no ward is offered', () => {
  const app = stubApp({ mage: wizard('mage', []) });
  const out = castAt(app, 'magic-missile', { slot: '1', allocation: 'mage:3' }, () => 0.5, never);
  assert.equal(out, undefined);
  assert.ok(hpOf(app, 'mage') < 30);
});

test('the ward offers the real raise when a floor takes up part of the bonus', async () => {
  const bark = createCondition('Barkskin', 10, { mods: { acMin: 16 } });
  const mage = { ...wizard('mage', ['shield']), conditions: [bark] };
  // AC 12 with Barkskin reads 16, and Shield makes it 17, so the raise is 1.
  const app = stubApp({ mage, rng: scripted([d20(13), 0.5]) });
  fight(app);
  assert.equal(pendingWard(app, 'mage', 'hero')?.bonus, 1);
  const defender = { ...target(app, 'mage'), ac: 16 };
  const { asked, ask } = answer(true);
  // 13 + 3 is 16, which hits AC 16 and misses AC 17.
  await rollWeaponAttack(app, {
    attacker: pc(app, 'hero'),
    defender,
    weapon: SWORD,
    tweaks: { freeAction: true },
    ask,
  });
  assert.deepEqual(asked, [
    'Hero hits Mage with Sword (16 vs AC 16). Cast Shield as a reaction (+1 AC)?',
  ]);
  assert.equal(hpOf(app, 'mage'), 30);
  // An 18 beats AC 17, so the ward asks nothing.
  const high = stubApp({ mage, rng: scripted([d20(15), 0.5]) });
  fight(high);
  await rollWeaponAttack(high, {
    attacker: pc(high, 'hero'),
    defender: { ...target(high, 'mage'), ac: 16 },
    weapon: SWORD,
    tweaks: { freeAction: true },
    ask: never,
  });
  assert.ok(hpOf(high, 'mage') < 30);
});

test('a reaction spell whose chip adds no AC is never offered as a ward', () => {
  const app = stubApp({ mage: wizard('mage', ['counterspell']) });
  assert.equal(pendingWard(app, 'mage', 'hero'), null);
  const found = /** @type {any} */ ({ kind: 'character', entity: { ...wizard('mage', []) } });
  delete found.entity.conditions;
  assert.equal(wardRaise(found, spellById('counterspell')), 0);
  assert.equal(wardRaise(found, spellById('shield')), 5);
});

test('a ward that only blocks the spell says so in its question', async () => {
  const app = stubApp();
  const ward = /** @type {any} */ (pendingWard(app, 'mage', 'hero'));
  /** @type {string[]} */
  const asked = [];
  const raised = await offerWard(app, { ...ward, bonus: 0, blocks: true }, 'Hit.', {
    cast: resolveCast,
    ask: async (message) => {
      asked.push(message);
      return false;
    },
  });
  assert.equal(raised, 0);
  assert.deepEqual(asked, ['Hit. Cast Shield as a reaction (blocks the spell)?']);
});

test('the ward that adds the most AC wins, and an entity with no chip list still gets one', () => {
  const bulwark = {
    ...spellById('shield'),
    id: 'bulwark',
    name: 'Bulwark',
    effect: { kind: 'buff', mods: { ac: 2 }, until: 'caster-start' },
  };
  setActiveLibrary({ ...emptyLibrary(), spells: [bulwark] });
  try {
    const mage = wizard('mage', ['bulwark', 'shield']);
    delete mage.conditions;
    const ward = pendingWard(stubApp({ mage }), 'mage', 'hero');
    assert.equal(ward?.spell.id, 'shield');
    assert.equal(ward?.bonus, 5);
  } finally {
    setActiveLibrary(emptyLibrary());
  }
});

test('a ward that raises no AC is offered only when it blocks the attacking spell', () => {
  const bark = createCondition('Barkskin', 10, { mods: { acMin: 25 } });
  const app = stubApp({ mage: { ...wizard('mage', ['shield']), conditions: [bark] } });
  assert.equal(pendingWard(app, 'mage', 'hero'), null);
  const ward = pendingWard(app, 'mage', 'evoker', 'magic-missile');
  assert.equal(ward?.bonus, 0);
  assert.equal(ward?.blocks, true);
});

test('offerWard casts with no slot for a slotless plan, and raises nothing for a defender gone after the cast', async () => {
  const app = stubApp();
  const ward = /** @type {any} */ (pendingWard(app, 'mage', 'hero'));
  /** @type {any[]} */
  const values = [];
  const raised = await offerWard(app, { ...ward, plan: { ...ward.plan, slotLevels: [] } }, 'Hit.', {
    cast: /** @type {any} */ (
      async (/** @type {any} */ _app, /** @type {any} */ _plan, /** @type {any} */ v) => {
        values.push(v);
        app.state.characters = app.state.characters.filter((c) => c.id !== 'mage');
      }
    ),
    ask: async () => true,
  });
  assert.deepEqual(values, [{ target: 'mage' }]);
  assert.equal(raised, 0);
});

test('an attack spell outcome with no target id asks nothing', () => {
  const app = stubApp();
  const outcomes = [{ target: { name: 'Shadow' }, hit: true, attack: { total: 15 }, ac: 12 }];
  const out = wardSpellAttack(app, spellById('fire-bolt'), { outcomes }, 'evoker', {
    cast: resolveCast,
    ask: never,
  });
  assert.equal(out, null);
});
