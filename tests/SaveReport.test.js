import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveToast } from '../src/view/SaveReport.js';

const failed = { landed: false, message: 'Storage is full.' };
const landed = { landed: true, message: 'Saved, but images were not stored.' };

test('a landed write shows its message as a status toast and clears the failure flag', () => {
  assert.deepEqual(saveToast(landed, true, true), {
    toast: { message: landed.message, level: 'status' },
    failureShown: false,
  });
  assert.deepEqual(saveToast({ landed: true, message: '' }, false, false), {
    toast: null,
    failureShown: false,
  });
});

test('an automatic failure shows once, then stays quiet until a write lands', () => {
  const first = saveToast(failed, true, false);
  assert.deepEqual(first, {
    toast: { message: failed.message, level: 'error' },
    failureShown: true,
  });
  assert.deepEqual(saveToast(failed, true, first.failureShown), {
    toast: null,
    failureShown: true,
  });
});

test('a Save click always shows its failure and keeps the earlier flag', () => {
  assert.deepEqual(saveToast(failed, false, true), {
    toast: { message: failed.message, level: 'error' },
    failureShown: true,
  });
  assert.equal(saveToast(failed, false, false).failureShown, false);
});
