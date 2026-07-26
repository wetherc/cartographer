import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slotsForLevel,
  slotsForCaster,
  slotsForCasterLevel,
  casterLevelContribution,
  pactSlotsFor,
  characterSlots,
  characterPactSlots,
  withSpellSlots,
  syncSlotsToLevel,
  getSlotPools,
  getPactPool,
  isSlotPool,
  isPactPool,
  slotLevelOf,
  highestSlotLevel,
  castableSlotLevels,
} from '../src/entities/SpellSlots.js';
import {
  createCharacter,
  withHP,
  addResource,
  addXP,
  spendResource,
  shortRest,
  longRest,
  getHP,
} from '../src/entities/Character.js';
import { createResource } from '../src/entities/Resource.js';

test('slotsForLevel follows the full-caster table and clamps past 20', () => {
  assert.deepEqual(slotsForLevel(1), [2]);
  assert.deepEqual(slotsForLevel(3), [4, 2]);
  assert.deepEqual(slotsForLevel(5), [4, 3, 2]);
  assert.deepEqual(slotsForLevel(20), [4, 3, 3, 3, 3, 2, 2, 1, 1]);
  assert.deepEqual(slotsForLevel(25), slotsForLevel(20));
  assert.deepEqual(slotsForLevel(0), []);
});

test('slotsForCaster covers full, half, third, and non-slot caster types', () => {
  assert.deepEqual(slotsForCaster('full', 5), [4, 3, 2]);
  // Half caster: none at 1, first slots at 2, 5th-level cap at 20.
  assert.deepEqual(slotsForCaster('half', 1), []);
  assert.deepEqual(slotsForCaster('half', 2), [2]);
  assert.deepEqual(slotsForCaster('half', 20), [4, 3, 3, 3, 2]);
  // Third caster: none until 3, 4th-level cap at 20.
  assert.deepEqual(slotsForCaster('third', 2), []);
  assert.deepEqual(slotsForCaster('third', 3), [2]);
  assert.deepEqual(slotsForCaster('third', 20), [4, 3, 3, 1]);
  // Pact, none, and anything unknown get no leveled slots here.
  assert.deepEqual(slotsForCaster('pact', 5), []);
  assert.deepEqual(slotsForCaster('none', 5), []);
  assert.deepEqual(slotsForCaster(/** @type {any} */ ('bogus'), 5), []);
  assert.deepEqual(slotsForCaster('full', 0), []);
});

test('slotsForCasterLevel reads the multiclass (full-caster) table by combined level', () => {
  assert.deepEqual(slotsForCasterLevel(5), slotsForCaster('full', 5));
  assert.deepEqual(slotsForCasterLevel(0), []);
  // A multiclassed paladin's combined-level slots differ from a single paladin's
  // half-caster row — the seam the deferred multiclass path relies on.
  assert.notDeepEqual(slotsForCasterLevel(2), slotsForCaster('half', 5));
});

test('casterLevelContribution weights each caster type for the combined level', () => {
  assert.equal(casterLevelContribution('full', 5), 5);
  assert.equal(casterLevelContribution('half', 5), 2); // floor(5/2)
  assert.equal(casterLevelContribution('third', 5), 1); // floor(5/3)
  assert.equal(casterLevelContribution('pact', 5), 0);
  assert.equal(casterLevelContribution('none', 5), 0);
  assert.equal(casterLevelContribution('full', 0), 0);
});

test('withSpellSlots creates full pools per the table, ordered HP then slots then custom', () => {
  let mage = withHP(createCharacter('c1', 'Mage'), 10);
  mage = addResource(mage, createResource('ki', 'Ki', 'custom', 3));
  mage = { ...mage, level: 3 };
  mage = withSpellSlots(mage);
  assert.deepEqual(
    mage.resources.map((r) => r.id),
    ['hp', 'slots-1', 'slots-2', 'ki'],
  );
  const pools = getSlotPools(mage);
  assert.deepEqual(
    pools.map((p) => p.max),
    [4, 2],
  );
  assert.deepEqual(
    pools.map((p) => p.current),
    [4, 2],
  );
  assert.equal(
    pools.every((p) => isSlotPool(p)),
    true,
  );
});

test('syncSlotsToLevel grows maxima by the gained capacity, keeping spent slots spent', () => {
  let mage = withSpellSlots(createCharacter('c1', 'Mage')); // level 1: [2]
  mage = spendResource(mage, 'slots-1', 1); // 1/2 left
  mage = { ...mage, level: 3 };
  mage = syncSlotsToLevel(mage);
  const pools = getSlotPools(mage);
  // Level 3: [4, 2]. L1 grew 2 -> 4 (+2 capacity onto 1 remaining = 3); L2 is new, full.
  assert.deepEqual(
    pools.map((p) => ({ max: p.max, current: p.current })),
    [
      { max: 4, current: 3 },
      { max: 2, current: 2 },
    ],
  );
});

