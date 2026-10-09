import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRecord } from '../src/util/isRecord.js';

test('isRecord accepts plain objects only', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord(Object.create(null)), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord(undefined), false);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord('x'), false);
  assert.equal(isRecord(3), false);
});
