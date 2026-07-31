import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialsOf } from '../src/ui/CombatScreen.js';

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
