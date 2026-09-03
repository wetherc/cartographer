import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onIdle } from '../src/util/idle.js';

/**
 * `onIdle` picks between the two ways to defer work. These tests swap the
 * global the picker reads, so neither branch needs a browser.
 */

test('onIdle uses requestIdleCallback with a timeout where it exists', () => {
  /** @type {any[]} */
  const calls = [];
  const host = /** @type {any} */ (globalThis);
  host.requestIdleCallback = (/** @type {any} */ fn, /** @type {any} */ options) => {
    calls.push(options);
    fn();
  };
  try {
    let ran = false;
    onIdle(() => {
      ran = true;
    }, 500);
    assert.equal(ran, true);
    assert.deepEqual(calls, [{ timeout: 500 }]);
  } finally {
    delete host.requestIdleCallback;
  }
});

test('onIdle falls back to a timer where requestIdleCallback is missing', async () => {
  const host = /** @type {any} */ (globalThis);
  assert.equal(host.requestIdleCallback, undefined, 'the fallback branch is the one under test');
  const ran = await new Promise((resolve) => {
    onIdle(() => resolve(true));
  });
  assert.equal(ran, true);
});
