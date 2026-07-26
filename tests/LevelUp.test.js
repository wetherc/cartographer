import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABILITY_MAX,
  getASIChoices,
  earnedASISlots,
  pendingASISlots,
  migrateASIChoices,
  isValidASI,
  applyASI,
  takeFeat,
  undoLastChoice,
  unlockedFeatures,
  featuresGained,
} from '../src/entities/LevelUp.js';
import { createCharacter, addXP, withDefaults } from '../src/entities/Character.js';
import { assignLevel } from '../src/entities/LevelAssign.js';

/** @param {number} [level] */
function fighter(level = 1) {
  return {
    ...createCharacter('c1', 'Bron', { STR: 16 }),
    classes: [{ classId: 'fighter', level }],
    level,
  };
}

/** @param {{ classId: string, level: number }[]} classes */
function classed(classes) {
  const level = classes.reduce((sum, ref) => sum + ref.level, 0);
  return { ...createCharacter('c1', 'Bron', { STR: 16 }), classes, level };
}

test('earnedASISlots lists reached class ASI slots; classless earns none', () => {
  assert.deepEqual(earnedASISlots(fighter(1)), []);
  assert.deepEqual(earnedASISlots(fighter(6)), [
    { classId: 'fighter', classLevel: 4 },
    { classId: 'fighter', classLevel: 6 },
  ]);
  assert.equal(earnedASISlots(fighter(20)).length, 7);
  assert.deepEqual(earnedASISlots(createCharacter('c1', 'Nim')), []);
  assert.deepEqual(earnedASISlots({ ...fighter(), classes: [{ classId: 'bogus', level: 1 }] }), []);
});

test('each class follows its own ASI schedule, in class-list order', () => {
  const c = classed([
    { classId: 'fighter', level: 6 },
    { classId: 'rogue', level: 4 },
  ]);
  assert.deepEqual(earnedASISlots(c), [
    { classId: 'fighter', classLevel: 4 },
    { classId: 'fighter', classLevel: 6 },
    { classId: 'rogue', classLevel: 4 },
  ]);
});

test('malformed level falls back to 1', () => {
  assert.deepEqual(earnedASISlots(fighter(NaN)), []);
  assert.deepEqual(earnedASISlots(fighter(0)), []);
});

test('pendingASISlots drops slots already claimed by a choice', () => {
  const c = applyASI(fighter(6), { STR: 2 });
  assert.deepEqual(pendingASISlots(c), [{ classId: 'fighter', classLevel: 6 }]);
  assert.equal(pendingASISlots(fighter(6)).length, 2);
});

test('a claim on one class leaves the same class level pending on another', () => {
  const c = applyASI(
    classed([
      { classId: 'fighter', level: 4 },
      { classId: 'rogue', level: 4 },
    ]),
    { STR: 2 },
  );
  assert.deepEqual(pendingASISlots(c), [{ classId: 'rogue', classLevel: 4 }]);
});

test('isValidASI accepts +2 or +1/+1 within the 20 cap and rejects the rest', () => {
  const c = fighter(4);
  assert.equal(isValidASI(c, { STR: 2 }), true);
  assert.equal(isValidASI(c, { STR: 1, DEX: 1 }), true);
  assert.equal(isValidASI(c, { DEX: 1, WIS: 1, CHA: 0 }), true);
  assert.equal(isValidASI(c, { STR: 1 }), false);
  assert.equal(isValidASI(c, { STR: 3 }), false);
  assert.equal(isValidASI(c, { STR: 1.5, DEX: 0.5 }), false);
  assert.equal(isValidASI(c, { STR: -1, DEX: 3 }), false);
  assert.equal(isValidASI(c, { LUCK: 2 }), false);
  assert.equal(isValidASI(c, {}), false);
  const capped = { ...c, stats: { ...c.stats, STR: 19 } };
  assert.equal(isValidASI(capped, { STR: 2 }), false);
  assert.equal(isValidASI(capped, { STR: 1, DEX: 1 }), true);
  assert.equal(isValidASI({ ...c, stats: undefined }, { STR: 2 }), true);
});

test(`ABILITY_MAX is the 5e cap of ${ABILITY_MAX}`, () => {
  assert.equal(ABILITY_MAX, 20);
});

test('applyASI raises the stats and records the choice against the first slot', () => {
  const c = applyASI(fighter(6), { STR: 1, CON: 1 });
  assert.equal(c.stats.STR, 17);
  assert.equal(c.stats.CON, 11);
  assert.deepEqual(getASIChoices(c), [
    { classId: 'fighter', classLevel: 4, type: 'asi', increases: { STR: 1, CON: 1 } },
  ]);
});

test('applyASI defaults a missing stat to 10 and skips zero entries', () => {
  const bare = { ...fighter(4), stats: undefined };
  const c = applyASI(bare, { STR: 2, DEX: 0 });
  assert.deepEqual(c.stats, { STR: 12 });
});

test('applyASI is a no-op without a pending slot or with an invalid increase', () => {
  const none = fighter(1);
  assert.equal(applyASI(none, { STR: 2 }), none);
  const invalid = fighter(4);
  assert.equal(applyASI(invalid, { STR: 3 }), invalid);
});

test('takeFeat spends the slot on a named feat; blank or slotless is a no-op', () => {
  const c = takeFeat(fighter(4), '  Sentinel  ');
  assert.deepEqual(getASIChoices(c), [
    { classId: 'fighter', classLevel: 4, type: 'feat', feat: 'Sentinel' },
  ]);
  assert.deepEqual(pendingASISlots(c), []);
  const blank = fighter(4);
  assert.equal(takeFeat(blank, '   '), blank);
  const slotless = fighter(1);
  assert.equal(takeFeat(slotless, 'Sentinel'), slotless);
});

