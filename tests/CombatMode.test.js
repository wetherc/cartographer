import test from 'node:test';
import assert from 'node:assert/strict';

import { followerMode } from '../src/view/CombatMode.js';

test('a tab on the combat screen leaves it when the fight ends', () => {
  assert.equal(followerMode('combat', { hadFight: true, hasFight: false }), 'play');
});

test('a tab on the map joins a fight that just started', () => {
  assert.equal(followerMode('play', { hadFight: false, hasFight: true }), 'combat');
});

test('a fight already running is not re-entered', () => {
  assert.equal(followerMode('play', { hadFight: true, hasFight: true }), null);
});

test('a tab already on the combat screen stays there while the fight runs', () => {
  assert.equal(followerMode('combat', { hadFight: true, hasFight: true }), null);
});

test('nothing moves when no fight is involved either way', () => {
  assert.equal(followerMode('play', { hadFight: false, hasFight: false }), null);
});

test('an authoring tab is left alone whatever the fight does', () => {
  assert.equal(followerMode('build', { hadFight: false, hasFight: true }), null);
  assert.equal(followerMode('build', { hadFight: true, hasFight: false }), null);
  assert.equal(followerMode('library', { hadFight: false, hasFight: true }), null);
});
