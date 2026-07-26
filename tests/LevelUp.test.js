import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABILITY_MAX,
  getASIChoices,
  earnedASILevels,
  pendingASILevels,
  isValidASI,
  applyASI,
  takeFeat,
  undoLastChoice,
  unlockedFeatures,
  featuresGained,
} from '../src/entities/LevelUp.js';
import { createCharacter, addXP, withDefaults } from '../src/entities/Character.js';

/** @param {number} [level] */
function fighter(level = 1) {
  return { ...createCharacter('c1', 'Bron', { STR: 16 }), class: 'fighter', level };
}

test('earnedASILevels lists reached class ASI levels; classless earns none', () => {
  assert.deepEqual(earnedASILevels(fighter(1)), []);
  assert.deepEqual(earnedASILevels(fighter(6)), [4, 6]);
  assert.deepEqual(earnedASILevels(fighter(20)), [4, 6, 8, 12, 14, 16, 19]);
  assert.deepEqual(earnedASILevels(createCharacter('c1', 'Nim')), []);
  assert.deepEqual(earnedASILevels({ ...fighter(), class: 'bogus' }), []);
});

test('malformed level falls back to 1', () => {
  assert.deepEqual(earnedASILevels(fighter(NaN)), []);
  assert.deepEqual(earnedASILevels(fighter(0)), []);
});

test('pendingASILevels drops levels already claimed by a choice', () => {
  const c = applyASI(fighter(6), { STR: 2 });
  assert.deepEqual(pendingASILevels(c), [6]);
  assert.deepEqual(pendingASILevels(fighter(6)), [4, 6]);
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

test('applyASI raises the stats and records the choice against the lowest slot', () => {
  const c = applyASI(fighter(6), { STR: 1, CON: 1 });
  assert.equal(c.stats.STR, 17);
  assert.equal(c.stats.CON, 11);
  assert.deepEqual(getASIChoices(c), [{ level: 4, type: 'asi', increases: { STR: 1, CON: 1 } }]);
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
  assert.deepEqual(getASIChoices(c), [{ level: 4, type: 'feat', feat: 'Sentinel' }]);
  assert.deepEqual(pendingASILevels(c), []);
  const blank = fighter(4);
  assert.equal(takeFeat(blank, '   '), blank);
  const slotless = fighter(1);
  assert.equal(takeFeat(slotless, 'Sentinel'), slotless);
});

test('undoLastChoice reopens the slot, reverting an ability increase', () => {
  const chosen = applyASI(fighter(6), { STR: 2 });
  const undone = undoLastChoice(chosen);
  assert.equal(undone.stats.STR, 16);
  assert.deepEqual(pendingASILevels(undone), [4, 6]);

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

test('unlockedFeatures lists class features up to the level, ascending', () => {
  assert.deepEqual(unlockedFeatures(fighter(3)), [
    { level: 1, name: 'Fighting Style' },
    { level: 1, name: 'Second Wind' },
    { level: 2, name: 'Action Surge' },
    { level: 3, name: 'Martial Archetype' },
  ]);
  assert.deepEqual(unlockedFeatures(createCharacter('c1', 'Nim')), []);
});

test('featuresGained lists only what a level-up crossed', () => {
  assert.deepEqual(featuresGained(fighter(5), 3), [{ level: 5, name: 'Extra Attack' }]);
  assert.deepEqual(featuresGained(fighter(3), 3), []);
});

test('crossing an ASI level via addXP leaves a pending choice with no grant step', () => {
  const leveled = addXP(fighter(3), 300); // level 3 -> 4
  assert.equal(leveled.level, 4);
  assert.deepEqual(pendingASILevels(leveled), [4]);
});

test('withDefaults gives an older save an empty choice list', () => {
  const legacy = withDefaults(/** @type {any} */ ({ id: 'c1', name: 'Old', resources: [] }));
  assert.deepEqual(legacy.asiChoices, []);
  assert.deepEqual(getASIChoices(/** @type {any} */ ({ resources: [] })), []);
});
