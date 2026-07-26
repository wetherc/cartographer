import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetsPrereq, canMulticlass, assignLevel } from '../src/entities/LevelAssign.js';
import { createCharacter, addXP, getHP, withHP, getClasses } from '../src/entities/Character.js';
import { getProficiencies } from '../src/entities/Proficiencies.js';
import { withHitDice, getHitDicePools } from '../src/entities/HitDice.js';
import { pendingLevels } from '../src/entities/Multiclass.js';

/**
 * @param {{ classId: string, level: number }[]} classes
 * @param {Record<string, number>} [stats]
 * @param {number} [level] override; defaults to the class levels' sum
 */
function classed(classes, stats = {}, level = classes.reduce((s, r) => s + r.level, 0)) {
  return { ...createCharacter('c1', 'Bron', { STR: 16, CON: 14, ...stats }), classes, level };
}

test('meetsPrereq accepts any satisfied alternative; missing stats read 10', () => {
  const c = classed([{ classId: 'fighter', level: 1 }]);
  assert.equal(meetsPrereq(c, 'fighter'), true); // STR 16
  assert.equal(meetsPrereq({ ...c, stats: { DEX: 13 } }, 'fighter'), true);
  assert.equal(meetsPrereq({ ...c, stats: { STR: 8, DEX: 8 } }, 'fighter'), false);
  assert.equal(meetsPrereq({ ...c, stats: undefined }, 'fighter'), false);
  assert.equal(meetsPrereq(c, 'bogus'), false);
});

test('meetsPrereq requires every minimum of an AND-group', () => {
  const c = classed([{ classId: 'fighter', level: 1 }], { CHA: 13 });
  assert.equal(meetsPrereq({ ...c, stats: { STR: 13, CHA: 13 } }, 'paladin'), true);
  assert.equal(meetsPrereq({ ...c, stats: { STR: 16, CHA: 8 } }, 'paladin'), false);
});

test('canMulticlass gates on the new class, every current class, and novelty', () => {
  const c = classed([{ classId: 'fighter', level: 3 }], { INT: 16, DEX: 8 });
  assert.equal(canMulticlass(c, 'wizard'), true);
  assert.equal(canMulticlass(c, 'rogue'), false); // DEX 8 < 13
  assert.equal(canMulticlass(c, 'fighter'), false); // already held
  assert.equal(canMulticlass(c, 'bogus'), false);
  const weak = { ...c, stats: { STR: 8, DEX: 8, INT: 16 } };
  assert.equal(canMulticlass(weak, 'wizard'), false); // fighter prereq lost
});

test('canMulticlass skips prerequisite checks for unknown current classes', () => {
  const c = classed([{ classId: 'homebrew', level: 3 }], { INT: 16 });
  assert.equal(canMulticlass(c, 'wizard'), true);
});

test('assignLevel raises an existing class with a pending level and grows HP', () => {
  const c = withHitDice(
    withHP(
      classed(
        [
          { classId: 'fighter', level: 3 },
          { classId: 'rogue', level: 1 },
        ],
        { DEX: 14 },
        5,
      ),
      40,
    ),
  );
  const next = assignLevel(c, 'rogue');
  assert.deepEqual(getClasses(next), [
    { classId: 'fighter', level: 3 },
    { classId: 'rogue', level: 2 },
  ]);
  assert.equal(pendingLevels(next), 0);
  assert.equal(getHP(next).max, 47); // d8 average 5 + CON 2
  assert.deepEqual(
    getHitDicePools(next).map((r) => ({ id: r.id, max: r.max })),
    [
      { id: 'hit-dice-d10', max: 3 },
      { id: 'hit-dice-d8', max: 2 },
    ],
  );
});

test('assignLevel without a pending level leaves an existing class unchanged', () => {
  const c = classed([
    { classId: 'fighter', level: 3 },
    { classId: 'rogue', level: 1 },
  ]);
  assert.equal(assignLevel(c, 'rogue'), c);
});

test('assignLevel starts a new class off a pending level with the reduced grant', () => {
  const c = withHP(classed([{ classId: 'fighter', level: 4 }], { WIS: 14 }, 5), 40);
  const next = assignLevel(c, 'cleric');
  assert.deepEqual(getClasses(next), [
    { classId: 'fighter', level: 4 },
    { classId: 'cleric', level: 1 },
  ]);
  assert.equal(getHP(next).max, 47);
  const p = getProficiencies(next);
  assert.deepEqual(p.armor, ['light', 'medium', 'shield']);
  assert.deepEqual(p.saves, []); // no saving throws from a later class
});

test('assignLevel refuses a new class whose prerequisite is unmet', () => {
  const c = classed([{ classId: 'fighter', level: 4 }], { WIS: 8 }, 5);
  assert.equal(assignLevel(c, 'cleric'), c);
  assert.equal(assignLevel(c, 'bogus'), c);
});

test("a single-class character's newest level can move into a new class", () => {
  const c = withHitDice(withHP(classed([{ classId: 'fighter', level: 5 }], { DEX: 14 }), 44));
  const next = assignLevel(c, 'rogue');
  assert.deepEqual(getClasses(next), [
    { classId: 'fighter', level: 4 },
    { classId: 'rogue', level: 1 },
  ]);
  assert.equal(next.level, 5);
  assert.equal(getHP(next).max, 43); // d8 gain 7 replaces d10 gain 8
  assert.deepEqual(
    getHitDicePools(next).map((r) => ({ id: r.id, max: r.max })),
    [
      { id: 'hit-dice-d10', max: 4 },
      { id: 'hit-dice-d8', max: 1 },
    ],
  );
  const p = getProficiencies(next);
  assert.deepEqual(p.tools, ["thieves' tools"]);
  assert.deepEqual(p.armor, ['light']);
});

test('a level transfer between equal hit dice leaves HP alone', () => {
  const c = withHP(classed([{ classId: 'fighter', level: 3 }], { CHA: 14 }), 30);
  const next = assignLevel(c, 'paladin');
  assert.equal(getHP(next).max, 30);
  assert.deepEqual(getClasses(next), [
    { classId: 'fighter', level: 2 },
    { classId: 'paladin', level: 1 },
  ]);
});

test('a shrinking HP pool clamps at 1', () => {
  const c = withHP(classed([{ classId: 'fighter', level: 2 }], { DEX: 14 }), 1);
  const next = assignLevel(c, 'rogue');
  assert.equal(getHP(next).max, 1);
  assert.equal(getHP(next).current, 0);
});

test('assignLevel needs a level to move: level 1 or classless stays unchanged', () => {
  const one = classed([{ classId: 'fighter', level: 1 }], { DEX: 14 });
  assert.equal(assignLevel(one, 'rogue'), one);
  const none = createCharacter('c1', 'Nim', { DEX: 14 });
  assert.equal(assignLevel(none, 'rogue'), none);
});

test('addXP defers a multiclass character HP growth to assignment', () => {
  const c = withHP(
    classed(
      [
        { classId: 'fighter', level: 1 },
        { classId: 'rogue', level: 1 },
      ],
      { DEX: 14 },
    ),
    20,
  );
  const leveled = addXP(c, 200); // level 2 -> 3, pending
  assert.equal(getHP(leveled).max, 20);
  assert.equal(pendingLevels(leveled), 1);
  assert.equal(getHP(assignLevel(leveled, 'fighter')).max, 28);
  assert.equal(getHP(addXP(c, 200, { hpGrowth: 5 })).max, 25); // explicit override
});
