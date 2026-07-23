import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleParam, isPlayerLocked } from '../src/view/PlayerLock.js';

test('roleParam reads ?role=player case-insensitively', () => {
  assert.equal(roleParam('?role=player'), 'player');
  assert.equal(roleParam('?foo=1&role=Player'), 'player');
  assert.equal(roleParam('role=player'), 'player');
});

test('roleParam never grants the GM view from a URL', () => {
  assert.equal(roleParam('?role=gm'), null);
  assert.equal(roleParam('?role='), null);
  assert.equal(roleParam(''), null);
});

test('isPlayerLocked honors either the URL or the session flag', () => {
  assert.equal(isPlayerLocked('?role=player', null), true);
  assert.equal(isPlayerLocked('', '1'), true);
  assert.equal(isPlayerLocked('', null), false);
});
