import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onIdle, runStepsWhenIdle } from '../src/util/idle.js';

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

test('the timer fallback hands the work a budget that runs down', async () => {
  const left = await new Promise((resolve) => {
    onIdle((deadline) => resolve(deadline.timeRemaining()));
  });
  assert.ok(left > 0 && left <= 8, `budget ${left} ms`);
});

/**
 * Install a requestIdleCallback that queues callbacks, so a test can hand out
 * one deadline at a time.
 * @returns {{ flush: (remaining: number[]) => void, pending: () => number, restore: () => void }}
 */
function queuedIdle() {
  const host = /** @type {any} */ (globalThis);
  /** @type {((deadline: { timeRemaining: () => number }) => void)[]} */
  const queue = [];
  host.requestIdleCallback = (/** @type {any} */ fn) => queue.push(fn);
  return {
    // Each entry of `remaining` is the time left before one step of the callback.
    flush(remaining) {
      const fn = /** @type {any} */ (queue.shift());
      fn({ timeRemaining: () => remaining.shift() ?? 0 });
    },
    pending: () => queue.length,
    restore: () => delete host.requestIdleCallback,
  };
}

test('runStepsWhenIdle runs steps while time remains and resumes in the next callback', () => {
  const idle = queuedIdle();
  try {
    /** @type {number[]} */
    const ran = [];
    runStepsWhenIdle([0, 1, 2, 3].map((i) => () => ran.push(i)));
    assert.equal(idle.pending(), 1);
    idle.flush([10, 1]);
    assert.deepEqual(ran, [0, 1], 'the step after 10 ms ran, the one after 1 ms waited');
    assert.equal(idle.pending(), 1, 'the rest is scheduled');
    idle.flush([10, 10]);
    assert.deepEqual(ran, [0, 1, 2, 3]);
    assert.equal(idle.pending(), 0, 'nothing is left to schedule');
  } finally {
    idle.restore();
  }
});

test('runStepsWhenIdle runs one step even when the deadline has no time left', () => {
  const idle = queuedIdle();
  try {
    let ran = 0;
    runStepsWhenIdle([() => ran++, () => ran++]);
    idle.flush([]);
    assert.equal(ran, 1);
    idle.flush([]);
    assert.equal(ran, 2);
  } finally {
    idle.restore();
  }
});

test('runStepsWhenIdle schedules nothing for an empty list', () => {
  const idle = queuedIdle();
  try {
    runStepsWhenIdle([]);
    assert.equal(idle.pending(), 0);
  } finally {
    idle.restore();
  }
});
