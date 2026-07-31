import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetDeps, sameDeps, spellListDeps } from '../src/view/SheetStructure.js';
import {
  createCharacter,
  withHP,
  damageCharacter,
  setBonusHP,
  setBaseAC,
  setMaxHP,
  addResource,
  addXP,
  spendResource,
} from '../src/entities/Character.js';

const perms = { editBase: true, play: true, hp: true, restore: true };

/** @param {import('../src/types/entities.js').Character} a @param {import('../src/types/entities.js').Character} b */
const same = (a, b) => sameDeps(sheetDeps(a, perms), sheetDeps(b, perms));

const hero = withHP(createCharacter('hero', 'Hero'), 20);

test('sameDeps rejects a missing previous list', () => {
  assert.equal(sameDeps(null, sheetDeps(hero, perms)), false);
});

test('the same character twice is the same structure', () => {
  assert.equal(same(hero, hero), true);
  assert.equal(same(hero, { ...hero }), true);
});

test('pool levels, bonus HP, base AC, name, and conditions leave the structure alone', () => {
  assert.equal(same(hero, damageCharacter(hero, 5)), true);
  assert.equal(same(hero, setBonusHP(hero, 4)), true);
  assert.equal(same(hero, setBaseAC(hero, 13)), true);
  assert.equal(same(hero, { ...hero, name: 'Renamed' }), true);
  assert.equal(same(hero, { ...hero, conditions: [{ name: 'Prone', rounds: null }] }), true);
});

test('a different character is a different structure even at identical values', () => {
  assert.equal(same(hero, { ...hero, id: 'other' }), false);
});

test('the permissions are part of the structure', () => {
  assert.equal(sameDeps(sheetDeps(hero, perms), sheetDeps(hero, { ...perms, hp: false })), false);
  assert.equal(
    sameDeps(sheetDeps(hero, perms), sheetDeps(hero, { ...perms, restore: false })),
    false,
  );
});

test('a new maximum, a new pool, or a renamed pool rebuilds', () => {
  assert.equal(same(hero, setMaxHP(hero, 30)), false);
  const withPool = addResource(hero, { id: 'ki', name: 'Ki', current: 3, max: 3 });
  assert.equal(same(hero, withPool), false);
  const renamed = {
    ...withPool,
    resources: withPool.resources.map((p) => (p.id === 'ki' ? { ...p, name: 'Focus' } : p)),
  };
  assert.equal(same(withPool, renamed), false);
});

test('spending a custom pool does not rebuild, but spending a hit die does', () => {
  const monk = addResource(hero, { id: 'ki', name: 'Ki', current: 3, max: 3 });
  assert.equal(same(monk, spendResource(monk, 'ki', 1)), true);
  const withDice = addResource(hero, {
    id: 'hit-dice-d8',
    name: 'Hit dice d8',
    current: 2,
    max: 2,
  });
  assert.equal(same(withDice, spendResource(withDice, 'hit-dice-d8', 1)), false);
});

test('a new spell catalog rebuilds, the same one does not', () => {
  const catalog = { spells: [] };
  assert.equal(sameDeps(sheetDeps(hero, perms, catalog), sheetDeps(hero, perms, catalog)), true);
  assert.equal(
    sameDeps(sheetDeps(hero, perms, catalog), sheetDeps(hero, perms, { spells: [] })),
    false,
  );
  // No stamp at all (a host that wired no spell section) still compares equal.
  assert.equal(sameDeps(sheetDeps(hero, perms), sheetDeps(hero, perms)), true);
  assert.equal(sameDeps(sheetDeps(hero, perms), sheetDeps(hero, perms, catalog)), false);
});

/** The spell list's deps for a character knowing `known`, offered `learnable`. */
function spellDeps(character, known, learnable, play = true, stamp = 1) {
  return spellListDeps(character, known, new Set(learnable), play, stamp);
}

test('learning a spell the classes already offer leaves the row list alone', () => {
  const before = spellDeps(hero, [], ['fireball']);
  const after = spellDeps(hero, ['fireball'], ['fireball']);
  assert.equal(sameDeps(before, after), true);
});

test('learning a spell the classes do not offer adds a row', () => {
  const before = spellDeps(hero, [], ['fireball']);
  const after = spellDeps(hero, ['wish'], ['fireball']);
  assert.equal(sameDeps(before, after), false);
});

test('the order the outsiders were learned in does not matter', () => {
  assert.equal(
    sameDeps(spellDeps(hero, ['wish', 'bless'], []), spellDeps(hero, ['bless', 'wish'], [])),
    true,
  );
});

test('a new character, level, class list, permission, or catalog rebuilds the list', () => {
  const base = spellDeps(hero, [], ['fireball']);
  assert.equal(sameDeps(base, spellDeps({ ...hero, id: 'other' }, [], ['fireball'])), false);
  assert.equal(sameDeps(base, spellDeps({ ...hero, level: 9 }, [], ['fireball'])), false);
  assert.equal(
    sameDeps(
      base,
      spellDeps({ ...hero, classes: [{ classId: 'bard', level: 1 }] }, [], ['fireball']),
    ),
    false,
  );
  assert.equal(sameDeps(base, spellDeps(hero, [], ['fireball'], false)), false);
  assert.equal(sameDeps(base, spellDeps(hero, [], ['fireball'], true, 2)), false);
});

test('level, XP, stats, classes, inventory, and the spellbook all rebuild', () => {
  assert.equal(same(hero, addXP(hero, 500)), false);
  assert.equal(same(hero, { ...hero, level: hero.level + 1 }), false);
  assert.equal(same(hero, { ...hero, stats: { ...hero.stats, STR: 18 } }), false);
  assert.equal(same(hero, { ...hero, classes: [{ classId: 'fighter', level: 1 }] }), false);
  assert.equal(same(hero, { ...hero, inventory: [...hero.inventory] }), false);
  assert.equal(
    same(hero, { ...hero, spellbook: { cantrips: [], spells: [], prepared: [] } }),
    false,
  );
});
