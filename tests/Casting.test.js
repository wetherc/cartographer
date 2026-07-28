import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TARGET_COUNT,
  canCast,
  cantripStep,
  castSpell,
  maxTargets,
  normalizeTargetCount,
} from '../src/entities/Casting.js';
import { createResource } from '../src/entities/Resource.js';

/**
 * A deterministic RNG that replays a queue of unit values, one per call, so a
 * test fixes each die. `roll`/`rollDamage` compute `floor(rng() * sides) + 1`,
 * so 0 yields the minimum face and a value just under 1 yields the maximum.
 * Past the queue it returns 0 (minimum faces).
 * @param {number[]} values
 * @returns {() => number}
 */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** rng() value that makes a d`sides` roll come up `face`. */
function face(sides, value) {
  return (value - 1) / sides + 1e-9;
}

/** @param {Partial<import('../src/types/entities.js').Character>} over */
function caster(over = {}) {
  return /** @type {any} */ ({
    id: 'c',
    name: 'Mage',
    race: 'human',
    class: 'wizard',
    level: 5,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 16, WIS: 10, CHA: 10 },
    resources: [createResource('slots-1', 'Level 1 slots', 'mana', 4)],
    inventory: [],
    conditions: [],
    spellbook: { cantrips: ['firebolt'], known: [], prepared: ['burning-hands', 'cure-wounds'] },
    ...over,
  });
}

/** @type {import('../src/types/spell.js').Spell} */
const firebolt = {
  id: 'firebolt',
  name: 'Fire Bolt',
  level: 0,
  school: 'evocation',
  classes: ['wizard'],
  castingTime: 'action',
  range: '120 ft',
  components: ['V', 'S'],
  duration: 'Instant',
  concentration: false,
  ritual: false,
  description: '',
  effect: { kind: 'attack', damage: [{ count: 1, sides: 10, damageType: 'fire' }] },
  scaling: { damagePerLevel: [{ count: 1, sides: 10, damageType: 'fire' }] },
};

/** @type {import('../src/types/spell.js').Spell} */
const burningHands = {
  id: 'burning-hands',
  name: 'Burning Hands',
  level: 1,
  school: 'evocation',
  classes: ['wizard'],
  castingTime: 'action',
  range: '15 ft',
  components: ['V', 'S'],
  duration: 'Instant',
  concentration: false,
  ritual: false,
  description: '',
  // An area spell, as the shipped entry is: the cone catches whoever stands in
  // it, so the cast has no target cap of its own.
  targetCount: 0,
  effect: {
    kind: 'save',
    saveAbility: 'DEX',
    damage: [{ count: 3, sides: 6, damageType: 'fire' }],
    halfOnSave: true,
  },
  scaling: { damagePerLevel: [{ count: 1, sides: 6, damageType: 'fire' }] },
};

/** @type {import('../src/types/spell.js').Spell} */
const cureWounds = {
  id: 'cure-wounds',
  name: 'Cure Wounds',
  level: 1,
  school: 'evocation',
  classes: ['cleric'],
  castingTime: 'action',
  range: 'Touch',
  components: ['V', 'S'],
  duration: 'Instant',
  concentration: false,
  ritual: false,
  description: '',
  effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'healing' }] },
  scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'healing' }] },
};

test('castSpell reports no-slot when the caster has no pool at that level', () => {
  // The default caster carries only a 1st-level pool; casting at 2nd finds none.
  const result = castSpell(caster(), burningHands, { slotLevel: 2, rng: seq([0]) });
  assert.deepEqual(result, { ok: false, reason: 'no-slot' });
});

test('castSpell defaults a missing caster level when casting a cantrip', () => {
  const result = castSpell(caster({ level: undefined }), firebolt, {
    targets: [{ id: 't', name: 'Orc', ac: 5 }],
    rng: seq([0.99]),
  });
  assert.equal(result.ok, true);
  assert.equal(result.spent, false, 'a cantrip spends no slot');
});

test('castSpell defaults a target with no AC to 10', () => {
  const result = castSpell(caster(), firebolt, {
    targets: [{ id: 't', name: 'Blob' }],
    spellAttackBonus: 20,
    rng: seq([0.5]),
  });
  assert.equal(result.outcomes[0].ac, 10);
});

