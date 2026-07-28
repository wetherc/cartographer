import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignPill, formatAssignments, parseAssignments } from '../src/ui/ModalFields.js';

/**
 * The pill grid's rendering needs a DOM, but its assignment rule does not: it is
 * the one part of the composite fields with behaviour a GM can get wrong, since
 * the standard-array picker has to keep every score assigned exactly once while
 * the GM reshuffles them.
 */

test('assigning a value to an empty row records it', () => {
  assert.deepEqual(assignPill({}, 'str', '15'), { str: '15' });
});

test('assigning over a row replaces what it held', () => {
  assert.deepEqual(assignPill({ str: '15' }, 'str', '12'), { str: '12' });
});

test('clicking the pill a row already holds clears the row', () => {
  assert.deepEqual(assignPill({ str: '15', dex: '12' }, 'str', '15'), { dex: '12' });
});

test('taking a value another row holds swaps the two rows', () => {
  assert.deepEqual(assignPill({ str: '15', dex: '12' }, 'str', '12'), { str: '12', dex: '15' });
});

test('an empty row taking a held value leaves the old holder empty', () => {
  assert.deepEqual(assignPill({ dex: '12' }, 'str', '12'), { str: '12' });
});

test('assigning does not mutate the map it was given', () => {
  const before = { str: '15' };
  assignPill(before, 'dex', '15');
  assert.deepEqual(before, { str: '15' });
});

test('assignments round-trip through the stored pair list', () => {
  const assigned = { str: '15', dex: '12' };
  assert.equal(formatAssignments(assigned), 'str:15,dex:12');
  assert.deepEqual(parseAssignments(formatAssignments(assigned)), assigned);
});

test('an empty value parses to no assignments', () => {
  assert.deepEqual(parseAssignments(''), {});
});

test('a malformed pair is dropped rather than stored half-read', () => {
  assert.deepEqual(parseAssignments('str:15,,dex,:12,wis:10'), { str: '15', wis: '10' });
});