test('undoLastChoice reopens the slot, reverting an ability increase', () => {
  const chosen = applyASI(fighter(6), { STR: 2 });
  const undone = undoLastChoice(chosen);
  assert.equal(undone.stats.STR, 16);
  assert.equal(pendingASISlots(undone).length, 2);

  const feated = takeFeat(fighter(4), 'Sentinel');
  const unfeated = undoLastChoice(feated);
  assert.deepEqual(getASIChoices(unfeated), []);
  assert.equal(unfeated.stats.STR, 16);

  const statless = undoLastChoice({ ...applyASI(fighter(4), { STR: 2 }), stats: undefined });
  assert.deepEqual(statless.stats, { STR: -2 + 10 });
});

test('undoLastChoice preserves identity with no choices made', () => {
  const c = fighter(4);
  assert.equal(undoLastChoice(c), c);
});

test('migrateASIChoices attributes level-keyed choices to the primary class', () => {
  const migrated = migrateASIChoices(
    [
      { level: 4, type: 'asi', increases: { STR: 2 } },
      { level: 6, type: 'feat', feat: 'Sentinel' },
    ],
    'fighter',
  );
  assert.deepEqual(migrated, [
    { classId: 'fighter', classLevel: 4, type: 'asi', increases: { STR: 2 } },
    { classId: 'fighter', classLevel: 6, type: 'feat', feat: 'Sentinel' },
  ]);
});

test('migrateASIChoices preserves identity on an already-migrated list', () => {
  const choices = [{ classId: 'fighter', classLevel: 4, type: 'feat', feat: 'Sentinel' }];
  assert.equal(migrateASIChoices(choices, 'fighter'), choices);
  const mixed = [
    { classId: 'fighter', classLevel: 4, type: 'feat', feat: 'Sentinel' },
    { level: 6, type: 'asi', increases: { STR: 2 } },
  ];
  assert.deepEqual(migrateASIChoices(mixed, 'fighter')[0], mixed[0]);
});

test("withDefaults migrates an older save's level-keyed choices", () => {
  const legacy = withDefaults(
    /** @type {any} */ ({
      id: 'c1',
      name: 'Old',
      class: 'fighter',
      level: 6,
      resources: [],
      asiChoices: [{ level: 4, type: 'asi', increases: { STR: 2 } }],
    }),
  );
  assert.deepEqual(legacy.asiChoices, [
    { classId: 'fighter', classLevel: 4, type: 'asi', increases: { STR: 2 } },
  ]);
  assert.deepEqual(pendingASISlots(legacy), [{ classId: 'fighter', classLevel: 6 }]);
});

test('unlockedFeatures lists class features up to the class level, ascending', () => {
  assert.deepEqual(unlockedFeatures(fighter(3)), [
    { classId: 'fighter', level: 1, name: 'Fighting Style' },
    { classId: 'fighter', level: 1, name: 'Second Wind' },
    { classId: 'fighter', level: 2, name: 'Action Surge' },
    { classId: 'fighter', level: 3, name: 'Martial Archetype' },
  ]);
  assert.deepEqual(unlockedFeatures(createCharacter('c1', 'Nim')), []);
});

test('unlockedFeatures covers every class in the list', () => {
  const c = classed([
    { classId: 'fighter', level: 2 },
    { classId: 'rogue', level: 2 },
  ]);
  assert.deepEqual(
    unlockedFeatures(c).map((f) => `${f.classId} ${f.level} ${f.name}`),
    [
      'fighter 1 Fighting Style',
      'fighter 1 Second Wind',
      'fighter 2 Action Surge',
      'rogue 1 Expertise',
      'rogue 1 Sneak Attack',
      "rogue 1 Thieves' Cant",
      'rogue 2 Cunning Action',
    ],
  );
});

test('featuresGained lists only what the earlier snapshot lacked', () => {
  assert.deepEqual(featuresGained(fighter(5), fighter(3)), [
    { classId: 'fighter', level: 5, name: 'Extra Attack' },
  ]);
  assert.deepEqual(featuresGained(fighter(3), fighter(3)), []);
  const before = classed([{ classId: 'fighter', level: 2 }]);
  const after = classed([
    { classId: 'fighter', level: 2 },
    { classId: 'rogue', level: 1 },
  ]);
  assert.deepEqual(
    featuresGained(after, before).map((f) => f.name),
    ['Expertise', 'Sneak Attack', "Thieves' Cant"],
  );
});

test('crossing an ASI level leaves a pending choice once the level is assigned', () => {
  const leveled = addXP(fighter(3), 300); // level 3 -> 4, pending
  assert.equal(leveled.level, 4);
  assert.deepEqual(pendingASISlots(leveled), []);
  const assigned = assignLevel(leveled, 'fighter');
  assert.deepEqual(pendingASISlots(assigned), [{ classId: 'fighter', classLevel: 4 }]);
});

test('a multiclass pending level earns no slot until assigned', () => {
  const c = classed([
    { classId: 'fighter', level: 3 },
    { classId: 'rogue', level: 1 },
  ]);
  const leveled = addXP(c, 400); // level 4 -> 5, pending
  assert.equal(leveled.level, 5);
  assert.deepEqual(pendingASISlots(leveled), []);
});

test('withDefaults gives an older save an empty choice list', () => {
  const legacy = withDefaults(/** @type {any} */ ({ id: 'c1', name: 'Old', resources: [] }));
  assert.deepEqual(legacy.asiChoices, []);
  assert.deepEqual(getASIChoices(/** @type {any} */ ({ resources: [] })), []);
});
