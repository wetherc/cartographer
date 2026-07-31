import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TARGET_COUNT,
  allocateProjectiles,
  canCast,
  cantripStep,
  castSpell,
  materialCheck,
  maxTargets,
  normalizeMaterials,
  normalizeProjectiles,
  normalizeTargetCount,
  projectileCount,
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
  castingTime: { kind: 'action' },
  range: '120 ft',
  components: ['V', 'S'],
  duration: { kind: 'instantaneous' },
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
  castingTime: { kind: 'action' },
  range: '15 ft',
  components: ['V', 'S'],
  duration: { kind: 'instantaneous' },
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
  castingTime: { kind: 'action' },
  range: 'Touch',
  components: ['V', 'S'],
  duration: { kind: 'instantaneous' },
  concentration: false,
  ritual: false,
  description: '',
  effect: { kind: 'heal', healing: [{ count: 1, sides: 8, damageType: 'healing' }] },
  scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'healing' }] },
};

/** Three separately-rolled rays, one more per slot level above 2nd — the shipped
 * Scorching Ray, whose dice are per ray.
 * @type {import('../src/types/spell.js').Spell} */
const scorchingRay = {
  id: 'scorching-ray',
  name: 'Scorching Ray',
  level: 2,
  school: 'evocation',
  classes: ['wizard'],
  castingTime: { kind: 'action' },
  range: '120 ft',
  components: ['V', 'S'],
  duration: { kind: 'instantaneous' },
  concentration: false,
  ritual: false,
  description: '',
  effect: {
    kind: 'attack',
    damage: [{ count: 2, sides: 6, damageType: 'fire' }],
    projectiles: { count: 3, perStep: 1 },
  },
};

/** A caster with the 2nd-level slots Scorching Ray needs. */
function rayCaster() {
  return caster({
    resources: [createResource('slots-2', 'Level 2 slots', 'mana', 3)],
    spellbook: {
      cantrips: [],
      known: ['scorching-ray', 'darts'],
      prepared: ['scorching-ray', 'darts'],
    },
  });
}

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

test('projectileCount grows with the cast’s scaling steps', () => {
  const effect = /** @type {any} */ (scorchingRay.effect);
  assert.equal(projectileCount(effect, 0), 3);
  assert.equal(projectileCount(effect, 2), 5, 'one more ray per slot level above the spell’s');
  assert.equal(projectileCount(effect, -1), 3, 'a negative step cannot shrink the count');
  assert.equal(projectileCount({ kind: 'attack', damage: [] }, 4), 1, 'no projectiles = one roll');
  assert.equal(
    projectileCount({ kind: 'attack', damage: [], projectiles: { count: 2 } }, 3),
    2,
    'without perStep the count is flat',
  );
});

test('a projectile spell is capped by its projectiles, not its target count', () => {
  assert.equal(maxTargets(scorchingRay, 0), 3, 'each ray may pick its own creature');
  assert.equal(maxTargets(scorchingRay, 2), 5);
  // An area spell stays uncapped even when it fires projectiles, since the map
  // decides who is caught.
  assert.equal(maxTargets({ ...scorchingRay, targetCount: 0 }, 0), Infinity);
});

test('normalizeProjectiles keeps a usable block and drops everything else', () => {
  assert.equal(normalizeProjectiles(undefined), null);
  assert.equal(normalizeProjectiles('three'), null);
  assert.equal(
    normalizeProjectiles({ count: 0 }),
    null,
    'firing nothing is not a projectile spell',
  );
  assert.equal(normalizeProjectiles({ count: 'many' }), null);
  assert.deepEqual(normalizeProjectiles({ count: '3.7' }), { count: 3 });
  assert.deepEqual(normalizeProjectiles({ count: 500, perStep: 500 }), {
    count: MAX_TARGET_COUNT,
    perStep: MAX_TARGET_COUNT,
  });
  assert.deepEqual(normalizeProjectiles({ count: 3, perStep: 0, autoHit: false }), { count: 3 });
  assert.deepEqual(normalizeProjectiles({ count: 3, perStep: 1, autoHit: 'yes' }), {
    count: 3,
    perStep: 1,
    autoHit: true,
  });
});

