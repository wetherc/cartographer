import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meetsPrereq,
  canMulticlass,
  assignLevel,
  assignOptions,
  className,
  prereqText,
} from '../src/entities/LevelAssign.js';
import { getClass } from '../src/entities/Classes.js';
import {
  createCharacter,
  addXP,
  getHP,
  withHP,
  setMaxHP,
  getClasses,
} from '../src/entities/Character.js';
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
      35, // d10 + CON 2, then 2 fighter levels at 8 and 1 rogue level at 7
    ),
  );
  const next = assignLevel(c, 'rogue');
  assert.deepEqual(getClasses(next), [
    { classId: 'fighter', level: 3 },
    { classId: 'rogue', level: 2 },
  ]);
  assert.equal(pendingLevels(next), 0);
  assert.equal(getHP(next).max, 42); // d8 average 5 + CON 2
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
  const c = withHP(classed([{ classId: 'fighter', level: 4 }], { WIS: 14 }, 5), 36);
  const next = assignLevel(c, 'cleric');
  assert.deepEqual(getClasses(next), [
    { classId: 'fighter', level: 4 },
    { classId: 'cleric', level: 1 },
  ]);
  assert.equal(getHP(next).max, 43); // d8 average 5 + CON 2
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
  const c = withHP(classed([{ classId: 'fighter', level: 3 }], { CHA: 14 }), 28);
  const next = assignLevel(c, 'paladin');
  assert.equal(getHP(next).max, 28, 'both are d10, so the moved level is worth the same');
  assert.deepEqual(getClasses(next), [
    { classId: 'fighter', level: 2 },
    { classId: 'paladin', level: 1 },
  ]);
});

test('a hand-set HP maximum survives a class assignment', () => {
  const c = setMaxHP(withHP(classed([{ classId: 'fighter', level: 2 }], { DEX: 14 }), 20), 5);
  const next = assignLevel(c, 'rogue');
  assert.deepEqual(getClasses(next), [
    { classId: 'fighter', level: 1 },
    { classId: 'rogue', level: 1 },
  ]);
  assert.equal(getHP(next).max, 5, 'the override takes the character off the derived rule');
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
    19, // d10 + CON 2, plus one rogue level at 7
  );
  const leveled = addXP(c, 200); // level 2 -> 3, pending
  assert.equal(getHP(leveled).max, 19);
  assert.equal(pendingLevels(leveled), 1);
  assert.equal(getHP(assignLevel(leveled, 'fighter')).max, 27);
  assert.equal(getHP(addXP(c, 200, { hpGrowth: 5 })).max, 24); // explicit override
});

test('className resolves a known class and falls back to the id', () => {
  assert.equal(className('fighter'), 'Fighter');
  assert.equal(className('bogus'), 'bogus');
});

test('prereqText joins one alternative with "and" and several with "or"', () => {
  assert.equal(prereqText(getClass('rogue')), 'DEX 13');
  assert.equal(prereqText(getClass('fighter')), 'STR 13 or DEX 13');
  assert.equal(prereqText(getClass('monk')), 'DEX 13 and WIS 13');
});

test('a pending level offers every held class one level up', () => {
  const c = classed(
    [
      { classId: 'fighter', level: 2 },
      { classId: 'rogue', level: 1 },
    ],
    { DEX: 14 },
    4, // one level earned and unassigned
  );
  const labels = assignOptions(c).map((o) => o.label);
  assert.ok(labels.includes('Fighter: level 2 -> 3'));
  assert.ok(labels.includes('Rogue: level 1 -> 2'));
});

test('a class the build no longer has is not offered a level', () => {
  const c = classed([{ classId: 'bogus', level: 1 }], {}, 2);
  assert.equal(
    assignOptions(c).some((o) => o.value === 'bogus'),
    false,
  );
});

test('a class the prerequisites allow is offered as a new one at level 1', () => {
  const c = classed([{ classId: 'fighter', level: 1 }], { DEX: 14 }, 2);
  const rogue = assignOptions(c).find((o) => o.value === 'rogue');
  assert.deepEqual(rogue, { value: 'rogue', label: 'Rogue: new class at level 1' });
});

test('a class the character cannot meet is listed disabled, naming its own requirement', () => {
  const c = classed([{ classId: 'fighter', level: 1 }], { INT: 8 }, 2);
  const wizard = assignOptions(c).find((o) => o.value === 'wizard');
  assert.deepEqual(wizard, {
    value: 'wizard',
    label: 'Wizard: requires INT 13',
    disabled: true,
  });
});

test('a held class that blocks leaving is named instead of the new class', () => {
  // Rogue 2 with DEX 13 (so rogue itself is met) and INT 13 (so wizard is met):
  // nothing blocks, and wizard is offered.
  const ok = classed([{ classId: 'rogue', level: 2 }], { DEX: 13, INT: 13 });
  assert.equal(assignOptions(ok).find((o) => o.value === 'wizard')?.disabled, undefined);
  // The same character with DEX 8 meets wizard but can no longer leave rogue, so
  // the requirement quoted is rogue's, with the class it belongs to.
  const stuck = classed([{ classId: 'rogue', level: 2 }], { DEX: 8, INT: 13 });
  assert.deepEqual(
    assignOptions(stuck).find((o) => o.value === 'wizard'),
    {
      value: 'wizard',
      label: 'Wizard: requires DEX 13 (Rogue)',
      disabled: true,
    },
  );
});

test('the usable options all come before the disabled ones', () => {
  const c = classed([{ classId: 'fighter', level: 2 }], { STR: 16, DEX: 14 });
  const options = assignOptions(c);
  const lastUsable = options.findLastIndex((o) => !o.disabled);
  const firstDisabled = options.findIndex((o) => o.disabled);
  assert.ok(lastUsable >= 0 && firstDisabled >= 0);
  assert.ok(lastUsable < firstDisabled);
});

test('a level 1 single-class character with nothing pending has nothing to assign', () => {
  const c = classed([{ classId: 'fighter', level: 1 }], { DEX: 14 });
  assert.deepEqual(assignOptions(c), []);
});

test('a multiclass character with nothing pending has nothing to assign either', () => {
  const c = classed(
    [
      { classId: 'fighter', level: 1 },
      { classId: 'rogue', level: 1 },
    ],
    { DEX: 14 },
  );
  assert.deepEqual(assignOptions(c), []);
});

test('a classless character with a pending level is offered every class it qualifies for', () => {
  const c = { ...createCharacter('c1', 'Nim', { DEX: 14 }), level: 1 };
  const options = assignOptions(c);
  assert.equal(options.find((o) => o.value === 'rogue')?.disabled, undefined);
  assert.equal(
    options.every((o) => o.label.includes('new class at level 1') || o.disabled),
    true,
  );
});

test('a class with no prerequisite at all reads as empty text', () => {
  assert.equal(prereqText({ ...getClass('rogue'), multiclassPrereq: [] }), '');
});
