import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  derive,
  withClasses,
  withRace,
  withCustomRace,
  withProficiencies,
  withExpertise,
  applyASI,
  undoLastChoice,
  setStat,
} from '../src/entities/Progression.js';
import {
  createCharacter,
  withDefaults,
  withHP,
  getHP,
  setMaxHP,
} from '../src/entities/Character.js';
import {
  classMaxHP,
  reconcileMaxHP,
  withHitDice,
  getHitDicePools,
} from '../src/entities/HitDice.js';
import { withSpellSlots, getSlotPools } from '../src/entities/SpellSlots.js';
import { getProficiencies } from '../src/entities/Proficiencies.js';

/**
 * @param {import('../src/types/class.js').ClassRef[]} classes
 * @param {Record<string, number>} [stats]
 * @param {number} [level]
 */
function classed(classes, stats = {}, level = classes.reduce((s, r) => s + r.level, 0)) {
  const base = { ...createCharacter('c1', 'Bron', { CON: 14, ...stats }), classes, level };
  return withHitDice(withHP(base, classMaxHP(base) ?? 10));
}

test('reconcileMaxHP moves the maximum onto the class rule, carrying current with it', () => {
  const fighter = classed([{ classId: 'fighter', level: 3 }]);
  assert.equal(getHP(fighter).max, 28);

  // A save whose stored pool drifted below the class rule: the shortfall is
  // granted rather than only unlocked.
  const stale = { ...fighter, resources: [{ ...getHP(fighter), max: 20, current: 15 }] };
  const fixed = reconcileMaxHP(stale);
  assert.equal(getHP(fixed).max, 28);
  assert.equal(getHP(fixed).current, 23);
});

test('reconcileMaxHP clamps a shrinking pool and never goes below zero', () => {
  const fighter = classed([{ classId: 'fighter', level: 3 }]);
  const inflated = { ...fighter, resources: [{ ...getHP(fighter), max: 100, current: 4 }] };
  const fixed = reconcileMaxHP(inflated);
  assert.equal(getHP(fixed).max, 28);
  assert.equal(getHP(fixed).current, 0, 'a 72-point drop takes 4 below zero, clamped');
});

test('reconcileMaxHP leaves the classless, the pool-less, and an override alone', () => {
  const classless = withHP(createCharacter('c1', 'Nim'), 30);
  assert.equal(reconcileMaxHP(classless), classless);

  const poolless = classed([{ classId: 'fighter', level: 3 }]);
  const stripped = { ...poolless, resources: [] };
  assert.equal(reconcileMaxHP(stripped), stripped);

  const overridden = setMaxHP(classed([{ classId: 'fighter', level: 3 }]), 99);
  assert.equal(getHP(reconcileMaxHP(overridden)).max, 99);
});

test('reconcileMaxHP returns the same character when nothing has drifted', () => {
  const fighter = classed([{ classId: 'fighter', level: 3 }]);
  assert.equal(reconcileMaxHP(fighter), fighter);
});

test('derive re-reads every pool from the class list at once', () => {
  const cleric = withSpellSlots(classed([{ classId: 'cleric', level: 1 }]));
  // Hand-edit the class list past the pools, the way a save file could.
  const bumped = derive({ ...cleric, level: 5, classes: [{ classId: 'cleric', level: 5 }] });
  assert.equal(getHP(bumped).max, 10 + 4 * 7);
  assert.deepEqual(
    getHitDicePools(bumped).map((r) => ({ id: r.id, max: r.max })),
    [{ id: 'hit-dice-d8', max: 5 }],
  );
  assert.deepEqual(
    getSlotPools(bumped).map((r) => r.max),
    [4, 3, 2],
  );
});

test('withDefaults reconciles a save whose stored pools have gone stale', () => {
  const fighter = classed([{ classId: 'fighter', level: 3 }]);
  // CON hand-edited between sessions; the stored pool still reads CON 14.
  const stale = { ...fighter, stats: { ...fighter.stats, CON: 18 } };
  const loaded = withDefaults(stale);
  assert.equal(getHP(loaded).max, 14 + 2 * 10, 'CON 18 is worth +4 at every level');
  assert.deepEqual(
    getHitDicePools(loaded).map((r) => r.max),
    [3],
  );
});

test('applyASI grants the retroactive HP a CON increase is worth, and undo takes it back', () => {
  const fighter = classed([{ classId: 'fighter', level: 4 }], { STR: 16 }, 4);
  assert.equal(getHP(fighter).max, 12 + 3 * 8);

  const improved = applyASI(fighter, { CON: 2 });
  assert.equal(improved.stats.CON, 16);
  assert.equal(getHP(improved).max, 13 + 3 * 9, '+1 CON modifier at every one of four levels');

  const undone = undoLastChoice(improved);
  assert.equal(undone.stats.CON, 14);
  assert.equal(getHP(undone).max, 12 + 3 * 8);
});

test('setStat re-derives, so a CON edit moves the pool', () => {
  const fighter = classed([{ classId: 'fighter', level: 2 }]);
  assert.equal(getHP(setStat(fighter, 'CON', 8)).max, 9 + 1 * 5);
  assert.equal(getHP(setStat(fighter, 'STR', 20)).max, 20, 'an unrelated stat changes nothing');
});

test('withRace re-derives, so a racial CON increase moves the pool', () => {
  const fighter = classed([{ classId: 'fighter', level: 2 }]);
  assert.equal(getHP(fighter).max, 20);
  const dwarf = withRace(fighter, 'dwarf');
  assert.equal(dwarf.raceId, 'dwarf');
  assert.equal(dwarf.stats.CON, 16);
  assert.equal(getHP(dwarf).max, 22, '+2 CON is one more modifier point at both levels');
  // Dropping the race takes the increase, and the HP it was worth, back off.
  assert.equal(getHP(withCustomRace(dwarf, 'Githzerai')).max, 20);
});

test('the deriving writers preserve identity when the underlying write is a no-op', () => {
  const fighter = classed([{ classId: 'fighter', level: 2 }]);
  assert.equal(withRace(fighter, 'modron'), fighter, 'unknown race id');
  assert.equal(applyASI(fighter, { STR: 3 }), fighter, 'invalid increase');
});

test('withClasses and withProficiencies keep their underlying behavior', () => {
  const c = withClasses(createCharacter('c1', 'Bron'), [
    { classId: 'fighter', level: 0 },
    { classId: '', level: 3 },
  ]);
  assert.deepEqual(c.classes, [{ classId: 'fighter', level: 1 }]);
  assert.deepEqual(
    getProficiencies(withProficiencies(c, { skills: ['stealth', 'stealth'] })).skills,
    ['stealth'],
  );
});

test('withExpertise re-derives and keeps expertise inside the proficient skills', () => {
  const fighter = withProficiencies(classed([{ classId: 'fighter', level: 3 }]), {
    skills: ['stealth'],
  });
  const expert = withExpertise(fighter, ['stealth', 'arcana']);
  assert.deepEqual(getProficiencies(expert).expertise, ['stealth'], 'arcana is not proficient');
  assert.deepEqual(getProficiencies(expert).skills, ['stealth'], 'the skills list is untouched');
  // Deriving runs on the way out, so the hit-dice pools still match the classes.
  assert.deepEqual(
    getHitDicePools(expert).map((pool) => pool.max),
    getHitDicePools(fighter).map((pool) => pool.max),
  );
  assert.deepEqual(getProficiencies(withExpertise(expert, [])).expertise, [], 'a clear works');
});
