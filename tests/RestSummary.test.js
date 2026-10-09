import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoredPoolNames, shortRestToast } from '../src/view/RestSummary.js';

/** @param {string} id @param {{ id: string, name: string, current: number }[]} resources */
const hero = (id, resources) => /** @type {any} */ ({ id, name: id, resources });
const pool = (
  /** @type {string} */ id,
  /** @type {string} */ name,
  /** @type {number} */ current,
) => ({
  id,
  name,
  current,
});

test('restoredPoolNames lists each refilled pool once, in party order, without HP', () => {
  const before = [
    hero('a', [
      pool('hp', 'Hit points', 3),
      pool('sw', 'Second Wind', 0),
      pool('as', 'Action Surge', 0),
    ]),
    hero('b', [pool('sw', 'Second Wind', 0), pool('ki', 'Ki points', 4)]),
  ];
  const after = [
    hero('a', [
      pool('hp', 'Hit points', 9),
      pool('sw', 'Second Wind', 1),
      pool('as', 'Action Surge', 1),
    ]),
    hero('b', [pool('sw', 'Second Wind', 1), pool('ki', 'Ki points', 4)]),
  ];
  assert.deepEqual(restoredPoolNames(before, after), ['Second Wind', 'Action Surge']);
});

test('restoredPoolNames ignores a pool with no copy before the rest', () => {
  const after = [hero('a', [pool('new', 'New pool', 2)])];
  assert.deepEqual(restoredPoolNames([hero('a', [])], after), []);
  assert.deepEqual(restoredPoolNames([], after), []);
});

test('shortRestToast names the hour, the pools, and the new time', () => {
  assert.equal(
    shortRestToast([], 'Day 1, Dawn'),
    'Short rest: 1 hour. Nothing to restore. Now Day 1, Dawn.',
  );
  assert.equal(
    shortRestToast(['Second Wind'], 'Day 1, Dawn'),
    'Short rest: 1 hour. Second Wind restored. Now Day 1, Dawn.',
  );
  assert.equal(
    shortRestToast(['Second Wind', 'Action Surge'], 'Day 1, Dawn'),
    'Short rest: 1 hour. Second Wind and Action Surge restored. Now Day 1, Dawn.',
  );
  assert.equal(
    shortRestToast(['Ki points', 'Second Wind', 'Action Surge'], 'Day 2, Night'),
    'Short rest: 1 hour. Ki points, Second Wind, and Action Surge restored. Now Day 2, Night.',
  );
});
