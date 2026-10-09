import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preserveLife, turnUndead } from '../src/app/channelDivinity.js';
import { createCharacter, damageCharacter, getHP, withHP } from '../src/entities/Character.js';
import { findCombatant } from '../src/app/combatants.js';
import { canSpend, spend } from '../src/combat/ActionBudget.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { stubApp } from './helpers/app.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** An undead foe of a given CR. */
const undead = (/** @type {string} */ id, /** @type {number} */ cr) => ({
  ...createCreature(id, 'Skeleton', {
    disposition: 'hostile',
    maxHP: 13,
    stats: { AC: 13 },
    location: HERE,
    level: 1,
  }),
  creatureType: 'undead',
  cr,
});

/** A level-5 cleric with one Channel Divinity use, in a fight with undead. */
function fight() {
  const cleric = /** @type {any} */ ({
    id: 'mirelle',
    name: 'Mirelle',
    classes: [{ classId: 'cleric', level: 5, subclass: 'Life Domain' }],
    level: 5,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 16, CHA: 10 },
    conditions: [],
    inventory: [],
    resources: [createResource('channel-divinity', 'Channel Divinity', 'mana', 1)],
  });
  const app = stubApp({
    state: /** @type {any} */ ({
      characters: [cleric],
      creatures: [
        undead('s1', 0.25),
        undead('s2', 3),
        { ...undead('z', 1), creatureType: 'beast' },
      ],
      combat: {
        order: ['mirelle', 's1', 's2', 'z'].map((id) => ({ id, initiative: 10, modifier: 0 })),
        index: 0,
        round: 1,
      },
    }),
  });
  app.actions.spendBudget = (/** @type {string} */ id, /** @type {any} */ cost) => {
    const combat = app.state.combat;
    const i = combat.order.findIndex((/** @type {any} */ p) => p.id === id);
    if (!canSpend(combat.order[i], cost)) return false;
    const order = [...combat.order];
    order[i] = spend(order[i], cost);
    app.state.combat = { ...combat, order };
    return true;
  };
  return app;
}

const found = (/** @type {any} */ app) => /** @type {any} */ (findCombatant(app, 'mirelle'));

/** The Channel Divinity uses left. */
const uses = (/** @type {any} */ app) =>
  app.state.characters[0].resources.find((/** @type {any} */ r) => r.id === 'channel-divinity')
    ?.current;

test('Turn Undead lists the undead, turns one, and destroys one of a low CR', async () => {
  const app = fight();
  /** @type {any[]} */
  const asked = [];
  const prompt = /** @type {any} */ (
    async (/** @type {string} */ title, /** @type {any[]} */ fields) => {
      asked.push({ title, fields });
      return { targets: fields[0].value };
    }
  );
  const ok = await turnUndead(app, found(app), { prompt, rng: () => 0 });
  assert.equal(ok, true);
  assert.deepEqual(
    asked[0].fields[0].options.map((/** @type {any} */ o) => o.value),
    ['s1', 's2'],
    'only the undead, all ticked',
  );
  assert.equal(asked[0].fields[0].value, 's1,s2');
  assert.equal(uses(app), 0);
  assert.ok(
    app.log.some((l) => /^Mirelle uses Channel Divinity: Turn Undead \(DC 14\)\.$/.test(l)),
  );
  assert.ok(
    app.log.some((l) => /^Skeleton 1 is destroyed/.test(l)),
    'CR 1/4 at cleric level 5',
  );
  assert.ok(app.log.some((l) => /^Skeleton 2 is turned/.test(l)));
  const chip = app.state.creatures.find((c) => c.id === 's2')?.conditions[0];
  assert.equal(chip?.name, 'Turned');
  assert.equal(chip?.source?.spellName, 'Turn Undead');
  assert.equal(chip?.source?.endsOnDamage, true);
});

test('a cancelled Turn Undead keeps the use and the action', async () => {
  const app = fight();
  const ok = await turnUndead(app, found(app), { prompt: /** @type {any} */ (async () => null) });
  assert.equal(ok, false);
  assert.equal(uses(app), 1);
  assert.equal(app.log.length, 0);
});

test('a made save leaves the undead alone', async () => {
  const app = fight();
  const prompt = /** @type {any} */ (async () => ({ targets: 's2' }));
  await turnUndead(app, found(app), { prompt, rng: () => 0.99 });
  assert.ok(app.log.some((l) => /^Skeleton 2 resists the turning/.test(l)));
  assert.deepEqual(app.state.creatures.find((c) => c.id === 's2')?.conditions, []);
});

test('Turn Undead with no undead in the fight, or no action left, spends nothing', async () => {
  const app = fight();
  app.state.creatures = app.state.creatures.filter((c) => c.creatureType !== 'undead');
  assert.equal(
    await turnUndead(app, found(app), { prompt: /** @type {any} */ (async () => ({})) }),
    false,
  );
  const busy = fight();
  busy.actions.spendBudget('mirelle', 'action');
  const prompt = /** @type {any} */ (async () => ({ targets: 's1' }));
  assert.equal(await turnUndead(busy, found(busy), { prompt }), false);
  assert.equal(uses(busy), 1);
});

