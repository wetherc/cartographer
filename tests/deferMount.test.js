import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deferMount } from '../src/util/deferMount.js';

test('deferMount skips updates until the first mount', () => {
  let mounts = 0;
  let updates = 0;
  const view = { update: () => updates++ };
  const deferred = deferMount(() => {
    mounts++;
    return view;
  });
  deferred.update();
  assert.equal(mounts, 0);
  assert.equal(updates, 0);
  assert.equal(deferred.mounted, false);
  assert.equal(deferred.mount(), view);
  deferred.update();
  assert.equal(updates, 1);
  assert.equal(deferred.mounted, true);
});

test('deferMount mounts the panel only once', () => {
  let mounts = 0;
  const deferred = deferMount(() => ({ update: () => {}, id: ++mounts }));
  const first = deferred.mount();
  assert.equal(deferred.mount(), first);
  assert.equal(mounts, 1);
});
