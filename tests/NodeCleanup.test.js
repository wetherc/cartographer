import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMapNode, createTile } from '../src/map/TileGrid.js';
import {
  deleteLanding,
  locationsAfterDelete,
  locationsAfterShrink,
} from '../src/map/NodeCleanup.js';
import { fillTiles } from './helpers/grid.js';

/** A painted parent with the child linked from a 2x2 block at (1,1)-(2,2). */
function linkedParent(childId = 'child') {
  const inBlock = (x, y) => x >= 1 && x <= 2 && y >= 1 && y <= 2;
  return fillTiles(createMapNode('world', 'World', null, 6, 6), (id, x, y) =>
    createTile(id, 'grass.svg', { childNodeId: inBlock(x, y) ? childId : null }),
  );
}

/** @param {Partial<import('../src/types/entities.js').EncounterLocation> | null} location */
const placed = (id, location) => /** @type {any} */ ({ id, name: id, location });
const handout = (id, nodeId) =>
  /** @type {any} */ ({ id, title: id, body: '', nodeId, revealed: false, image: null });

const doomed = new Set(['child', 'grandchild']);
const landing = { nodeId: 'world', tileId: '3,1' };

test('deleteLanding lands beside the block the deleted child occupied', () => {
  const parent = linkedParent();
  const child = createMapNode('child', 'Child', 'world', 4, 4);
  const result = deleteLanding([parent, child], 'child', new Set(['child']));
  assert.deepEqual(result, { nodeId: 'world', tileId: '3,1' });
});

test('deleteLanding never lands on the doomed block itself', () => {
  // The block fills the east edge, so the preferred tile is off the map and
  // the snap must pick a painted tile outside the block.
  const parent = fillTiles(createMapNode('world', 'World', null, 3, 3), (id, x) =>
    createTile(id, 'grass.svg', { childNodeId: x === 2 ? 'child' : null }),
  );
  const child = createMapNode('child', 'Child', 'world', 2, 2);
  const result = deleteLanding([parent, child], 'child', new Set(['child']));
  assert.equal(result?.nodeId, 'world');
  assert.notEqual(parent.tiles.find((t) => t.id === result?.tileId)?.childNodeId, 'child');
});

test('deleteLanding lands near the parent centre when no tile links the child', () => {
  const parent = fillTiles(createMapNode('world', 'World', null, 5, 5));
  const child = createMapNode('child', 'Child', 'world', 4, 4);
  assert.deepEqual(deleteLanding([parent, child], 'child', new Set(['child'])), {
    nodeId: 'world',
    tileId: '2,2',
  });
});

test('deleteLanding is null for a root node, an unknown node, and a doomed parent', () => {
  const world = createMapNode('world', 'World', null, 5, 5);
  const child = createMapNode('child', 'Child', 'world', 4, 4);
  assert.equal(deleteLanding([world, child], 'world', new Set(['world', 'child'])), null);
  assert.equal(deleteLanding([world, child], 'missing', new Set(['missing'])), null);
  assert.equal(deleteLanding([world, child], 'child', new Set(['world', 'child'])), null);
});

test('deleteLanding lands the party from a grandchild in the surviving parent', () => {
  const parent = linkedParent();
  const child = createMapNode('child', 'Child', 'world', 4, 4);
  const grandchild = createMapNode('grandchild', 'Deep', 'child', 4, 4);
  assert.deepEqual(deleteLanding([parent, child, grandchild], 'child', doomed), landing);
});

test('locationsAfterDelete moves the party to the landing only when its node is doomed', () => {
  const inside = {
    party: { nodeId: 'grandchild', tileId: '1,1' },
    characters: [],
    creatures: [],
    handouts: [],
  };
  assert.equal(locationsAfterDelete(inside, doomed, landing).party, landing);
  const outside = { ...inside, party: { nodeId: 'world', tileId: '0,0' } };
  assert.equal(locationsAfterDelete(outside, doomed, landing).party, outside.party);
});