test('Preserve Life shares HP within each cap and the budget', async () => {
  const app = fight();
  const hurt = damageCharacter(withHP(createCharacter('bran', 'Brannoc'), 30), 28);
  app.state.characters = [withHP(app.state.characters[0], 30), hurt];
  app.state.combat.order = [...app.state.combat.order, { id: 'bran', initiative: 5, modifier: 0 }];
  /** @type {any[]} */
  const asked = [];
  const prompt = /** @type {any} */ (
    async (/** @type {string} */ title, /** @type {any[]} */ fields, /** @type {any} */ o) => {
      asked.push({ fields, o });
      return { bran: '13' };
    }
  );
  assert.equal(await preserveLife(app, found(app), { prompt }), true);
  assert.deepEqual(
    asked[0].fields.map((/** @type {any} */ f) => [f.name, f.max]),
    [['bran', 13]],
    'the cleric at full HP and the undead foes get no row',
  );
  assert.match(asked[0].o.message, /up to 25 HP/);
  assert.equal(getHP(app.state.characters[1]).current, 15);
  assert.ok(app.log.some((l) => /Preserve Life \(13 of 25 HP\)/.test(l)));
  assert.equal(uses(app), 0);
});

test('Preserve Life refuses a share-out over a cap and spends nothing', async () => {
  const app = fight();
  const hurt = damageCharacter(withHP(createCharacter('bran', 'Brannoc'), 30), 28);
  app.state.characters = [withHP(app.state.characters[0], 30), hurt];
  app.state.combat.order = [...app.state.combat.order, { id: 'bran', initiative: 5, modifier: 0 }];
  const prompt = /** @type {any} */ (async () => ({ bran: '14' }));
  assert.equal(await preserveLife(app, found(app), { prompt }), false);
  assert.equal(uses(app), 1);
  const whole = fight();
  whole.state.characters = [withHP(whole.state.characters[0], 30)];
  assert.equal(await preserveLife(whole, found(whole), { prompt }), false, 'nobody to heal');
});

test('Turn Resistance rolls the save against Turn Undead with advantage', async () => {
  const app = fight();
  app.state.creatures = app.state.creatures.map((c) =>
    c.id === 's2' ? { ...c, turnResistance: true } : c,
  );
  // Each roll draws a low die and then a high one. Only the resistant undead
  // rolls twice, so it keeps the high die and saves.
  const draws = [0, 0.99, 0, 0.99];
  const rng = () => draws.shift() ?? 0;
  const prompt = /** @type {any} */ (async () => ({ targets: 's2' }));
  assert.equal(await turnUndead(app, found(app), { prompt, rng }), true);
  assert.ok(
    app.log.some((l) => /^Skeleton 2 resists the turning/.test(l)),
    app.log.join('\n'),
  );
});

test('Turn Resistance loads only as true', async () => {
  const { attackTraitFields } = await import('../src/entities/CreatureAttacks.js');
  assert.deepEqual(attackTraitFields({ turnResistance: true }), { turnResistance: true });
  assert.deepEqual(attackTraitFields({ turnResistance: 'yes' }), {});
});

test('a legendary undead can use legendary resistance against Turn Undead', async () => {
  const app = fight();
  app.state.creatures = app.state.creatures.map((/** @type {any} */ c) =>
    c.id === 's2' ? { ...c, legendaryResistance: 1 } : c,
  );
  const prompt = /** @type {any} */ (async () => ({ targets: 's2' }));
  /** @type {string[]} */
  const asked = [];
  const ask = async (/** @type {string} */ message) => {
    asked.push(message);
    return true;
  };
  assert.equal(await turnUndead(app, found(app), { prompt, rng: () => 0, ask }), true);
  assert.deepEqual(asked, [
    'Skeleton 2 fails the WIS save against Turn Undead (DC 14). Use legendary resistance? 1 left today.',
  ]);
  const s2 = app.state.creatures.find((/** @type {any} */ c) => c.id === 's2');
  assert.equal(s2.legendaryResistanceUsed, 1);
  assert.equal(s2.conditions.length, 0, 'no Turned chip');
  assert.ok(app.log.some((l) => /^Skeleton 2 uses legendary resistance/.test(l)));
  assert.ok(app.log.some((l) => /^Skeleton 2 resists the turning/.test(l)));
});

test('a legendary undead that lets the save fail is turned', async () => {
  const app = fight();
  app.state.creatures = app.state.creatures.map((/** @type {any} */ c) =>
    c.id === 's2' ? { ...c, legendaryResistance: 1 } : c,
  );
  const prompt = /** @type {any} */ (async () => ({ targets: 's2' }));
  await turnUndead(app, found(app), { prompt, rng: () => 0, ask: async () => false });
  const s2 = app.state.creatures.find((/** @type {any} */ c) => c.id === 's2');
  assert.equal(s2.legendaryResistanceUsed, undefined);
  assert.ok(app.log.some((l) => /^Skeleton 2 is turned/.test(l)));
});

test('Turn Undead and Preserve Life do nothing outside a fight', async () => {
  const app = fight();
  const cleric = found(app);
  app.state.combat = null;
  const prompt = /** @type {any} */ (async () => ({ targets: 's1' }));
  assert.equal(await turnUndead(app, cleric, { prompt }), false);
  assert.equal(await preserveLife(app, cleric, { prompt }), false);
  assert.equal(uses(app), 1);
});

test('a Turn Undead pick that names no fighter in the list is skipped', async () => {
  const app = fight();
  const prompt = /** @type {any} */ (async () => ({ targets: 'ghost, ,s1' }));
  assert.equal(await turnUndead(app, found(app), { prompt, rng: () => 0 }), true);
  assert.equal(uses(app), 0);
  assert.ok(app.log.some((l) => /^Skeleton/.test(l)));
});
