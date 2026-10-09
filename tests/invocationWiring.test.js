import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castPlan } from '../src/app/castPlan.js';
import { resolveCast } from '../src/app/spellCastResolve.js';
import { rosterTargets } from '../src/app/spellTargets.js';
import { spellsOf } from '../src/app/combatants.js';
import { armorClass } from '../src/entities/Armor.js';
import { longRest } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { createResource } from '../src/entities/Resource.js';
import { replaceById } from '../src/entities/Roster.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * The wiring of the eldritch invocations: a spell cast at will with no slot,
 * a spell cast once per long rest with a slot, and the invocations that
 * change Eldritch Blast.
 */

const HERE = { nodeId: 'n1', tileId: '0,0' };

/** A deterministic RNG that replays a queue of unit values, then returns 0. */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

const d20 = (value) => (value - 1) / 20 + 1e-9;

/** A 9th-level warlock with CHA 16, two 5th-level pact slots, and no leveled spells. */
function warlock(invocations) {
  return /** @type {any} */ ({
    id: 'wren',
    name: 'Wren',
    race: 'human',
    classes: [{ classId: 'warlock', level: 9 }],
    level: 9,
    xp: 0,
    stats: { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 16 },
    resources: [
      createResource('hp', 'Hit points', 'health', 40),
      createResource('pact-5', 'Pact slots', 'mana', 2),
    ],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: ['eldritch-blast'], known: [], prepared: [] },
    proficiencies: undefined,
    invocations,
  });
}

function stubApp(invocations) {
  /** @type {string[]} */
  const toasted = [];
  const app = baseStubApp({
    state: {
      characters: [warlock(invocations)],
      creatures: [
        createCreature('ogre', 'Ogre', {
          disposition: 'hostile',
          maxHP: 60,
          stats: { AC: 12 },
          location: HERE,
          level: 1,
        }),
      ],
    },
    partyTracker: /** @type {any} */ ({ getPosition: () => HERE }),
    toasts: { show: (/** @type {string} */ message) => toasted.push(message) },
  });
  return Object.assign(app, { toasted });
}

const wren = (app) => app.state.characters[0];
const listed = (app, id) => spellsOf(app, 'wren').find((s) => s.id === id);

function plan(app, id) {
  const spell = listed(app, id);
  return /** @type {any} */ (castPlan(app, wren(app), spell, rosterTargets(app, spell, 'wren')));
}

function cast(app, id, values, rng = () => 0.5) {
  const p = plan(app, id);
  assert.equal(p.ok, true, p.message);
  resolveCast(app, p, /** @type {any} */ (values), {
    rng,
    writeBack: (next) => {
      app.state.characters = replaceById(app.state.characters, next);
    },
  });
  return p;
}

test('the spell list offers the invocation spells, and Eldritch Blast as they change it', () => {
  const app = stubApp(['armor-of-shadows', 'agonizing-blast', 'eldritch-spear']);
  const blast = listed(app, 'eldritch-blast');
  assert.equal(blast.effect.addsModifier, true);
  assert.equal(blast.range, '300 feet');
  assert.equal(listed(app, 'mage-armor').range, 'Self');
});

test('Armor of Shadows casts Mage Armor on the warlock at will, with no slot and no material', () => {
  const app = stubApp(['armor-of-shadows']);
  const before = armorClass(wren(app));
  const p = cast(app, 'mage-armor', { target: 'wren' });
  assert.deepEqual(p.free, { slotLevel: 1 });
  assert.equal(p.material.required, false);
  assert.deepEqual(
    p.targets.map((t) => t.id),
    ['wren'],
  );
  assert.equal(
    p.fields.some((f) => f.name === 'slot'),
    false,
  );
  assert.equal(wren(app).resources.find((r) => r.id === 'pact-5').current, 2);
  assert.equal(armorClass(wren(app)), before + 3);
  assert.ok(app.log.includes('Wren casts Mage Armor (Armor of Shadows).'), app.log.join('\n'));
});

test('an at-will concentration spell still starts concentration', () => {
  const app = stubApp(['ascendant-step']);
  cast(app, 'levitate', {});
  assert.equal(wren(app).concentration?.spellId, 'levitate');
});

test('Thief of Five Fates casts Bane with a pact slot, once per long rest', () => {
  const app = stubApp(['thief-of-five-fates']);
  const p = cast(app, 'bane', { slot: '5', targets: 'ogre', 'ignore-components': '1' }, () => 0);
  assert.equal(p.free, null);
  assert.equal(p.sourceClass, 'warlock');
  assert.equal(wren(app).resources.find((r) => r.id === 'pact-5').current, 1);
  assert.deepEqual(wren(app).invocationUses, ['thief-of-five-fates']);
  assert.ok(
    app.log.includes('Wren casts Bane at level 5 (Thief of Five Fates).'),
    app.log.join('\n'),
  );
  const again = plan(app, 'bane');
  assert.deepEqual(again, {
    ok: false,
    message: 'Thief of Five Fates is spent until a long rest.',
  });
  app.state.characters = app.state.characters.map(longRest);
  assert.equal(plan(app, 'bane').ok, true);
});

test('a once-per-rest spell that the spellbook also has casts the usual way', () => {
  const app = stubApp(['thief-of-five-fates']);
  app.state.characters = [
    { ...wren(app), spellbook: { cantrips: ['eldritch-blast'], known: ['bane'], prepared: [] } },
  ];
  const p = cast(app, 'bane', { slot: '5', targets: 'ogre', 'ignore-components': '1' }, () => 0);
  assert.equal(p.invocation, null);
  assert.equal('invocationUses' in wren(app), false);
  assert.ok(app.log.includes('Wren casts Bane at level 5.'));
});

test('Agonizing Blast adds CHA to each beam, and Repelling Blast notes the push', () => {
  const hp = (app) => app.state.creatures[0].currentHP;
  const rolls = [d20(15), d20(15), 0.5, 0.5];
  const plain = stubApp(['repelling-blast']);
  cast(plain, 'eldritch-blast', { allocation: 'ogre:2' }, seq(rolls));
  const agonizing = stubApp(['repelling-blast', 'agonizing-blast']);
  cast(agonizing, 'eldritch-blast', { allocation: 'ogre:2' }, seq(rolls));
  assert.equal(hp(plain) - hp(agonizing), 6);
  assert.ok(
    plain.log.includes('Ogre can be pushed up to 20 feet (Repelling Blast).'),
    plain.log.join('\n'),
  );
});

test('an Eldritch Blast that misses notes no push', () => {
  const app = stubApp(['repelling-blast']);
  cast(app, 'eldritch-blast', { allocation: 'ogre:2' }, () => 0);
  assert.equal(
    app.log.some((line) => line.includes('pushed')),
    false,
    app.log.join('\n'),
  );
});