test('syncSlotsToLevel leaves a non-caster untouched', () => {
  const fighter = { ...withHP(createCharacter('c1', 'Fighter'), 10), level: 5 };
  assert.equal(syncSlotsToLevel(fighter), fighter);
});

test('addXP levels a caster into new slot pools', () => {
  let mage = withSpellSlots(withHP(createCharacter('c1', 'Mage'), 10));
  mage = addXP(mage, 320); // level 1 -> 3
  assert.deepEqual(
    getSlotPools(mage).map((p) => p.max),
    [4, 2],
  );
});

/** @param {import('../src/types/class.js').ClassRef[]} classes @param {number} [level] */
function classed(classes, level = classes.reduce((s, c) => s + c.level, 0)) {
  return { ...withHP(createCharacter('c1', 'Vess'), 10), classes, level };
}

test('pactSlotsFor follows the warlock progression', () => {
  assert.deepEqual(pactSlotsFor(1), { count: 1, level: 1 });
  assert.deepEqual(pactSlotsFor(2), { count: 2, level: 1 });
  assert.deepEqual(pactSlotsFor(3), { count: 2, level: 2 });
  assert.deepEqual(pactSlotsFor(5), { count: 2, level: 3 });
  assert.deepEqual(pactSlotsFor(7), { count: 2, level: 4 });
  assert.deepEqual(pactSlotsFor(9), { count: 2, level: 5 });
  assert.deepEqual(pactSlotsFor(10), { count: 2, level: 5 });
  assert.deepEqual(pactSlotsFor(11), { count: 3, level: 5 });
  assert.deepEqual(pactSlotsFor(17), { count: 4, level: 5 });
  assert.deepEqual(pactSlotsFor(20), { count: 4, level: 5 });
  assert.equal(pactSlotsFor(0), null);
});

test('characterSlots reads a lone caster class at its own class level', () => {
  // A level-5 paladin uses the half-caster table, not the full one.
  assert.deepEqual(characterSlots(classed([{ classId: 'paladin', level: 5 }])), [4, 2]);
  // A wizard 3 / fighter 2 reads the wizard table at class level 3, not
  // character level 5 — the fighter levels grant no slots.
  const mixed = classed([
    { classId: 'wizard', level: 3 },
    { classId: 'fighter', level: 2 },
  ]);
  assert.deepEqual(characterSlots(mixed), [4, 2]);
});

test('characterSlots combines two slot classes on the multiclass table', () => {
  // Cleric 3 + paladin 2: 3 + floor(2/2) = combined caster level 4 -> [4, 3].
  const gish = classed([
    { classId: 'cleric', level: 3 },
    { classId: 'paladin', level: 2 },
  ]);
  assert.deepEqual(characterSlots(gish), [4, 3]);
});

test('characterSlots excludes pact casters; a classless character keeps the legacy table', () => {
  assert.deepEqual(characterSlots(classed([{ classId: 'warlock', level: 5 }])), []);
  // Warlock levels add nothing to a multiclass slot pool either.
  const duo = classed([
    { classId: 'wizard', level: 3 },
    { classId: 'warlock', level: 2 },
  ]);
  assert.deepEqual(characterSlots(duo), slotsForCaster('full', 3));
  const legacy = { ...createCharacter('c1', 'Old'), classes: undefined, level: 3 };
  assert.deepEqual(characterSlots(legacy), slotsForLevel(3));
});

test('characterPactSlots reads the summed pact levels; null without a pact class', () => {
  assert.deepEqual(characterPactSlots(classed([{ classId: 'warlock', level: 3 }])), {
    count: 2,
    level: 2,
  });
  assert.equal(characterPactSlots(classed([{ classId: 'wizard', level: 3 }])), null);
});

test('withSpellSlots gives a warlock a pact pool and no leveled slots', () => {
  const lock = withSpellSlots(classed([{ classId: 'warlock', level: 3 }]));
  assert.deepEqual(getSlotPools(lock), []);
  const pact = getPactPool(lock);
  assert.ok(pact);
  assert.equal(pact.id, 'pact-2');
  assert.equal(pact.max, 2);
  assert.equal(isPactPool(pact), true);
  assert.equal(isSlotPool(pact), false);
  assert.equal(slotLevelOf(pact), 2);
  assert.deepEqual(
    lock.resources.map((r) => r.id),
    ['hp', 'pact-2'],
  );
});

