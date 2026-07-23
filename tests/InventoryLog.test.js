import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatInventoryEvent } from '../src/entities/InventoryLog.js';

test('pickup reads as picks up with the added count', () => {
  assert.equal(
    formatInventoryEvent('Hero', { verb: 'pickup', itemName: 'Rope', count: 2 }),
    'Hero picks up Rope x2.',
  );
});

test('pickup context appends region and in-game time when supplied', () => {
  assert.equal(
    formatInventoryEvent('Hero', { verb: 'pickup', itemName: 'Rope', count: 1 }, { region: 'Emberfall Vale', time: 'Day 3, Morning' }),
    'Hero picks up Rope x1 in Emberfall Vale (Day 3, Morning).',
  );
  assert.equal(
    formatInventoryEvent('Hero', { verb: 'pickup', itemName: 'Rope', count: 1 }, { time: 'Day 3, Morning' }),
    'Hero picks up Rope x1 (Day 3, Morning).',
  );
});

test('use and discard ignore context and stay short', () => {
  assert.equal(
    formatInventoryEvent('Hero', { verb: 'use', itemName: 'Potion', count: 1 }, { region: 'Vale', time: 'Day 3' }),
    'Hero uses a Potion.',
  );
});

test('using a single item reads as an article, not a count', () => {
  assert.equal(
    formatInventoryEvent('Hero', { verb: 'use', itemName: 'Potion', count: 1 }),
    'Hero uses a Potion.',
  );
});

test('using several items reads with the count', () => {
  assert.equal(
    formatInventoryEvent('Hero', { verb: 'use', itemName: 'Arrows', count: 3 }),
    'Hero uses 3 Arrows.',
  );
});

test('discard reads as discards with the whole stack count', () => {
  assert.equal(
    formatInventoryEvent('Hero', { verb: 'discard', itemName: 'Rope', count: 5 }),
    'Hero discards Rope x5.',
  );
});
