import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnCopies } from '../src/entities/CreatureTemplate.js';

const wolf = { id: 'wolf', name: 'Gray Wolf', disposition: 'hostile', maxHP: 11, stats: {} };
const at = { nodeId: 'vale', tileId: '3,4' };

test('spawnCopies numbers two or more copies and gives each its own id', () => {
  const copies = spawnCopies(wolf, 3, at, ['gray-wolf-1']);
  assert.deepEqual(
    copies.map((c) => c.name),
    ['Gray Wolf 1', 'Gray Wolf 2', 'Gray Wolf 3'],
  );
  assert.deepEqual(
    copies.map((c) => c.id),
    ['gray-wolf-1-2', 'gray-wolf-2', 'gray-wolf-3'],
  );
  for (const c of copies) {
    assert.equal(c.currentHP, 11);
    assert.deepEqual(c.location, at);
  }
});

test('spawnCopies keeps the template name for a lone copy', () => {
  const [one] = spawnCopies(wolf, 1, at, ['gray-wolf']);
  assert.equal(one.name, 'Gray Wolf');
  assert.equal(one.id, 'gray-wolf-2');
});

test('spawnCopies continues the numbers past the names already in use', () => {
  const taken = ['Gray Wolf 4', 'Gray Wolf 2', 'Gray Wolf x', 'Gray Wolfhound 9', 'Owl 7'];
  const copies = spawnCopies(wolf, 2, at, [], taken);
  assert.deepEqual(
    copies.map((c) => c.name),
    ['Gray Wolf 5', 'Gray Wolf 6'],
  );
});

test('spawnCopies places each copy at its own location, reusing the last one', () => {
  const places = [at, { nodeId: 'vale', tileId: '4,4' }];
  const copies = spawnCopies(wolf, 3, places, []);
  assert.deepEqual(
    copies.map((c) => c.location?.tileId),
    ['3,4', '4,4', '4,4'],
  );
  assert.equal(spawnCopies(wolf, 2, [], [])[0].location, null);
});

test('spawnCopies keeps the template disposition', () => {
  const [guard] = spawnCopies({ ...wolf, name: 'Town Guard', disposition: 'friendly' }, 1, at, []);
  assert.equal(guard.disposition, 'friendly');
});

test('spawnCopies spawns one copy for a count below 1 or not a number', () => {
  assert.equal(spawnCopies(wolf, 0, null, []).length, 1);
  assert.equal(spawnCopies(wolf, Number.NaN, null, []).length, 1);
  assert.equal(spawnCopies(wolf, 2.7, null, []).length, 2);
});
