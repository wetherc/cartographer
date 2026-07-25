import { test } from 'node:test';
import assert from 'node:assert/strict';

import { capitalize } from '../src/util/text.js';

test('capitalize uppercases only the first character', () => {
  assert.equal(capitalize('friendly'), 'Friendly');
  assert.equal(capitalize('general store'), 'General store');
  assert.equal(capitalize('Already'), 'Already');
});

test('capitalize passes empty and single-character strings through', () => {
  assert.equal(capitalize(''), '');
  assert.equal(capitalize('a'), 'A');
});