test('castSpell defaults a target with no save bonus or mode, and negates on a full save', () => {
  const noHalf = { ...burningHands, effect: { ...burningHands.effect, halfOnSave: false } };
  const result = castSpell(caster(), noHalf, {
    slotLevel: 1,
    saveDC: 1, // any d20 clears this, so the target saves
    targets: [{ id: 't', name: 'Nimble' }],
    rng: seq([0.99, 0, 0, 0]),
  });
  const outcome = result.outcomes[0];
  assert.equal(outcome.saved, true);
  assert.equal(outcome.taken, 0, 'a full save negates a non-halving spell');
});

test('cantripStep follows the 5/11/17 breakpoints', () => {
  assert.equal(cantripStep(1), 0);
  assert.equal(cantripStep(4), 0);
  assert.equal(cantripStep(5), 1);
  assert.equal(cantripStep(10), 1);
  assert.equal(cantripStep(11), 2);
  assert.equal(cantripStep(17), 3);
  assert.equal(cantripStep(20), 3);
});

test('maxTargets counts a spell against its own cap, not its dice', () => {
  // Nothing written means one creature; that is what every entry authored before
  // the field existed reads as.
  assert.equal(maxTargets(cureWounds, 0), 1);
  assert.equal(maxTargets(cureWounds, 4), 1, 'damage scaling alone adds no targets');
  // 0 marks an area: the map decides how many are caught, so there is no cap.
  assert.equal(maxTargets(burningHands, 0), Infinity);
  assert.equal(maxTargets({ ...cureWounds, targetCount: 6 }, 3), 6);
  // A spell that scales targets gains one per increment, whether the increment
  // comes from a higher slot or from a cantrip's caster-level step.
  const chain = { ...cureWounds, targetCount: 3, scaling: { targetsPerLevel: 1 } };
  assert.equal(maxTargets(chain, 0), 3);
  assert.equal(maxTargets(chain, 2), 5);
  assert.equal(maxTargets(chain, -1), 3, 'a negative step cannot shrink the cap');
});

test('normalizeTargetCount keeps a deliberate 0 and falls back on nothing written', () => {
  assert.equal(normalizeTargetCount(''), 1, 'a blank field means the spell says nothing');
  assert.equal(normalizeTargetCount(undefined), 1);
  assert.equal(normalizeTargetCount(null), 1);
  assert.equal(normalizeTargetCount('not a number'), 1);
  assert.equal(normalizeTargetCount('0'), 0, '0 is the area marker, not a missing value');
  assert.equal(normalizeTargetCount(-4), 0);
  assert.equal(normalizeTargetCount('3.7'), 3);
  assert.equal(normalizeTargetCount(500), MAX_TARGET_COUNT);
  assert.equal(normalizeTargetCount('', 0), 0, 'the fallback is the caller’s to choose');
});

test('a cast past the spell’s cap drops the extra targets and reports how many', () => {
  const pair = { ...firebolt, targetCount: 2 };
  const result = castSpell(caster(), pair, {
    targets: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    spellAttackBonus: 20,
    rng: seq([0.5, 0.5]),
  });
  assert.equal(result.ok, true);
  assert.equal(result.truncated, 1);
  assert.deepEqual(
    result.targets.map((t) => t.id),
    ['a', 'b'],
  );
  assert.equal(result.outcomes.length, 2, 'no roll is made for a dropped target');
});

test('an area spell takes every target it is given, and a single-target spell one', () => {
  const three = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const area = castSpell(caster(), burningHands, { slotLevel: 1, targets: three, rng: seq([]) });
  assert.equal(area.truncated, 0);
  assert.equal(area.outcomes.length, 3);

  const single = castSpell(caster(), cureWounds, { slotLevel: 1, targets: three, rng: seq([]) });
  assert.equal(single.truncated, 2);
  assert.equal(single.outcomes.length, 1);
});

