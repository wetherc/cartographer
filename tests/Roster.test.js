import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugId, replaceById, updateById, applyFresh, removeById } from '../src/entities/Roster.js';

test('slugId kebab-cases the name', () => {
  assert.equal(slugId('Brother Aldous', []), 'brother-aldous');
});

test('slugId strips punctuation and trims dashes', () => {
  assert.equal(slugId("  D'artagnan the 3rd! ", []), 'd-artagnan-the-3rd');
});

test('slugId falls back to "entry" when nothing usable remains', () => {
  assert.equal(slugId('!!!', []), 'entry');
});

test('slugId suffixes to avoid collisions, skipping taken suffixes', () => {
  assert.equal(slugId('Goblin', ['goblin']), 'goblin-2');
  assert.equal(slugId('Goblin', ['goblin', 'goblin-2']), 'goblin-3');
});

test('replaceById swaps only the matching entry', () => {
  const list = [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
  ];
  const next = replaceById(list, { id: 'b', v: 9 });
  assert.deepEqual(next, [
    { id: 'a', v: 1 },
    { id: 'b', v: 9 },
  ]);
  assert.equal(list[1].v, 2, 'input list untouched');
});

test('replaceById with an unknown id changes nothing', () => {
  const list = [{ id: 'a', v: 1 }];
  assert.deepEqual(replaceById(list, { id: 'x', v: 5 }), list);
});

test('updateById patches only the matching entry, leaving the others identical', () => {
  const list = [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
  ];
  const next = updateById(list, 'b', (entry) => ({ ...entry, v: entry.v + 10 }));
  assert.deepEqual(next, [
    { id: 'a', v: 1 },
    { id: 'b', v: 12 },
  ]);
  assert.equal(next[0], list[0], 'untouched entries keep their identity');
  assert.equal(list[1].v, 2, 'input list untouched');
});

test('updateById with an unknown id calls nothing and changes nothing', () => {
  const list = [{ id: 'a', v: 1 }];
  let calls = 0;
  const next = updateById(list, 'x', (entry) => {
    calls += 1;
    return entry;
  });
  assert.equal(calls, 0);
  assert.deepEqual(next, list);
});

test('removeById drops the matching entry and tolerates a missing id', () => {
  const list = [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
  ];
  assert.deepEqual(removeById(list, 'a'), [{ id: 'b', v: 2 }]);
  assert.deepEqual(removeById(list, 'zzz'), list);
});

test('slugId reads a Set of taken ids as it is and leaves it unchanged', () => {
  const taken = new Set(['goblin', 'goblin-2']);
  assert.equal(slugId('Goblin', taken), 'goblin-3');
  assert.deepEqual([...taken], ['goblin', 'goblin-2'], 'the caller owns the set');
  assert.equal(slugId('Ogre', taken), 'ogre');
});

test('applyFresh edits the entry as it is in the list now, not a captured copy', () => {
  const stale = { id: 'a', hp: 5 };
  const list = [
    { id: 'a', hp: 9 },
    { id: 'b', hp: 2 },
  ];
  /** @type {any[]} */
  const seen = [];
  const { list: next, entity } = applyFresh(list, stale.id, (current) => {
    seen.push(current);
    return { ...current, name: 'edited' };
  });
  assert.deepEqual(seen, [{ id: 'a', hp: 9 }], 'the edit sees the current entry');
  assert.deepEqual(entity, { id: 'a', hp: 9, name: 'edited' });
  assert.deepEqual(next, [
    { id: 'a', hp: 9, name: 'edited' },
    { id: 'b', hp: 2 },
  ]);
  assert.deepEqual(
    list,
    [
      { id: 'a', hp: 9 },
      { id: 'b', hp: 2 },
    ],
    'the input is untouched',
  );
});

test('applyFresh returns the same list and a null entity when the id is gone', () => {
  const list = [{ id: 'b', hp: 2 }];
  let calls = 0;
  const { list: next, entity } = applyFresh(list, 'a', (current) => {
    calls += 1;
    return current;
  });
  assert.equal(calls, 0, 'nothing is edited');
  assert.equal(entity, null);
  assert.equal(next, list, 'the very same array comes back');
});
