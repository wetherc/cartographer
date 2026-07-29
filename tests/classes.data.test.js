import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CLASSES } from '../src/data/classes.js';
import { SKILL_ABILITIES, SKILL_IDS, skillName } from '../src/data/skills.js';

const ABILITIES = new Set(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
const ARMOR = new Set(['light', 'medium', 'heavy', 'shield']);
const WEAPON_CATEGORIES = new Set(['simple', 'martial']);
const HIT_DICE = new Set([6, 8, 10, 12]);

test('class ids are unique and match slugified names', () => {
  const ids = DEFAULT_CLASSES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of DEFAULT_CLASSES) assert.equal(c.id, c.name.toLowerCase());
});

test('every class carries a valid hit die and exactly two saving throws', () => {
  for (const c of DEFAULT_CLASSES) {
    assert.ok(HIT_DICE.has(c.hitDie), `${c.id} hit die`);
    assert.equal(c.savingThrows.length, 2, `${c.id} saves`);
    for (const ability of c.savingThrows) assert.ok(ABILITIES.has(ability), `${c.id} save`);
    assert.notEqual(c.savingThrows[0], c.savingThrows[1], `${c.id} duplicate save`);
  }
});

test('armor and weapon proficiencies use the known categories', () => {
  for (const c of DEFAULT_CLASSES) {
    for (const a of c.armor) assert.ok(ARMOR.has(a), `${c.id} armor ${a}`);
    for (const w of c.weaponCategories)
      assert.ok(WEAPON_CATEGORIES.has(w), `${c.id} weapon category ${w}`);
    // Named weapons supplement categories; martial proficiency subsumes them.
    if (c.weaponCategories.includes('martial'))
      assert.equal(c.weaponNamed.length, 0, `${c.id} redundant named weapons`);
  }
});

test('skill choices reference real skill ids and a positive count', () => {
  for (const c of DEFAULT_CLASSES) {
    assert.ok(c.skillChoice.choose >= 2, `${c.id} choose count`);
    for (const id of c.skillChoice.from)
      assert.ok(SKILL_ABILITIES[id], `${c.id} unknown skill ${id}`);
    // A non-empty pool must offer more options than picks.
    if (c.skillChoice.from.length > 0)
      assert.ok(c.skillChoice.from.length > c.skillChoice.choose, `${c.id} pool too small`);
  }
});

test('subclass and ASI schedules stay within levels 1-20 and ascend', () => {
  for (const c of DEFAULT_CLASSES) {
    assert.ok(c.subclassLevel >= 1 && c.subclassLevel <= 3, `${c.id} subclass level`);
    assert.ok(typeof c.subclassLabel === 'string' && c.subclassLabel.length > 0);
    assert.ok(c.asiLevels.length >= 5, `${c.id} ASI count`);
    for (let i = 0; i < c.asiLevels.length; i++) {
      const lvl = c.asiLevels[i];
      assert.ok(lvl >= 1 && lvl <= 20, `${c.id} ASI level ${lvl}`);
      if (i > 0) assert.ok(lvl > c.asiLevels[i - 1], `${c.id} ASI order`);
    }
  }
});

test('feature scaffold levels are in range and every class has level-1 features', () => {
  for (const c of DEFAULT_CLASSES) {
    const levels = Object.keys(c.featuresByLevel).map(Number);
    assert.ok(levels.includes(1), `${c.id} missing level-1 features`);
    for (const lvl of levels) {
      assert.ok(lvl >= 1 && lvl <= 20, `${c.id} feature level ${lvl}`);
      assert.ok(c.featuresByLevel[lvl].length > 0, `${c.id} empty feature list at ${lvl}`);
    }
  }
});

test('the skill map holds the 18 skills with valid abilities', () => {
  assert.equal(SKILL_IDS.length, 18);
  for (const id of SKILL_IDS) assert.ok(ABILITIES.has(SKILL_ABILITIES[id]), id);
});

test('skillName renders hyphenated ids as display names', () => {
  assert.equal(skillName('athletics'), 'Athletics');
  assert.equal(skillName('sleight-of-hand'), 'Sleight of Hand');
  assert.equal(skillName('animal-handling'), 'Animal Handling');
});

test('ritual casting is carried by exactly the four SRD ritual classes', () => {
  const ritual = DEFAULT_CLASSES.filter((c) => c.ritual).map((c) => c.id);
  assert.deepEqual(ritual, ['bard', 'cleric', 'druid', 'wizard']);
  // A class that casts nothing can hold no ritual.
  for (const c of DEFAULT_CLASSES) {
    if (c.casterType === 'none') assert.ok(!c.ritual, `${c.id} ritual`);
  }
});
