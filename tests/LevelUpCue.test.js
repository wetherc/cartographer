import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  featureChoiceCount,
  improvementCount,
  levelsToAssign,
  levelUpCue,
  rosterLevelText,
  sheetLevelText,
} from '../src/view/LevelUpCue.js';

test('no pending step gives no banner', () => {
  assert.equal(levelUpCue({ levels: 0, improvements: 0, choices: 0 }), null);
});

test('one pending level reads in the singular', () => {
  assert.equal(
    levelUpCue({ levels: 1, improvements: 0, choices: 0 }),
    'Ready to level up: 1 level to assign.',
  );
});

test('every kind of step joins into one line, in the plural', () => {
  assert.equal(
    levelUpCue({ levels: 2, improvements: 2, choices: 2 }),
    'Ready to level up: 2 levels to assign, 2 improvements, 2 feature choices.',
  );
  assert.equal(
    levelUpCue({ levels: 0, improvements: 1, choices: 1 }),
    'Ready to level up: 1 improvement, 1 feature choice.',
  );
});

test('the level labels name the levels left to assign', () => {
  assert.equal(rosterLevelText(4, 0), '(Lv 4)');
  assert.equal(rosterLevelText(4, 1), '(Lv 4, +1 to assign)');
  assert.equal(sheetLevelText(4, 0), 'Level 4');
  assert.equal(sheetLevelText(4, 1), 'Level 4, 1 level to assign');
  assert.equal(sheetLevelText(4, 2), 'Level 4, 2 levels to assign');
});

test('the level-up phrases count their nouns', () => {
  assert.equal(levelsToAssign(1), '1 level to assign');
  assert.equal(improvementCount(2), '2 improvements');
  assert.equal(featureChoiceCount(1), '1 feature choice');
});
