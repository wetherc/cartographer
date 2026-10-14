import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castSpell } from '../src/entities/Casting.js';
import { scalingSteps } from '../src/entities/CastScaling.js';
import { createResource } from '../src/entities/Resource.js';
import { DEFAULT_SPELLS } from '../src/data/spells.js';

/**
 * The resolver's side of the spells that reach past the turn they are cast
 * on: damage left for later turns, a splash on a miss, a flat modifier on a
 * hit, scaling every two slot levels, and a free cast that a repeat uses.
 */

/** A deterministic RNG that replays a queue of unit values, then returns 0. */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** The rng value that makes a d`sides` roll come up `value`. */
const face = (sides, value) => (value - 1) / sides + 1e-9;

const spellById = (id) => /** @type {any} */ (DEFAULT_SPELLS.find((s) => s.id === id));

/** A wizard and cleric who knows every spell here, with 2nd- and 4th-level slots. */
function caster() {
  return /** @type {any} */ ({
    id: 'c',
    name: 'Caster',
    classes: [{ classId: 'wizard', level: 9 }],
    level: 9,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 16, CHA: 10 },
    resources: [
      createResource('slots-2', 'Level 2 slots', 3),
      createResource('slots-4', 'Level 4 slots', 3),
    ],
    inventory: [],
    conditions: [],
    spellbook: {
      cantrips: [],
      known: [],
      prepared: ['acid-arrow', 'spiritual-weapon', 'phantasmal-killer'],
    },
  });
}

test('Spiritual Weapon gains a die every two slot levels, not every one', () => {
  const weapon = spellById('spiritual-weapon');
  assert.equal(scalingSteps(weapon, 2, 9), 0);
  assert.equal(scalingSteps(weapon, 3, 9), 0);
  assert.equal(scalingSteps(weapon, 4, 9), 1);
  assert.equal(scalingSteps(weapon, 7, 9), 2);
});

test('a spell that adds the modifier adds it once to a hit, and a crit does not double it', () => {
  const result = castSpell(caster(), spellById('spiritual-weapon'), {
    slotLevel: 2,
    targets: [{ id: 'ogre', name: 'Ogre', ac: 5 }],
    spellAttackBonus: 5,
    spellModifier: 3,
    rng: seq([face(20, 20), face(8, 4), face(8, 4)]),
  });
  assert.ok(result.ok);
  const [hit] = /** @type {any[]} */ (result.outcomes);
  assert.equal(hit.crit, true);
  assert.equal(hit.damage.total, 4 + 4 + 3);
});

test('Acid Arrow leaves its later dice on a hit, grown with the slot', () => {
  const result = castSpell(caster(), spellById('acid-arrow'), {
    slotLevel: 4,
    targets: [{ id: 'ogre', name: 'Ogre', ac: 5 }],
    spellAttackBonus: 5,
    rng: seq([face(20, 15)]),
  });
  assert.ok(result.ok);
  const [hit] = /** @type {any[]} */ (result.outcomes);
  assert.equal(hit.hit, true);
  assert.deepEqual(hit.ongoing, [
    { count: 2, sides: 4, damageType: 'acid' },
    { count: 1, sides: 4, damageType: 'acid' },
    { count: 1, sides: 4, damageType: 'acid' },
  ]);
  assert.equal(hit.halved, undefined);
});

test('Acid Arrow splashes on a miss and leaves nothing for later', () => {
  const result = castSpell(caster(), spellById('acid-arrow'), {
    slotLevel: 2,
    targets: [{ id: 'ogre', name: 'Ogre', ac: 30 }],
    spellAttackBonus: 0,
    rng: seq([face(20, 2), face(4, 4), face(4, 4), face(4, 4), face(4, 4)]),
  });
  assert.ok(result.ok);
  const [miss] = /** @type {any[]} */ (result.outcomes);
  assert.equal(miss.hit, false);
  assert.equal(miss.halved, true);
  assert.equal(miss.damage.total, 16);
  assert.equal(miss.ongoing, undefined);
});

test('Phantasmal Killer leaves its later dice only on a failed save', () => {
  // The spell names one creature. Two here show both sides of the save.
  const result = castSpell(
    caster(),
    { ...spellById('phantasmal-killer'), targetCount: 2 },
    {
      slotLevel: 4,
      targets: [
        { id: 'ogre', name: 'Ogre', saveBonus: 0 },
        { id: 'sage', name: 'Sage', saveBonus: 30 },
      ],
      saveDC: 15,
      rng: seq([face(20, 2), face(20, 2)]),
    },
  );
  assert.ok(result.ok);
  const [failed, saved] = /** @type {any[]} */ (result.outcomes);
  assert.equal(failed.condition, 'Frightened');
  assert.deepEqual(failed.ongoing, [{ count: 4, sides: 10, damageType: 'psychic' }]);
  assert.equal(saved.saved, true);
  assert.equal(saved.ongoing, undefined);
});

test('a free cast spends no slot, skips the spellbook, and resolves at the level it names', () => {
  const stranger = { ...caster(), spellbook: { cantrips: [], known: [], prepared: [] } };
  const result = castSpell(stranger, spellById('spiritual-weapon'), {
    free: { slotLevel: 4 },
    targets: [{ id: 'ogre', name: 'Ogre', ac: 5 }],
    spellAttackBonus: 5,
    rng: seq([face(20, 10), face(8, 1), face(8, 1)]),
  });
  assert.ok(result.ok);
  assert.equal(result.spent, false);
  assert.equal(result.slotLevel, 4);
  assert.equal(result.caster, stranger);
  const [hit] = /** @type {any[]} */ (result.outcomes);
  assert.equal(hit.damage.byType[0].rolls.length, 2, 'the 4th-level repeat rolls 2d8');
});