test('each target of an attack spell rolls its own d20', () => {
  const pair = { ...firebolt, targetCount: 2 };
  // AC 15 for both: the first rolls a 20 and hits, the second a 2 and misses.
  const result = castSpell(caster(), pair, {
    targets: [
      { id: 'a', ac: 15 },
      { id: 'b', ac: 15 },
    ],
    rng: seq([face(20, 20), 0, 0, face(20, 2)]),
  });
  const [a, b] = result.outcomes;
  assert.equal(a.hit, true);
  assert.equal(a.crit, true);
  assert.equal(b.hit, false);
  assert.equal(b.damage, null, 'a missed target takes no damage of its own');
});

test('canCast checks cantrips and prepared/known lists', () => {
  const c = caster();
  assert.equal(canCast(c, firebolt), true); // cantrip listed
  assert.equal(canCast(c, burningHands), true); // prepared
  assert.equal(canCast(c, { ...firebolt, id: 'unlisted' }), false);
  const noBook = caster({ spellbook: { cantrips: [], known: [], prepared: [] } });
  assert.equal(canCast(noBook, burningHands), false);
});

test('cantrip attack hits, doubles dice on a crit, spends no slot', () => {
  // d20 natural 20 -> crit; then two d10 damage dice both max (10).
  const rng = seq([face(20, 20), face(10, 10), face(10, 10), face(10, 10), face(10, 10)]);
  const result = castSpell(caster(), firebolt, {
    slotLevel: 0,
    spellAttackBonus: 5,
    casterLevel: 5, // one scaling step: 2 dice total
    targets: [{ id: 't', ac: 15 }],
    rng,
  });
  assert.equal(result.ok, true);
  assert.equal(result.spent, false);
  // slot pool untouched
  assert.equal(result.caster.resources[0].current, 4);
  const [o] = result.outcomes;
  assert.equal(o.crit, true);
  assert.equal(o.hit, true);
  // 2 base+scaled dice, doubled by crit = 4 d10 at max = 40
  assert.equal(o.damage.total, 40);
});

test('attack miss deals no damage', () => {
  const rng = seq([face(20, 2)]); // total 2 + 0 bonus vs AC 15
  const result = castSpell(caster(), firebolt, {
    slotLevel: 0,
    spellAttackBonus: 0,
    casterLevel: 1,
    targets: [{ id: 't', ac: 15 }],
    rng,
  });
  const [o] = result.outcomes;
  assert.equal(o.hit, false);
  assert.equal(o.damage, null);
});

test('natural 1 always misses even above AC', () => {
  const rng = seq([face(20, 1)]);
  const result = castSpell(caster(), firebolt, {
    slotLevel: 0,
    spellAttackBonus: 100,
    casterLevel: 1,
    targets: [{ id: 't', ac: 5 }],
    rng,
  });
  assert.equal(result.outcomes[0].hit, false);
});

test('save spell: failure takes full, success takes half, slot spent', () => {
  // damage rolled once: 3d6 all max = 18. Then two targets save.
  const rng = seq([
    face(6, 6),
    face(6, 6),
    face(6, 6), // damage 18
    face(20, 1), // target A save total 1 -> fail
    face(20, 20), // target B save total 20 -> success
  ]);
  const result = castSpell(caster(), burningHands, {
    slotLevel: 1,
    saveDC: 15,
    targets: [
      { id: 'a', saveBonus: 0 },
      { id: 'b', saveBonus: 0 },
    ],
    rng,
  });
  assert.equal(result.ok, true);
  assert.equal(result.spent, true);
  assert.equal(result.caster.resources[0].current, 3); // one slot spent
  const [a, b] = result.outcomes;
  assert.equal(a.saved, false);
  assert.equal(a.taken, 18);
  assert.equal(b.saved, true);
  assert.equal(b.taken, 9); // half, floored
});

test('save spell condition applies only on a failed save', () => {
  const rng = seq([face(6, 1), face(6, 1), face(6, 1), face(20, 1)]);
  const spell = {
    ...burningHands,
    effect: { ...burningHands.effect, halfOnSave: false, condition: 'Prone' },
  };
  const result = castSpell(caster(), spell, {
    slotLevel: 1,
    saveDC: 15,
    targets: [{ id: 'a', saveBonus: 0 }],
    rng,
  });
  assert.equal(result.outcomes[0].condition, 'Prone');
});

