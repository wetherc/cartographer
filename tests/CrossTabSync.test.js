import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExternalSaveEvent, STORAGE_KEY } from '../src/storage/SaveManager.js';

test('isExternalSaveEvent accepts a real save write on the save key', () => {
  assert.equal(
    isExternalSaveEvent({ key: STORAGE_KEY, newValue: '{"nodes":[]}', oldValue: '{}' }),
    true,
  );
});

test('isExternalSaveEvent ignores writes to a different key (e.g. the history ring)', () => {
  assert.equal(
    isExternalSaveEvent({ key: 'campaign-builder:history', newValue: '[]', oldValue: null }),
    false,
  );
});

test('isExternalSaveEvent ignores a cleared key (newValue null)', () => {
  assert.equal(
    isExternalSaveEvent({ key: STORAGE_KEY, newValue: null, oldValue: '{}' }),
    false,
  );
});

test('isExternalSaveEvent ignores a no-op write (value unchanged)', () => {
  assert.equal(
    isExternalSaveEvent({ key: STORAGE_KEY, newValue: '{}', oldValue: '{}' }),
    false,
  );
});

test('isExternalSaveEvent honors an explicit key override', () => {
  assert.equal(
    isExternalSaveEvent({ key: 'other', newValue: 'x', oldValue: null }, 'other'),
    true,
  );
});
