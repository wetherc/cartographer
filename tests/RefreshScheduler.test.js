import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshScheduler } from '../src/combat/RefreshScheduler.js';

/** A scheduler the test drives by hand: it collects the flushes and runs them on demand. */
function manualScheduler() {
  /** @type {(() => void)[]} */
  const queue = [];
  return {
    schedule: (/** @type {() => void} */ flush) => {
      queue.push(flush);
    },
    flush: () => {
      const batch = queue.splice(0);
      for (const run of batch) run();
    },
    queued: () => queue.length,
  };
}

test('one burst of requests runs the refresh once', () => {
  const clock = manualScheduler();
  let runs = 0;
  const refresh = createRefreshScheduler(() => {
    runs += 1;
  }, clock.schedule);
  refresh.request();
  refresh.request();
  refresh.request();
  assert.equal(runs, 0, 'nothing runs before the flush');
  assert.equal(clock.queued(), 1, 'one flush is scheduled');
  assert.equal(refresh.isPending(), true);
  clock.flush();
  assert.equal(runs, 1);
  assert.equal(refresh.isPending(), false);
});

test('a request after the flush schedules a new run', () => {
  const clock = manualScheduler();
  let runs = 0;
  const refresh = createRefreshScheduler(() => {
    runs += 1;
  }, clock.schedule);
  refresh.request();
  clock.flush();
  refresh.request();
  clock.flush();
  assert.equal(runs, 2);
});

test('a request made during the run schedules the next run instead of being lost', () => {
  const clock = manualScheduler();
  let runs = 0;
  /** @type {{ request: () => void } | null} */
  let self = null;
  const refresh = createRefreshScheduler(() => {
    runs += 1;
    if (runs === 1) self?.request();
  }, clock.schedule);
  self = refresh;
  refresh.request();
  clock.flush();
  assert.equal(runs, 1);
  assert.equal(clock.queued(), 1, 'the nested request queued a second flush');
  clock.flush();
  assert.equal(runs, 2);
});

test('the default scheduler is a microtask', async () => {
  let runs = 0;
  const refresh = createRefreshScheduler(() => {
    runs += 1;
  });
  refresh.request();
  refresh.request();
  assert.equal(runs, 0);
  await Promise.resolve();
  assert.equal(runs, 1);
});