test('withSpellSlots gives a wizard/warlock both leveled and pact pools', () => {
  const duo = withSpellSlots(
    classed([
      { classId: 'wizard', level: 3 },
      { classId: 'warlock', level: 2 },
    ]),
  );
  assert.deepEqual(
    getSlotPools(duo).map((p) => p.max),
    [4, 2],
  );
  assert.equal(getPactPool(duo)?.id, 'pact-1');
  assert.equal(getPactPool(duo)?.max, 2);
});

test('syncSlotsToLevel follows the pact pool up a slot level, keeping spent slots spent', () => {
  let lock = withSpellSlots(classed([{ classId: 'warlock', level: 4 }]));
  lock = spendResource(lock, 'pact-2', 1); // 1/2 left
  lock = { ...lock, classes: [{ classId: 'warlock', level: 5 }], level: 5 };
  lock = syncSlotsToLevel(lock);
  const pact = getPactPool(lock);
  assert.equal(pact?.id, 'pact-3', 'pact slot level rose with the class');
  assert.equal(pact?.max, 2);
  assert.equal(pact?.current, 1, 'the spent slot stays spent across the id change');
});

test('syncSlotsToLevel grows the pact count and syncs class-aware leveled slots', () => {
  let lock = withSpellSlots(classed([{ classId: 'warlock', level: 1 }]));
  lock = spendResource(lock, 'pact-1', 1); // 0/1 left
  lock = { ...lock, classes: [{ classId: 'warlock', level: 2 }], level: 2 };
  lock = syncSlotsToLevel(lock);
  assert.equal(getPactPool(lock)?.max, 2);
  assert.equal(getPactPool(lock)?.current, 1, 'gained capacity arrives unspent');

  // A paladin's leveled slots re-derive from the half table, not the full one.
  let pal = withSpellSlots(classed([{ classId: 'paladin', level: 2 }]));
  pal = { ...pal, classes: [{ classId: 'paladin', level: 5 }], level: 5 };
  pal = syncSlotsToLevel(pal);
  assert.deepEqual(
    getSlotPools(pal).map((p) => p.max),
    [4, 2],
  );
});

test('highestSlotLevel and castableSlotLevels cover leveled and pact pools', () => {
  const duo = withSpellSlots(
    classed([
      { classId: 'wizard', level: 3 },
      { classId: 'warlock', level: 5 },
    ]),
  );
  // Wizard 3 leveled slots reach level 2; warlock 5 pact slots sit at level 3.
  assert.equal(highestSlotLevel(duo), 3);
  assert.deepEqual(castableSlotLevels(duo, 1), [1, 2, 3]);
  assert.deepEqual(castableSlotLevels(duo, 3), [3]);

  // Draining a pool drops its level from the castable list.
  const drained = spendResource(duo, 'pact-3', 2);
  assert.deepEqual(castableSlotLevels(drained, 3), []);
  assert.equal(highestSlotLevel(drained), 3, 'capacity, not charge, sets the ceiling');

  const martial = classed([{ classId: 'fighter', level: 5 }]);
  assert.equal(highestSlotLevel(martial), 0);
  assert.deepEqual(castableSlotLevels(martial, 1), []);
});

test('a short rest refills pact slots but not leveled ones; a long rest refills both', () => {
  let duo = withSpellSlots(
    classed([
      { classId: 'wizard', level: 3 },
      { classId: 'warlock', level: 2 },
    ]),
  );
  duo = spendResource(duo, 'slots-1', 2);
  duo = spendResource(duo, 'pact-1', 2);

  const rested = shortRest(duo);
  assert.equal(getSlotPools(rested)[0].current, 2, 'leveled slots stay spent');
  assert.equal(getPactPool(rested)?.current, 2, 'pact slots refill on a short rest');

  const slept = longRest(duo);
  assert.equal(getSlotPools(slept)[0].current, 4);
  assert.equal(getPactPool(slept)?.current, 2);
});

test('a short rest heals HP but leaves spent slots spent; a long rest refills them', () => {
  let mage = withSpellSlots(withHP(createCharacter('c1', 'Mage'), 10));
  mage = spendResource(mage, 'hp', 6);
  mage = spendResource(mage, 'slots-1', 2);

  const rested = shortRest(mage);
  assert.equal(getHP(rested).current, 9, 'short rest restores half of max HP');
  assert.equal(getSlotPools(rested)[0].current, 0, 'slots untouched by a short rest');

  const slept = longRest(mage);
  assert.equal(getHP(slept).current, 10);
  assert.equal(getSlotPools(slept)[0].current, 2, 'long rest refills slots');
});
