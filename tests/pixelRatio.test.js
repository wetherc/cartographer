import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchPixelRatio } from '../src/ui/pixelRatio.js';

/** A stub matchMedia that records each query and its listeners. */
function media() {
  /** @type {{ query: string, listeners: Set<() => void> }[]} */
  const queries = [];
  /** @param {string} query */
  const matchMedia = (query) => {
    /** @type {Set<() => void>} */
    const listeners = new Set();
    queries.push({ query, listeners });
    return /** @type {any} */ ({
      addEventListener: (/** @type {string} */ _type, /** @type {() => void} */ fn) =>
        listeners.add(fn),
      removeEventListener: (/** @type {string} */ _type, /** @type {() => void} */ fn) =>
        listeners.delete(fn),
    });
  };
  return { queries, matchMedia };
}

test('a ratio change calls back and arms a query for the new ratio', () => {
  const { queries, matchMedia } = media();
  let ratio = 2;
  let calls = 0;
  watchPixelRatio(() => calls++, { matchMedia, ratio: () => ratio });
  assert.deepEqual(
    queries.map((q) => q.query),
    ['(resolution: 2dppx)'],
  );
  ratio = 1;
  for (const fn of [...queries[0].listeners]) fn();
  assert.equal(calls, 1);
  assert.equal(queries[0].listeners.size, 0);
  assert.equal(queries[1].query, '(resolution: 1dppx)');
  assert.equal(queries[1].listeners.size, 1);
});

test('the stop function removes the armed listener', () => {
  const { queries, matchMedia } = media();
  const stop = watchPixelRatio(() => {}, { matchMedia, ratio: () => 1.5 });
  stop();
  assert.equal(queries[0].listeners.size, 0);
});

test('the watcher reads the window globals by default', (t) => {
  const { queries, matchMedia } = media();
  const g = /** @type {any} */ (globalThis);
  const before = g.window;
  g.window = { matchMedia, devicePixelRatio: 0 };
  t.after(() => {
    g.window = before;
  });
  watchPixelRatio(() => {})();
  assert.equal(queries[0].query, '(resolution: 1dppx)');
});
