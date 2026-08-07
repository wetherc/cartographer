import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABILITY_MAX,
  getASIChoices,
  listASIChoices,
  slotKey,
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
  assert.deepEqual(getASIChoices(c), {
    [slotKey({ classId: 'fighter', classLevel: 4 })]: {
      classId: 'fighter',
      classLevel: 4,
      order: 0,
      type: 'asi',
      increases: { STR: 1, CON: 1 },
    },
  });
});

test('a second choice keys to its own slot and takes the next order', () => {
  const c = takeFeat(applyASI(fighter(6), { STR: 2 }), 'Sentinel');
  assert.deepEqual(
    listASIChoices(c).map((choice) => [slotKey(choice), choice.order]),
    [
      [slotKey({ classId: 'fighter', classLevel: 4 }), 0],
      [slotKey({ classId: 'fighter', classLevel: 6 }), 1],
    ],
  );
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
  assert.deepEqual(listASIChoices(c), [
    { classId: 'fighter', classLevel: 4, order: 0, type: 'feat', feat: 'Sentinel' },
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
  assert.deepEqual(getASIChoices(unfeated), {});
  assert.equal(unfeated.stats.STR, 16);

  const statless = undoLastChoice({ ...applyASI(fighter(4), { STR: 2 }), stats: undefined });
  assert.deepEqual(statless.stats, { STR: -2 + 10 });
});

test('undoLastChoice preserves identity with no choices made', () => {
  const c = fighter(4);
  assert.equal(undoLastChoice(c), c);
});

test('undoLastChoice drops the latest choice, not the first key in the record', () => {
  const c = {
    ...fighter(6),
    asiChoices: {
      [slotKey({ classId: 'fighter', classLevel: 6 })]: {
        classId: 'fighter',
        classLevel: 6,
        order: 1,
        type: /** @type {const} */ ('feat'),
        feat: 'Sentinel',
      },
      [slotKey({ classId: 'fighter', classLevel: 4 })]: {
        classId: 'fighter',
        classLevel: 4,
        order: 0,
        type: /** @type {const} */ ('asi'),
        increases: { STR: 2 },
      },
    },
  };
  const undone = undoLastChoice(c);
  assert.deepEqual(Object.keys(undone.asiChoices ?? {}), [
    slotKey({ classId: 'fighter', classLevel: 4 }),
  ]);
  assert.equal(undone.stats.STR, 16, 'the dropped feat carried no ability increase');
});

test('migrateASIChoices keys an array by slot and attributes level-keyed choices', () => {
  const migrated = migrateASIChoices(
    [
      { level: 4, type: 'asi', increases: { STR: 2 } },
      { level: 6, type: 'feat', feat: 'Sentinel' },
    ],
    'fighter',
  );
  assert.deepEqual(migrated, {
    [slotKey({ classId: 'fighter', classLevel: 4 })]: {
      classId: 'fighter',
      classLevel: 4,
      order: 0,
      type: 'asi',
      increases: { STR: 2 },
    },
    [slotKey({ classId: 'fighter', classLevel: 6 })]: {
      classId: 'fighter',
      classLevel: 6,
      order: 1,
      type: 'feat',
      feat: 'Sentinel',
    },
  });
});

test('migrateASIChoices carries a per-class array over, keeping its order', () => {
  const migrated = migrateASIChoices(
    [
      { classId: 'rogue', classLevel: 4, type: 'feat', feat: 'Sentinel' },
      { level: 6, type: 'asi', increases: { STR: 2 } },
    ],
    'fighter',
  );
  assert.deepEqual(
    listASIChoices(/** @type {any} */ ({ asiChoices: migrated })).map((c) => slotKey(c)),
    [slotKey({ classId: 'rogue', classLevel: 4 }), slotKey({ classId: 'fighter', classLevel: 6 })],
  );
});

test('migrateASIChoices preserves identity on a value that is already a record', () => {
  const choices = migrateASIChoices([{ level: 4, type: 'feat', feat: 'Sentinel' }], 'fighter');
  assert.equal(migrateASIChoices(choices, 'fighter'), choices);
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
  assert.deepEqual(legacy.asiChoices, {
    [slotKey({ classId: 'fighter', classLevel: 4 })]: {
      classId: 'fighter',
      classLevel: 4,
      order: 0,
      type: 'asi',
      increases: { STR: 2 },
    },
  });
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

test('withDefaults gives an older save no choices at all', () => {
  const legacy = withDefaults(/** @type {any} */ ({ id: 'c1', name: 'Old', resources: [] }));
  assert.deepEqual(legacy.asiChoices, {});
  assert.deepEqual(getASIChoices(/** @type {any} */ ({ resources: [] })), {});
  assert.deepEqual(listASIChoices(/** @type {any} */ ({ resources: [] })), []);
});

test('a class id outside the catalog unlocks no features', () => {
  const homebrew = classed([
    { classId: 'warlord', level: 4 },
    { classId: 'fighter', level: 1 },
  ]);
  assert.deepEqual(unlockedFeatures(homebrew), [
    { classId: 'fighter', level: 1, name: 'Fighting Style' },
    { classId: 'fighter', level: 1, name: 'Second Wind' },
  ]);
});

test('takeFeat applies a stamp: increase, delta-only grants, and the rider', () => {
  const base = {
    ...fighter(4),
    proficiencies: {
      saves: ['STR'],
      skills: ['athletics'],
      expertise: [],
      weapons: { categories: ['martial'], named: [] },
      armor: ['light'],
      tools: [],
      languages: [],
    },
  };
  const c = takeFeat(base, {
    name: 'Skill Expert',
    featId: 'skill-expert',
    increases: { DEX: 1 },
    granted: {
      skills: ['stealth', 'athletics'],
      saves: ['DEX'],
      expertise: ['stealth'],
      armor: ['light', 'medium'],
      tools: ["thieves' tools"],
    },
    rider: { rolls: ['save'], flat: 1 },
  });
  assert.equal(c.stats.DEX, 11, 'the half-feat point lands on the stats');
  assert.deepEqual(c.proficiencies?.skills, ['athletics', 'stealth']);
  assert.deepEqual(c.proficiencies?.saves, ['STR', 'DEX']);
  assert.deepEqual(c.proficiencies?.expertise, ['stealth']);
  assert.deepEqual(c.proficiencies?.armor, ['light', 'medium']);
  const [choice] = listASIChoices(c);
  assert.equal(choice.type, 'feat');
  assert.deepEqual(choice, {
    classId: 'fighter',
    classLevel: 4,
    order: 0,
    type: 'feat',
    feat: 'Skill Expert',
    featId: 'skill-expert',
    increases: { DEX: 1 },
    granted: {
      skills: ['stealth'],
      saves: ['DEX'],
      expertise: ['stealth'],
      armor: ['medium'],
      tools: ["thieves' tools"],
    },
    rider: { rolls: ['save'], flat: 1 },
  });
});

test('takeFeat drops an expertise grant on a skill the character lacks', () => {
  const c = takeFeat(fighter(4), {
    name: 'Odd Import',
    granted: { expertise: ['stealth'] },
  });
  assert.deepEqual(c.proficiencies?.expertise ?? [], []);
  const [choice] = listASIChoices(c);
  assert.equal(choice.type === 'feat' && choice.granted, undefined, 'nothing landed, so no stamp');
});

test('takeFeat refuses an increase past the ability cap or a malformed one', () => {
  const capped = { ...fighter(4), stats: { STR: 20 } };
  assert.equal(
    takeFeat(capped, { name: 'Heavy', increases: { STR: 1 } }),
    capped,
    'a wasted point is refused rather than clamped',
  );
  const c = fighter(4);
  assert.equal(takeFeat(c, { name: 'Odd', increases: { STR: 1.5 } }), c);
  assert.equal(takeFeat(c, { name: 'Odd', increases: { LCK: 1 } }), c);
});

test('takeFeat filters grants to each vocabulary and ignores an empty stamp field', () => {
  const c = takeFeat(fighter(4), {
    name: 'Odd Import',
    granted: { skills: ['flying', 'stealth'], saves: ['LCK'], armor: ['pauldron'] },
    rider: { rolls: [] },
  });
  const [choice] = listASIChoices(c);
  assert.equal(choice.type, 'feat');
  assert.deepEqual(choice.type === 'feat' ? choice.granted : null, { skills: ['stealth'] });
  assert.equal(choice.type === 'feat' ? choice.rider : null, undefined, 'an empty rider drops');
});

test('undoLastChoice takes a stamped feat back off the character', () => {
  const base = {
    ...fighter(4),
    proficiencies: {
      saves: [],
      skills: ['athletics'],
      expertise: ['athletics'],
      weapons: { categories: [], named: [] },
      armor: [],
      tools: [],
      languages: [],
    },
  };
  const taken = takeFeat(base, {
    name: 'Skill Expert',
    increases: { CON: 1 },
    granted: { skills: ['stealth'], expertise: ['stealth'], saves: ['DEX'] },
  });
  const undone = undoLastChoice(taken);
  assert.equal(undone.stats.CON, 10);
  assert.deepEqual(undone.proficiencies?.skills, ['athletics']);
  assert.deepEqual(undone.proficiencies?.expertise, ['athletics']);
  assert.deepEqual(undone.proficiencies?.saves, []);
  assert.deepEqual(getASIChoices(undone), {});
});

test('undo prunes an expertise another writer stacked on a feat-granted skill', () => {
  const taken = takeFeat(fighter(4), { name: 'Skilled', granted: { skills: ['stealth'] } });
  const stacked = {
    ...taken,
    proficiencies: {
      .../** @type {NonNullable<typeof taken.proficiencies>} */ (taken.proficiencies),
      expertise: ['stealth'],
    },
  };
  const undone = undoLastChoice(stacked);
  assert.deepEqual(undone.proficiencies?.skills, []);
  assert.deepEqual(undone.proficiencies?.expertise, [], 'expertise cannot outlive its skill');
});
