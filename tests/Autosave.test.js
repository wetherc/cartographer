import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldAutosave,
  AUTOSAVE_IDLE_MS,
  AUTOSAVE_MAX_WAIT_MS,
} from '../src/storage/Autosave.js';

test('never autosaves a clean campaign', () => {
  assert.equal(
    shouldAutosave({ dirty: false, now: 1_000_000, lastMutationAt: 0, dirtySince: 0 }),
    false,
  );
});

test('waits out the idle window after the last mutation', () => {
  const base = { dirty: true, lastMutationAt: 10_000, dirtySince: 10_000 };
  assert.equal(shouldAutosave({ ...base, now: 10_000 + AUTOSAVE_IDLE_MS - 1 }), false);
  assert.equal(shouldAutosave({ ...base, now: 10_000 + AUTOSAVE_IDLE_MS }), true);
});

test('continuous editing still autosaves once the hard cap elapses', () => {
  const dirtySince = 10_000;
  const now = dirtySince + AUTOSAVE_MAX_WAIT_MS;
  // A mutation just happened, so the idle window alone would keep waiting.
  assert.equal(shouldAutosave({ dirty: true, now, lastMutationAt: now - 1, dirtySince }), true);
});

test('continuous editing under the hard cap keeps waiting', () => {
  const dirtySince = 10_000;
  const now = dirtySince + AUTOSAVE_MAX_WAIT_MS - 1;
  assert.equal(shouldAutosave({ dirty: true, now, lastMutationAt: now - 1, dirtySince }), false);
});
