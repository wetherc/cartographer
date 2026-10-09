import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLL_MODE_OPTIONS, pickedRollMode, rollModeField } from '../src/app/rollModeField.js';

test('the roll mode field starts on Auto and lists four choices', () => {
  const field = /** @type {any} */ (rollModeField({ name: 'mode', label: 'Save roll' }));
  assert.equal(field.value, 'auto');
  assert.equal(field.label, 'Save roll');
  assert.deepEqual(
    field.options.map((/** @type {any} */ o) => o.value),
    ['auto', 'normal', 'advantage', 'disadvantage'],
  );
  assert.equal(field.full, undefined);
  assert.equal(
    /** @type {any} */ (rollModeField({ name: 'm', label: 'R', full: true })).full,
    true,
  );
  assert.equal(ROLL_MODE_OPTIONS.length, 4);
});

test('a picked mode reads back, and Auto or junk reads as no pick', () => {
  assert.equal(pickedRollMode('normal'), 'normal');
  assert.equal(pickedRollMode('advantage'), 'advantage');
  assert.equal(pickedRollMode('disadvantage'), 'disadvantage');
  assert.equal(pickedRollMode('auto'), null);
  assert.equal(pickedRollMode(undefined), null);
  assert.equal(pickedRollMode('sideways'), null);
});