test('normalizeMaterials keeps a named material and drops an empty block', () => {
  assert.equal(normalizeMaterials(undefined), null);
  assert.equal(normalizeMaterials('a diamond'), null);
  assert.equal(
    normalizeMaterials({ text: '   ', costGP: 0, consumed: false }),
    null,
    'a block naming nothing says no more than the M letter does',
  );
  assert.deepEqual(normalizeMaterials({ text: ' a pinch of sulfur ' }), {
    text: 'a pinch of sulfur',
    consumed: false,
  });
  assert.deepEqual(normalizeMaterials({ text: 'diamonds', costGP: '300.9', consumed: 1 }), {
    text: 'diamonds',
    costGP: 300,
    consumed: true,
  });
  assert.deepEqual(
    normalizeMaterials({ text: 'chalk', costGP: -5 }),
    { text: 'chalk', consumed: false },
    'a negative cost is no cost',
  );
  assert.deepEqual(
    normalizeMaterials({ consumed: true }),
    { text: '', consumed: true },
    'an unnamed consumed material round-trips, and enforces nothing',
  );
});

/** @param {object} materials @returns {import('../src/types/spell.js').Spell} */
function materialSpell(materials) {
  return /** @type {any} */ ({ ...cureWounds, components: ['V', 'S', 'M'], materials });
}

/** @param {string} name @returns {any} an inventory item of that name */
function item(name) {
  return { id: name.toLowerCase(), name, quantity: 1, type: 'gear', weight: 0 };
}

test('materialCheck requires only a consumed material, and finds it by name', () => {
  const spell = materialSpell({ text: 'diamonds worth 300 gp', costGP: 300, consumed: true });
  const holding = caster({ inventory: [item('Rope'), item('Diamond')] });

  const found = materialCheck(holding, spell);
  assert.equal(found.required, true);
  assert.equal(found.satisfied, true);
  assert.equal(found.item?.name, 'Diamond', 'the printed text names the stack it comes from');

  assert.deepEqual(
    materialCheck(caster(), spell),
    { required: true, satisfied: false, item: null },
    'an empty inventory is a character holding nothing, not one exempt from holding it',
  );

  const missing = materialCheck(caster({ inventory: [item('Rope')] }), spell);
  assert.equal(missing.required, true);
  assert.equal(missing.satisfied, false);
  assert.equal(missing.item, null);
});

test('materialCheck leaves an unconsumed material and a component-free spell alone', () => {
  const focus = materialSpell({ text: 'a piece of cured leather', consumed: false });
  const empty = { required: false, satisfied: true, item: null };
  assert.deepEqual(
    materialCheck(caster({ inventory: [item('Rope')] }), focus),
    empty,
    'a pouch or focus covers what the cast does not destroy',
  );
  assert.deepEqual(materialCheck(caster({ inventory: [item('Rope')] }), cureWounds), empty);
  assert.deepEqual(
    materialCheck({}, materialSpell({ text: 'diamonds', consumed: true })),
    empty,
    'an inventory-less combatant is never asked to hold a component',
  );
});

