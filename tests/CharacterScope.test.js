import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterScope } from '../src/app/characterScope.js';

/**
 * A scope over two characters, with a recording panel factory and counters for
 * the two callbacks.
 */
function setup(selectedId = 'hero') {
  let characters = /** @type {any[]} */ ([
    { id: 'hero', name: 'Hero', hp: 10 },
    { id: 'sidekick', name: 'Sidekick', hp: 8 },
  ]);
  const calls = { commit: 0, select: 0 };
  const scope = createCharacterScope({
    getCharacters: () => characters,
    setCharacters: (next) => {
      characters = next;
    },
    onCommit: () => {
      calls.commit += 1;
    },
    onSelect: () => {
      calls.select += 1;
    },
    selectedId,
  });
  /** A registered panel that records everything written into it. */
  const panel = (name) => {
    const seen = /** @type {any[]} */ ([]);
    const self = { name, seen, setCharacter: (c) => seen.push(c) };
    return { ...self, handle: scope.register(() => self) };
  };
  return { scope, calls, panel, characters: () => characters };
}

test('the scope starts on the character it was given', () => {
  const { scope } = setup();
  assert.equal(scope.getSelectedId(), 'hero');
  assert.equal(scope.getSelected()?.name, 'Hero');
});

test('an unknown or null selection resolves to no character', () => {
  assert.equal(setup(null).scope.getSelected(), null);
  assert.equal(setup('ghost').scope.getSelected(), null);
});

test('select points every registered panel at the character and reports it', () => {
  const { scope, calls, panel } = setup();
  const a = panel('a');
  const b = panel('b');
  scope.select('sidekick');
  assert.equal(scope.getSelectedId(), 'sidekick');
  assert.deepEqual(
    a.seen.map((c) => c?.id),
    ['sidekick'],
  );
  assert.deepEqual(
    b.seen.map((c) => c?.id),
    ['sidekick'],
  );
  assert.equal(calls.select, 1);
  assert.equal(calls.commit, 0);
});

test('selecting nobody hands every panel null', () => {
  const { scope, panel } = setup();
  const a = panel('a');
  scope.select(null);
  assert.deepEqual(a.seen, [null]);
});

test('reselect re-reads the current selection from the roster', () => {
  const { scope, panel, characters } = setup();
  const a = panel('a');
  scope.commit({ ...characters()[0], hp: 3 });
  scope.reselect();
  assert.equal(scope.getSelectedId(), 'hero');
  assert.equal(a.seen.at(-1).hp, 3);
});

test("a panel's commit writes the character back and skips that panel", () => {
  const { calls, panel, characters } = setup();
  const sheet = panel('sheet');
  const inventory = panel('inventory');
  const spellbook = panel('spellbook');
  const edited = { id: 'hero', name: 'Hero', hp: 4 };
  sheet.handle.commit(edited);
  assert.equal(characters()[0].hp, 4, 'written into the roster by id');
  assert.equal(characters()[1].hp, 8, 'the other characters are untouched');
  assert.equal(calls.commit, 1);
  assert.deepEqual(sheet.seen, [], 'the panel that made the edit is not written back into');
  assert.deepEqual(inventory.seen, [edited]);
  assert.deepEqual(spellbook.seen, [edited]);
});

test('every panel can commit, and each is skipped in its own turn', () => {
  const { panel } = setup();
  const sheet = panel('sheet');
  const inventory = panel('inventory');
  const first = { id: 'hero', name: 'Hero', hp: 4 };
  const second = { id: 'hero', name: 'Hero', hp: 5 };
  sheet.handle.commit(first);
  inventory.handle.commit(second);
  assert.deepEqual(sheet.seen, [second]);
  assert.deepEqual(inventory.seen, [first]);
});

test('commit alone touches no panel; set reaches all of them', () => {
  const { scope, calls, panel, characters } = setup();
  const sheet = panel('sheet');
  const quiet = { id: 'sidekick', name: 'Sidekick', hp: 1 };
  scope.commit(quiet);
  assert.equal(characters()[1].hp, 1);
  assert.deepEqual(sheet.seen, []);
  const loud = { id: 'hero', name: 'Hero', hp: 2 };
  scope.set(loud);
  assert.deepEqual(sheet.seen, [loud]);
  assert.equal(calls.commit, 2);
  assert.equal(calls.select, 0, 'a write-back is not a selection change');
});

test('committing an id the roster does not hold changes nothing but still fans out', () => {
  const { scope, panel, characters } = setup();
  const sheet = panel('sheet');
  const stranger = { id: 'ghost', name: 'Ghost', hp: 1 };
  scope.set(stranger);
  assert.deepEqual(
    characters().map((c) => c.id),
    ['hero', 'sidekick'],
  );
  assert.deepEqual(sheet.seen, [stranger]);
});

test('a panel that is not mounted yet is skipped rather than throwing', () => {
  const { scope } = setup();
  /** @type {any} */
  let late = null;
  scope.register(() => late);
  scope.select('hero');
  late = { seen: [], setCharacter: (c) => late.seen.push(c) };
  scope.select('sidekick');
  assert.deepEqual(
    late.seen.map((c) => c.id),
    ['sidekick'],
  );
});
