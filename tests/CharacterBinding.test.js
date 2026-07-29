import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  characterLockKey,
  characterParam,
  initialBinding,
  partyPermissions,
} from '../src/view/CharacterBinding.js';
import { claimLock, isHeldByOther } from '../src/storage/GMLock.js';
import { createCharacter } from '../src/entities/Character.js';

const party = [createCharacter('hero', 'Hero'), createCharacter('sage', 'Sage')];

test('characterParam reads ?character= and returns null when absent', () => {
  assert.equal(characterParam('?role=player&character=hero'), 'hero');
  assert.equal(characterParam('?role=player'), null);
  assert.equal(characterParam(''), null);
});

test('initialBinding prefers the URL over the session value', () => {
  assert.equal(initialBinding('?character=sage', 'hero', party), 'sage');
  assert.equal(initialBinding('', 'hero', party), 'hero');
  assert.equal(initialBinding('', null, party), null);
});

test('initialBinding resolves an id that names no party member to unbound', () => {
  assert.equal(initialBinding('?character=ghost', null, party), null);
  assert.equal(initialBinding('', 'ghost', party), null);
});

test('the GM may edit, play, and adjust HP on any character regardless of binding', () => {
  assert.deepEqual(partyPermissions('gm', null, 'hero'), {
    editBase: true,
    play: true,
    hp: true,
    restore: true,
  });
  assert.deepEqual(partyPermissions('gm', 'sage', 'hero'), {
    editBase: true,
    play: true,
    hp: true,
    restore: true,
  });
});

test('a bound player tab may play its character but never edit base attributes or HP', () => {
  assert.deepEqual(partyPermissions('player', 'hero', 'hero'), {
    editBase: false,
    play: true,
    hp: false,
    restore: false,
  });
  assert.deepEqual(partyPermissions('player', 'hero', 'sage'), {
    editBase: false,
    play: false,
    hp: false,
    restore: false,
  });
});

test('no player tab may put a spent pool point back, bound or not', () => {
  for (const bound of ['hero', null]) {
    assert.equal(partyPermissions('player', bound, 'hero').restore, false);
  }
});

test('an unbound player tab is a pure spectator', () => {
  assert.deepEqual(partyPermissions('player', null, 'hero'), {
    editBase: false,
    play: false,
    hp: false,
    restore: false,
  });
});

test('character lock keys are per character and drive the shared lock logic', () => {
  assert.equal(characterLockKey('hero'), 'campaign-builder:character-lock:hero');
  assert.notEqual(characterLockKey('hero'), characterLockKey('sage'));
  // The GM-lock claim machinery enforces exclusivity per key: a live claim by
  // one tab blocks another tab's claim on the same character.
  const now = 1000;
  const held = claimLock(null, 'tab-a', now);
  assert.ok(held);
  assert.equal(claimLock(held, 'tab-b', now + 1), null);
  assert.equal(isHeldByOther(held, 'tab-b', now + 1), true);
});