test('allocateProjectiles spreads evenly when the caster states nothing', () => {
  assert.deepEqual(allocateProjectiles([], 3), []);
  assert.deepEqual(allocateProjectiles([{ id: 'a' }], 3), [3], 'the common single-target cast');
  assert.deepEqual(allocateProjectiles([{ id: 'a' }, { id: 'b' }], 3), [2, 1]);
  assert.deepEqual(allocateProjectiles([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 3), [1, 1, 1]);
});

test('a stated allocation is honored and can never exceed what the spell fires', () => {
  const stated = [
    { id: 'a', projectiles: 2 },
    { id: 'b', projectiles: 1 },
  ];
  assert.deepEqual(allocateProjectiles(stated, 3), [2, 1]);
  // Over-allocating spends what is left in order rather than inventing rays.
  assert.deepEqual(allocateProjectiles([{ id: 'a', projectiles: 5 }, { id: 'b' }], 3), [3, 0]);
  // An allocation short of the count fires only what it named; the cast dialog
  // is what refuses to submit a short allocation.
  assert.deepEqual(allocateProjectiles(stated, 5), [2, 1]);
  assert.deepEqual(
    allocateProjectiles([{ id: 'a', projectiles: -2 }, { id: 'b' }], 3),
    [0, 0],
    'once any share is stated, a target without one takes none',
  );
});

test('each projectile rolls its own attack and crits its own dice alone', () => {
  // Three rays at one AC-5 target: a natural 20 crits (2d6 doubled to 4d6), a
  // 15 hits (2d6), a 2 misses. Every damage die comes up 6.
  const rng = seq([
    face(20, 20),
    ...Array(4).fill(face(6, 6)),
    face(20, 15),
    ...Array(2).fill(face(6, 6)),
    face(20, 2),
  ]);
  const result = castSpell(rayCaster(), scorchingRay, {
    slotLevel: 2,
    targets: [{ id: 't', name: 'Orc', ac: 5 }],
    rng,
  });
  assert.equal(result.ok, true);
  const [o] = result.outcomes;
  assert.equal(o.fired, 3);
  assert.equal(o.hits, 2);
  assert.equal(o.shots.length, 3);
  assert.equal(o.shots[0].crit, true);
  assert.equal(o.shots[0].damage.total, 24, 'the crit doubles this ray’s dice only');
  assert.equal(o.shots[1].crit, false);
  assert.equal(o.shots[1].damage.total, 12);
  assert.equal(o.shots[2].hit, false);
  assert.equal(o.shots[2].damage, null);
  assert.equal(o.damage.total, 36, 'the target takes one hit carrying both rays');
  assert.equal(o.damage.detail, '36 fire [6,6,6,6,6,6]');
});

test('every projectile missing leaves the target undamaged', () => {
  const result = castSpell(rayCaster(), scorchingRay, {
    slotLevel: 2,
    targets: [{ id: 't', ac: 30 }],
    rng: seq([face(20, 2), face(20, 3), face(20, 4)]),
  });
  const [o] = result.outcomes;
  assert.equal(o.hits, 0);
  assert.equal(o.hit, false);
  assert.equal(o.damage, null);
});

test('an allocation resolves per target and applies damage once each', () => {
  // Two rays on the first target, one on the second, all three hitting; each
  // ray's 2d6 comes up 6.
  const hit = [face(20, 18), ...Array(2).fill(face(6, 6))];
  const result = castSpell(rayCaster(), scorchingRay, {
    slotLevel: 2,
    targets: [
      { id: 'a', name: 'Orc', ac: 5, projectiles: 2 },
      { id: 'b', name: 'Goblin', ac: 5, projectiles: 1 },
    ],
    rng: seq([...hit, ...hit, ...hit]),
  });
  const [a, b] = result.outcomes;
  assert.equal(a.fired, 2);
  assert.equal(a.damage.total, 24);
  assert.equal(b.fired, 1);
  assert.equal(b.damage.total, 12);
  assert.equal(result.outcomes.length, 2, 'one outcome per creature, not per ray');
});

test('an auto-hitting projectile skips the attack roll entirely', () => {
  const darts = {
    ...scorchingRay,
    id: 'darts',
    name: 'Magic Missile',
    effect: {
      kind: /** @type {const} */ ('attack'),
      damage: [{ count: 1, sides: 4, damageType: 'force', bonus: 1 }],
      projectiles: { count: 3, autoHit: true },
    },
  };
  // Only damage dice are queued: three darts of 1d4 (max 4), each carrying a
  // flat +1 that rolls nothing.
  const result = castSpell(rayCaster(), darts, {
    slotLevel: 2,
    targets: [{ id: 't', ac: 99 }],
    rng: seq(Array(3).fill(face(4, 4))),
  });
  const [o] = result.outcomes;
  assert.equal(o.hits, 3, 'AC is irrelevant to a dart that hits automatically');
  assert.equal(o.shots[0].attack, null);
  assert.equal(o.shots[0].crit, false, 'an auto-hit cannot crit');
  assert.equal(o.damage.total, 15);
  assert.equal(
    o.damage.detail,
    '15 force [4,4,4 +3]',
    "each dart's flat bonus survives the merge into one hit",
  );
});

test("a critical hit doubles a term's dice and leaves its flat bonus alone", () => {
  const blast = {
    ...scorchingRay,
    id: 'darts',
    name: 'Flat Blast',
    effect: {
      kind: /** @type {const} */ ('attack'),
      damage: [{ count: 1, sides: 6, damageType: 'fire', bonus: 4 }],
      projectiles: { count: 1 },
    },
  };
  const result = castSpell(rayCaster(), blast, {
    slotLevel: 2,
    targets: [{ id: 't', ac: 5 }],
    // A natural 20 on the attack, then two d6 for the doubled term.
    rng: seq([face(20, 20), face(6, 3), face(6, 3)]),
  });
  const [o] = result.outcomes;
  assert.equal(o.shots[0].crit, true);
  assert.equal(o.damage.total, 10, '3 + 3 on the doubled dice plus the single flat 4');
  assert.equal(o.damage.detail, '10 fire [3,3 +4]');
});

test('canCast checks cantrips and the list the known-rule selects', () => {
  const c = caster();
  assert.equal(canCast(c, firebolt), true); // cantrip listed
  assert.equal(canCast(c, burningHands), true); // prepared, wizard prepares
  assert.equal(canCast(c, { ...firebolt, id: 'unlisted' }), false);
  const noBook = caster({ spellbook: { cantrips: [], known: [], prepared: [] } });
  assert.equal(canCast(noBook, burningHands), false);
  // A prepared-rule caster's known-but-unprepared spell is not castable...
  const unprepared = caster({
    spellbook: { cantrips: [], known: ['burning-hands'], prepared: [] },
  });
  assert.equal(canCast(unprepared, burningHands), false);
  // ...while a known-rule caster (bard) casts straight from the known list.
  const bard = caster({
    class: 'bard',
    spellbook: { cantrips: [], known: ['burning-hands'], prepared: [] },
  });
  assert.equal(canCast(bard, burningHands), true);
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

/** A ritual utility spell the test caster has prepared, standing in for Detect
 * Magic — no built-in spell is a ritual today, so the flag is exercised the way a
 * GM-authored one would be.
 * @type {import('../src/types/spell.js').Spell} */
const detectMagic = {
  ...burningHands,
  id: 'detect-magic',
  name: 'Detect Magic',
  ritual: true,
  effect: { kind: 'utility' },
};

/** The test caster with Detect Magic prepared. */
function ritualCaster(over = {}) {
  return caster({
    spellbook: { cantrips: [], known: [], prepared: ['detect-magic'] },
    ...over,
  });
}

test('a ritual cast spends no slot and resolves at the spell’s own level', () => {
  const c = ritualCaster();
  const result = castSpell(c, detectMagic, { slotLevel: 1, ritual: true });
  assert.equal(result.ok, true);
  assert.equal(result.spent, false);
  assert.equal(result.ritual, true);
  assert.equal(result.slotLevel, 1);
  assert.equal(result.caster, c, 'nothing was written, so the caster is untouched');
  assert.equal(result.caster.resources[0].current, 4);
});

test('a ritual is castable with no slot left at all', () => {
  // The whole point of the ritual: the extra ten minutes buys a cast a drained
  // caster could not otherwise make.
  const c = ritualCaster({ resources: [createResource('slots-1', 'Level 1 slots', 'mana', 0)] });
  assert.deepEqual(castSpell(c, detectMagic, { slotLevel: 1 }), { ok: false, reason: 'no-slot' });
  const result = castSpell(c, detectMagic, { slotLevel: 1, ritual: true });
  assert.equal(result.ok, true);
  assert.equal(result.spent, false);
});

test('a ritual cast ignores the slot level it was handed', () => {
  // There is no slot to upcast from, so a higher level cannot buy more dice.
  const spell = { ...detectMagic, effect: burningHands.effect, scaling: burningHands.scaling };
  const c = ritualCaster({
    resources: [createResource('slots-3', 'Level 3 slots', 'mana', 2)],
  });
  const result = castSpell(c, /** @type {any} */ (spell), {
    slotLevel: 3,
    ritual: true,
    targets: [{ id: 't', name: 'Goblin', saveBonus: 0 }],
    saveDC: 13,
    // A save spell rolls its damage first, then each target's save.
    rng: seq([...Array(3).fill(face(6, 6)), face(20, 1)]),
  });
  assert.equal(result.ok, true);
  assert.equal(result.slotLevel, 1, 'the ritual resolves at the spell’s level, not the slot’s');
  assert.equal(result.caster.resources[0].current, 2, 'the 3rd-level slot is untouched');
  // Three d6 at 6 each: the base dice with no upcast increment.
  assert.equal(/** @type {any} */ (result.outcomes[0]).taken, 18);
});

test('a ritual request for a spell with no ritual is refused', () => {
  const c = caster();
  assert.deepEqual(castSpell(c, burningHands, { slotLevel: 1, ritual: true }), {
    ok: false,
    reason: 'not-ritual',
  });
  // Refused before any slot is touched.
  assert.equal(c.resources[0].current, 4);
});

test('a cantrip cannot be cast as a ritual', () => {
  // A cantrip already costs no slot, so it has no ritual to trade one for.
  const spell = { ...firebolt, ritual: true };
  assert.deepEqual(castSpell(caster(), /** @type {any} */ (spell), { ritual: true }), {
    ok: false,
    reason: 'not-ritual',
  });
});

test('a ritual cast still resolves its effect', () => {
  const spell = { ...detectMagic, effect: cureWounds.effect, scaling: cureWounds.scaling };
  const c = ritualCaster();
  const result = castSpell(c, /** @type {any} */ (spell), {
    slotLevel: 1,
    ritual: true,
    targets: [{ id: 't', name: 'Ally' }],
    rng: seq([face(8, 7)]),
  });
  assert.equal(result.ok, true);
  assert.equal(/** @type {any} */ (result.outcomes[0]).healing.total, 7);
});

test('a spell the caster does not know is refused before the ritual check', () => {
  const result = castSpell(caster(), detectMagic, { slotLevel: 1, ritual: true });
  assert.deepEqual(result, { ok: false, reason: 'not-known' });
});
