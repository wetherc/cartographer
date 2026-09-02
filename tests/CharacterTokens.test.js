import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  characterTokens,
  moveCharacter,
  recallAll,
  recallFrom,
  isSplit,
  characterPosition,
  regroupCandidates,
} from '../src/party/CharacterTokens.js';
import { createCharacter, withDefaults } from '../src/entities/Character.js';

const party = [createCharacter('hero', 'Hero'), createCharacter('sage', 'Sage')];
const position = { nodeId: 'world', tileId: '2,3' };

test('characters with the party token onto the party tile in its node', () => {
  assert.deepEqual(characterTokens(party, position, 'world'), [
    { tileId: '2,3', name: 'Hero', characterId: 'hero' },
    { tileId: '2,3', name: 'Sage', characterId: 'sage' },
  ]);
  assert.deepEqual(characterTokens(party, position, 'cave'), []);
});

test('an individually placed character tokens onto their own tile, only in that node', () => {
  const moved = moveCharacter(party, 'hero', { nodeId: 'cave', tileId: '0,1' });
  assert.deepEqual(characterTokens(moved, position, 'cave'), [
    { tileId: '0,1', name: 'Hero', characterId: 'hero' },
  ]);
  assert.deepEqual(characterTokens(moved, position, 'world'), [
    { tileId: '2,3', name: 'Sage', characterId: 'sage' },
  ]);
});

test('moveCharacter leaves other characters and unknown ids untouched', () => {
  const moved = moveCharacter(party, 'hero', { nodeId: 'world', tileId: '5,5' });
  assert.equal(moved.find((c) => c.id === 'sage')?.location, null);
  assert.deepEqual(moveCharacter(party, 'ghost', { nodeId: 'world', tileId: '5,5' }), party);
});

test('recallAll drops every individual location so the party moves as one', () => {
  const scattered = moveCharacter(
    moveCharacter(party, 'hero', { nodeId: 'cave', tileId: '0,1' }),
    'sage',
    { nodeId: 'world', tileId: '9,9' },
  );
  assert.ok(recallAll(scattered).every((c) => c.location === null));
});

test('isSplit reports whether anyone stands apart from the party', () => {
  assert.equal(isSplit(party), false);
  assert.equal(isSplit(moveCharacter(party, 'hero', { nodeId: 'cave', tileId: '0,1' })), true);
  assert.equal(
    isSplit(recallAll(moveCharacter(party, 'hero', { nodeId: 'cave', tileId: '0,1' }))),
    false,
  );
});

test('characterPosition resolves a regroup target: own location, else the party tile', () => {
  const scattered = moveCharacter(party, 'hero', { nodeId: 'cave', tileId: '0,1' });
  const hero = scattered.find((c) => c.id === 'hero');
  const sage = scattered.find((c) => c.id === 'sage');
  assert.deepEqual(characterPosition(/** @type {any} */ (hero), position), {
    nodeId: 'cave',
    tileId: '0,1',
  });
  assert.deepEqual(characterPosition(/** @type {any} */ (sage), position), position);
});

test('withDefaults backfills a pre-token save to "with the party"', () => {
  const { location: _location, ...legacy } = createCharacter('old', 'Old Timer');
  assert.equal(withDefaults(/** @type {any} */ (legacy)).location, null);
});

test('characterPosition falls back to the party tile when the character stands on a missing node', () => {
  const scattered = moveCharacter(party, 'hero', { nodeId: 'gone', tileId: '0,1' });
  const hero = /** @type {any} */ (scattered.find((c) => c.id === 'hero'));
  const exists = (nodeId) => nodeId === 'world';
  assert.deepEqual(characterPosition(hero, position, exists), position);
  assert.deepEqual(
    characterPosition(hero, position, () => true),
    { nodeId: 'gone', tileId: '0,1' },
  );
});

test('regroupCandidates leaves out characters placed on a node that no longer exists', () => {
  let scattered = moveCharacter(party, 'hero', { nodeId: 'gone', tileId: '0,1' });
  scattered = moveCharacter(scattered, 'sage', { nodeId: 'world', tileId: '1,1' });
  const exists = (nodeId) => nodeId === 'world';
  assert.deepEqual(
    regroupCandidates(scattered, exists).map((c) => c.id),
    ['sage'],
  );
  assert.deepEqual(
    regroupCandidates(party, exists).map((c) => c.id),
    ['hero', 'sage'],
  );
  assert.deepEqual(
    regroupCandidates(scattered, () => false).map((c) => c.id),
    [],
  );
});

test('recallFrom brings back only the characters standing in the given nodes', () => {
  const scattered = moveCharacter(
    moveCharacter(party, 'hero', { nodeId: 'cave', tileId: '0,1' }),
    'sage',
    { nodeId: 'tower', tileId: '3,3' },
  );
  const recalled = recallFrom(scattered, new Set(['cave', 'gone']));
  assert.equal(recalled.find((c) => c.id === 'hero')?.location, null);
  assert.deepEqual(recalled.find((c) => c.id === 'sage')?.location, {
    nodeId: 'tower',
    tileId: '3,3',
  });
  // A character with the party has no location to clear, and keeps its identity.
  assert.equal(recallFrom(party, new Set(['cave']))[0], party[0]);
});
