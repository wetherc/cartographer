import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaveFollower, SAVE_MARK_WAIT_MS } from '../src/storage/SaveFollower.js';

const SAVE = 'campaign-builder:save';
const MARK = 'campaign-builder:save-mark';

/** A follower over a manual timer, with a count of callbacks. */
function follower() {
  /** @type {{ fn: () => void, ms: number } | null} */
  let timer = null;
  let calls = 0;
  let cleared = 0;
  const handle = createSaveFollower({
    saveKey: SAVE,
    markKey: MARK,
    onSave: () => (calls += 1),
    setTimer: (fn, ms) => (timer = { fn, ms }),
    clearTimer: () => {
      cleared += 1;
      timer = null;
    },
  });
  return {
    handle,
    calls: () => calls,
    cleared: () => cleared,
    timer: () => timer,
  };
}

test('a save fires the callback on its mark, not on the campaign key', () => {
  const f = follower();
  f.handle({ key: SAVE, oldValue: '{}', newValue: '{"a":1}' });
  assert.equal(f.calls(), 0, 'the history index may still be stale here');
  f.handle({ key: 'campaign-builder:history', oldValue: null, newValue: '{}' });
  assert.equal(f.calls(), 0);
  f.handle({ key: MARK, oldValue: '1', newValue: '2' });
  assert.equal(f.calls(), 1);
  assert.equal(f.cleared(), 1, 'the fallback timer is cancelled');
});

test('a mark with no campaign write before it does nothing', () => {
  const f = follower();
  f.handle({ key: MARK, oldValue: '1', newValue: '2' });
  assert.equal(f.calls(), 0);
});

test('the fallback timer fires the callback when no mark arrives', () => {
  const f = follower();
  f.handle({ key: SAVE, oldValue: null, newValue: '{"a":1}' });
  assert.equal(f.timer()?.ms, SAVE_MARK_WAIT_MS);
  f.timer()?.fn();
  assert.equal(f.calls(), 1);
  f.handle({ key: MARK, oldValue: '1', newValue: '2' });
  assert.equal(f.calls(), 1, 'a late mark does not fire a second time');
});

test('two campaign writes before one mark fire once', () => {
  const f = follower();
  f.handle({ key: SAVE, oldValue: null, newValue: '{"a":1}' });
  f.handle({ key: SAVE, oldValue: '{"a":1}', newValue: '{"a":2}' });
  f.handle({ key: MARK, oldValue: '1', newValue: '2' });
  assert.equal(f.calls(), 1);
});

test('clears, no-op writes, and other keys are ignored', () => {
  const f = follower();
  f.handle({ key: SAVE, oldValue: '{}', newValue: null });
  f.handle({ key: SAVE, oldValue: '{}', newValue: '{}' });
  f.handle({ key: null, oldValue: null, newValue: null });
  f.handle({ key: 'other', oldValue: null, newValue: 'x' });
  assert.equal(f.timer(), null);
  f.handle({ key: MARK, oldValue: '1', newValue: '2' });
  assert.equal(f.calls(), 0);
});
