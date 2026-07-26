import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getClasses,
  primaryClass,
  classLevelOf,
  assignedLevel,
  pendingLevels,
  withClasses,
} from '../src/entities/Multiclass.js';
import { createCharacter, withDefaults, addXP, withHP, getHP } from '../src/entities/Character.js';

/** @param {import('../src/types/class.js').ClassRef[]} classes @param {number} [level] */
function withList(classes, level = classes.reduce((s, c) => s + c.level, 0)) {
  return { ...createCharacter('c1', 'Bron', { STR: 16 }), classes, level };
}

test('getClasses reads the list; a legacy scalar class folds into one entry', () => {
  const listed = withList([{ classId: 'fighter', level: 3 }]);
  assert.deepEqual(getClasses(listed), [{ classId: 'fighter', level: 3 }]);
  assert.deepEqual(getClasses(createCharacter('c1', 'Nim')), []);

  const legacy = /** @type {any} */ ({ id: 'c1', name: 'Old', level: 4, class: 'wizard' });
  assert.deepEqual(getClasses(legacy), [{ classId: 'wizard', level: 4, subclass: undefined }]);
  const malformed = /** @type {any} */ ({ id: 'c1', name: 'Old', level: NaN, class: 'wizard' });
  assert.equal(getClasses(malformed)[0].level, 1);
});

test('primaryClass and classLevelOf resolve individual entries', () => {
  const c = withList([
    { classId: 'fighter', level: 3 },
    { classId: 'wizard', level: 2 },
  ]);
  assert.deepEqual(primaryClass(c), { classId: 'fighter', level: 3 });
  assert.equal(classLevelOf(c, 'wizard'), 2);
  assert.equal(classLevelOf(c, 'rogue'), 0);
  assert.equal(primaryClass(createCharacter('c1', 'Nim')), null);
});

test('assignedLevel sums class levels; pendingLevels is the shortfall', () => {
  const even = withList([
    { classId: 'fighter', level: 3 },
    { classId: 'wizard', level: 2 },
  ]);
  assert.equal(assignedLevel(even), 5);
  assert.equal(pendingLevels(even), 0);

  const behind = withList([{ classId: 'fighter', level: 3 }], 5);
  assert.equal(pendingLevels(behind), 2);

  // Assigned past the total never reports negative pending.
  const ahead = withList([{ classId: 'fighter', level: 3 }], 2);
  assert.equal(pendingLevels(ahead), 0);

  // Classless characters have nothing to assign a level to.
  assert.equal(pendingLevels({ ...createCharacter('c1', 'Nim'), level: 5 }), 0);
});

test('withClasses sanitizes: drops blank ids and duplicates, floors levels to 1', () => {
  const c = withClasses(createCharacter('c1', 'Bron'), [
    { classId: 'fighter', level: 2.7 },
    { classId: '', level: 3 },
    { classId: 'fighter', level: 9 },
    { classId: 'wizard', level: 0 },
  ]);
  assert.deepEqual(c.classes, [
    { classId: 'fighter', level: 2 },
    { classId: 'wizard', level: 1 },
  ]);
});

test('addXP leaves every earned level pending for a classed character', () => {
  const single = withHP(withList([{ classId: 'fighter', level: 1 }], 1), 12);
  const leveled = addXP(single, 300); // 1 -> 3
  assert.equal(leveled.level, 3);
  assert.deepEqual(leveled.classes, [{ classId: 'fighter', level: 1 }]);
  assert.equal(pendingLevels(leveled), 2);
  assert.equal(getHP(leveled).max, 12); // HP grows at assignment, not here

  const multi = withList(
    [
      { classId: 'fighter', level: 1 },
      { classId: 'wizard', level: 1 },
    ],
    2,
  );
  const gained = addXP(multi, 200); // 2 -> 3
  assert.equal(gained.level, 3);
  assert.deepEqual(gained.classes, multi.classes);
  assert.equal(pendingLevels(gained), 1);
});

test('withDefaults folds legacy scalar class fields into a one-entry list', () => {
  const legacy = /** @type {any} */ ({
    id: 'c1',
    name: 'Old',
    level: 5,
    class: 'cleric',
    subclass: 'life',
    resources: [],
  });
  const migrated = withDefaults(legacy);
  assert.deepEqual(migrated.classes, [{ classId: 'cleric', level: 5, subclass: 'life' }]);
  assert.equal('class' in migrated, false);
  assert.equal('subclass' in migrated, false);

  const classless = withDefaults(/** @type {any} */ ({ id: 'c1', name: 'New', resources: [] }));
  assert.deepEqual(classless.classes, []);

  // An already-migrated list passes through untouched.
  const listed = withDefaults(withList([{ classId: 'fighter', level: 2 }]));
  assert.deepEqual(listed.classes, [{ classId: 'fighter', level: 2 }]);
});
