import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugId, replaceById, removeById } from '../src/entities/Roster.js';

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

test('removeById drops the matching entry and tolerates a missing id', () => {
  const list = [
    { id: 'a', v: 1 },
    { id: 'b', v: 2 },
  ];
  assert.deepEqual(removeById(list, 'a'), [{ id: 'b', v: 2 }]);
  assert.deepEqual(removeById(list, 'zzz'), list);
});