test('upcasting a save spell adds a die per slot level above base', () => {
  // cast at slot 3 (2 above base): 3d6 base + 2d6 scaled = 5d6, all min = 5.
  const rng = seq([0, 0, 0, 0, 0, face(20, 20)]);
  const c = caster({
    resources: [createResource('slots-3', 'Level 3 slots', 'mana', 2)],
  });
  const result = castSpell(c, burningHands, {
    slotLevel: 3,
    saveDC: 30,
    targets: [{ id: 'a', saveBonus: 0 }],
    rng,
  });
  assert.equal(result.outcomes[0].taken, 5);
});

test('heal rolls once and applies to every target', () => {
  const rng = seq([face(8, 8)]); // 1d8 = 8
  // Cure Wounds itself touches one creature; a two-target count stands in for the
  // mass variant so the shared-roll behavior is what is under test.
  const massCure = { ...cureWounds, targetCount: 2 };
  const result = castSpell(caster(), massCure, {
    slotLevel: 1,
    targets: [{ id: 'a' }, { id: 'b' }],
    rng,
  });
  assert.equal(result.outcomes.length, 2);
  assert.equal(result.outcomes[0].healing.total, 8);
  assert.equal(result.outcomes[1].healing.total, 8);
});

test('rejects an unknown spell, a low slot level, and an empty slot pool', () => {
  assert.deepEqual(castSpell(caster(), { ...firebolt, id: 'x', level: 1 }, { slotLevel: 1 }), {
    ok: false,
    reason: 'not-known',
  });
  assert.deepEqual(castSpell(caster(), burningHands, { slotLevel: 0 }), {
    ok: false,
    reason: 'bad-slot-level',
  });
  const drained = caster({ resources: [createResource('slots-1', 'L1', 'mana', 0)] });
  assert.deepEqual(castSpell(drained, burningHands, { slotLevel: 1 }), {
    ok: false,
    reason: 'no-slot',
  });
});

test('a cast falls back to the pact pool when the leveled slot is drained', () => {
  const drainedLeveled = { ...createResource('slots-1', 'L1', 'mana', 4), current: 0 };
  const pact = createResource('pact-1', 'Pact slots (level 1)', 'mana', 2);
  const lock = caster({ resources: [drainedLeveled, pact] });

  const result = castSpell(lock, burningHands, { slotLevel: 1, rng: seq([]) });
  assert.equal(result.ok, true);
  const pools = /** @type {any} */ (result).caster.resources;
  assert.equal(pools.find((/** @type {any} */ r) => r.id === 'pact-1').current, 1);
  assert.equal(pools.find((/** @type {any} */ r) => r.id === 'slots-1').current, 0);

  // With a leveled charge left, the leveled pool is preferred over pact.
  const both = caster({
    resources: [createResource('slots-1', 'L1', 'mana', 4), pact],
  });
  const preferred = castSpell(both, burningHands, { slotLevel: 1, rng: seq([]) });
  const after = /** @type {any} */ (preferred).caster.resources;
  assert.equal(after.find((/** @type {any} */ r) => r.id === 'slots-1').current, 3);
  assert.equal(after.find((/** @type {any} */ r) => r.id === 'pact-1').current, 2);

  // Both drained: no-slot.
  const empty = caster({ resources: [drainedLeveled, { ...pact, current: 0 }] });
  assert.deepEqual(castSpell(empty, burningHands, { slotLevel: 1 }), {
    ok: false,
    reason: 'no-slot',
  });
});

test('utility spell resolves with no outcomes and spends its slot', () => {
  const spell = {
    ...burningHands,
    id: 'mage-armor',
    effect: { kind: 'utility' },
  };
  const c = caster({ spellbook: { cantrips: [], known: [], prepared: ['mage-armor'] } });
  const result = castSpell(c, /** @type {any} */ (spell), { slotLevel: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.outcomes, []);
  assert.equal(result.caster.resources[0].current, 3);
});
