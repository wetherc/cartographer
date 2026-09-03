import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialsOf } from '../src/ui/CombatRibbon.js';

test('initialsOf takes at most two initials', () => {
  assert.equal(initialsOf('Ser Aldric'), 'SA');
  assert.equal(initialsOf('Mirelle'), 'M');
  assert.equal(initialsOf('Goblin Scout Chief'), 'GS');
  assert.equal(initialsOf('  goblin  scout '), 'GS');
});

test('initialsOf marks an unresolved name', () => {
  assert.equal(initialsOf(null), '?');
  assert.equal(initialsOf('   '), '?');
});

// The escapes are each two UTF-16 code units: indexing [0] would cut them in half.
test('initialsOf keeps a leading surrogate pair whole', () => {
  assert.equal(initialsOf('\u{1F409} Dragon'), '\u{1F409}D');
  assert.equal(initialsOf('\u{20BB7}\u91CE Chief'), '\u{20BB7}C');
});
