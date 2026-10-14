import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignLevel, levelUpLine } from '../src/entities/LevelAssign.js';
import { createCharacter, withHP } from '../src/entities/Character.js';

/** A fighter 4 with a level to assign and 36 maximum HP. */
function fighter() {
  const c = createCharacter('c1', 'Bron', { STR: 16, CON: 14 });
  return withHP({ ...c, classes: [{ classId: 'fighter', level: 4 }], level: 5 }, 36);
}

test('the line names the class level, the HP gain, and the new features', () => {
  const before = fighter();
  const after = assignLevel(before, 'fighter');
  assert.equal(
    levelUpLine(before, after, 'fighter', ['Extra Attack']),
    'Bron takes Fighter 5 and gains 8 maximum HP. New: Extra Attack.',
  );
});

test('the line leaves out an HP gain of zero and an empty feature list', () => {
  const before = fighter();
  assert.equal(levelUpLine(before, before, 'fighter', []), 'Bron takes Fighter 4.');
});

test('the line ends with the notice, and reads 0 HP for a character with no HP pool', () => {
  const before = { ...fighter(), resources: [] };
  const after = { ...before, classes: [{ classId: 'fighter', level: 5 }] };
  assert.equal(
    levelUpLine(before, after, 'fighter', [], 'Champion chosen.'),
    'Bron takes Fighter 5. Champion chosen.',
  );
});