test('locationsAfterDelete recalls split characters and unplaces creatures inside the subtree', () => {
  const characters = [
    placed('a', { nodeId: 'child', tileId: '0,0' }),
    placed('b', { nodeId: 'world', tileId: '4,4' }),
    placed('c', null),
  ];
  const creatures = [
    placed('g', { nodeId: 'grandchild', tileId: '2,2' }),
    placed('h', { nodeId: 'world', tileId: '5,5' }),
    placed('i', null),
  ];
  const world = { party: landing, characters, creatures, handouts: [] };
  const after = locationsAfterDelete(world, doomed, landing);
  assert.deepEqual(
    after.characters.map((c) => c.location),
    [null, characters[1].location, null],
  );
  assert.equal(after.characters[1], characters[1]);
  assert.equal(after.characters[2], characters[2]);
  assert.deepEqual(
    after.creatures.map((c) => c.location),
    [null, creatures[1].location, null],
  );
  assert.equal(after.creatures[1], creatures[1]);
});

test('locationsAfterDelete unbinds handouts on doomed nodes and keeps the rest', () => {
  const handouts = [handout('x', 'child'), handout('y', 'world'), handout('z', null)];
  const world = { party: landing, characters: [], creatures: [], handouts };
  const after = locationsAfterDelete(world, doomed, landing);
  assert.deepEqual(
    after.handouts.map((h) => h.nodeId),
    [null, 'world', null],
  );
  assert.equal(after.handouts[1], handouts[1]);
  assert.equal(after.handouts[2], handouts[2]);
});

test('locationsAfterDelete keeps array identity when nothing inside the subtree moves', () => {
  const world = {
    party: landing,
    characters: [placed('a', { nodeId: 'world', tileId: '1,1' }), placed('b', null)],
    creatures: [placed('g', null)],
    handouts: [handout('y', 'world'), handout('z', null)],
  };
  const after = locationsAfterDelete(world, doomed, landing);
  assert.equal(after.characters, world.characters);
  assert.equal(after.creatures, world.creatures);
  assert.equal(after.handouts, world.handouts);
});

test('locationsAfterShrink pulls every location in the node inside the new bounds', () => {
  const world = {
    party: { nodeId: 'n', tileId: '9,2' },
    characters: [placed('a', { nodeId: 'n', tileId: '2,9' }), placed('b', null)],
    creatures: [placed('g', { nodeId: 'n', tileId: '9,9' })],
    handouts: [handout('y', 'n')],
  };
  const after = locationsAfterShrink(world, 'n', 6, 6);
  assert.deepEqual(after.party, { nodeId: 'n', tileId: '5,2' });
  assert.deepEqual(after.characters[0].location, { nodeId: 'n', tileId: '2,5' });
  assert.equal(after.characters[1], world.characters[1]);
  assert.deepEqual(after.creatures[0].location, { nodeId: 'n', tileId: '5,5' });
  assert.equal(after.handouts, world.handouts);
});

test('locationsAfterShrink leaves locations inside the bounds and in other nodes alone', () => {
  const world = {
    party: { nodeId: 'n', tileId: '1,1' },
    characters: [placed('a', { nodeId: 'other', tileId: '9,9' })],
    creatures: [placed('g', { nodeId: 'n', tileId: '5,5' })],
    handouts: [],
  };
  const after = locationsAfterShrink(world, 'n', 6, 6);
  assert.equal(after.party, world.party);
  assert.equal(after.characters, world.characters);
  assert.equal(after.creatures, world.creatures);
});

test('locationsAfterShrink keeps the party identity when it stands in another node', () => {
  const world = {
    party: { nodeId: 'other', tileId: '9,9' },
    characters: [],
    creatures: [],
    handouts: [],
  };
  assert.equal(locationsAfterShrink(world, 'n', 2, 2).party, world.party);
});
