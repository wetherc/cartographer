import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  linkedDescendants,
  regenerateLanding,
  regenerateSnapshot,
} from '../src/map/RegenerateNode.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';

const INTERIOR = 'assets/tiles/interior/interior';

/**
 * A three-level dungeon under a town, plus a cellar that no tile links to
 * and a shop the town's own tiles lead to. Level 1's stairs link level 2,
 * and level 2's stairs link level 3.
 */
function world() {
  const town = createMapNode('town', 'Town', null, 4, 4);
  const level1 = withNodeTiles(createMapNode('l1', 'Crypt', 'town', 4, 4, { kind: 'interior' }), [
    createTile('1,1', `${INTERIOR}-floor-1.svg`),
    createTile('2,2', `${INTERIOR}-stairs-down.svg`, { childNodeId: 'l2' }),
  ]);
  const level2 = withNodeTiles(
    createMapNode('l2', 'Crypt (level 2)', 'l1', 4, 4, { kind: 'interior' }),
    [createTile('2,2', `${INTERIOR}-stairs-down.svg`, { childNodeId: 'l3' })],
  );
  const level3 = createMapNode('l3', 'Crypt (level 3)', 'l2', 4, 4, { kind: 'interior' });
  const cellar = createMapNode('cellar', 'Cellar', 'l1', 2, 2, { kind: 'interior' });
  const shop = createMapNode('shop', 'Shop', 'town', 2, 2, { kind: 'interior' });
  return { nodes: [town, level1, level2, level3, cellar, shop], level1 };
}

test('linkedDescendants lists the nodes the old tiles lead to, subtrees included', () => {
  const { nodes, level1 } = world();
  assert.deepEqual(
    linkedDescendants(nodes, level1).map((n) => n.id),
    ['l2', 'l3'],
  );
});

test('linkedDescendants leaves an unlinked child and the rest of the world alone', () => {
  const { nodes, level1 } = world();
  const ids = linkedDescendants(nodes, level1).map((n) => n.id);
  assert.ok(!ids.includes('cellar'), 'a child no tile links to is already unreachable');
  assert.ok(!ids.includes('shop'), 'a sibling elsewhere in the world is untouched');
  assert.ok(!ids.includes('town'), 'the parent is untouched');
});

test('linkedDescendants never returns the node itself, and skips a dead link', () => {
  const { nodes } = world();
  const loop = withNodeTiles(createMapNode('loop', 'Loop', null, 2, 2), [
    createTile('0,0', 'grass.svg', { childNodeId: 'loop' }),
    createTile('1,0', 'grass.svg', { childNodeId: 'gone' }),
  ]);
  assert.deepEqual(linkedDescendants([...nodes, loop], loop), []);
});

test('linkedDescendants on a node with no tiles returns nothing', () => {
  const { nodes } = world();
  assert.deepEqual(linkedDescendants(nodes, createMapNode('bare', 'Bare', null, 2, 2)), []);
});

const layout = { nodeId: 'l1', width: 8, height: 8, entry: '0,3' };

test('a party in a removed level lands on the new entry tile', () => {
  const moveTo = regenerateLanding({
    ...layout,
    position: { nodeId: 'l3', tileId: '2,2' },
    removedIds: new Set(['l2', 'l3']),
    landing: '2,2',
  });
  assert.deepEqual(moveTo, { nodeId: 'l1', tileId: '0,3' });
});

test('a party elsewhere in the world stays put', () => {
  const moveTo = regenerateLanding({
    ...layout,
    position: { nodeId: 'town', tileId: '1,1' },
    removedIds: new Set(['l2']),
    landing: '1,1',
  });
  assert.equal(moveTo, null);
});

test('a party in the node follows the reland rules for its own tile', () => {
  const removedIds = new Set(['l2']);
  // Still on a walkable tile: no move.
  assert.equal(
    regenerateLanding({
      ...layout,
      position: { nodeId: 'l1', tileId: '2,2' },
      removedIds,
      landing: '2,2',
    }),
    null,
  );
  // On what became a wall: the nearest walkable tile.
  assert.deepEqual(
    regenerateLanding({
      ...layout,
      position: { nodeId: 'l1', tileId: '2,2' },
      removedIds,
      landing: '2,3',
    }),
    { nodeId: 'l1', tileId: '2,3' },
  );
  // Outside the new extent: the entry.
  assert.deepEqual(
    regenerateLanding({
      ...layout,
      position: { nodeId: 'l1', tileId: '9,9' },
      removedIds,
      landing: '9,9',
    }),
    { nodeId: 'l1', tileId: '0,3' },
  );
});

test('regenerateSnapshot records the node, its parent, and everything else undo needs', () => {
  const { nodes, level1 } = world();
  const town = nodes[0];
  const removed = linkedDescendants(nodes, level1);
  const party = { nodeId: 'l2', tileId: '1,1' };
  const recalled = [{ characterId: 'c1', location: { nodeId: 'l2', tileId: '2,2' } }];
  const snapshot = regenerateSnapshot({
    node: level1,
    parent: town,
    created: ['fresh-2'],
    removed,
    party,
    recalled,
  });
  assert.deepEqual(snapshot, {
    nodes: [level1, town],
    created: ['fresh-2'],
    removed,
    party,
    recalled,
  });
});

test('regenerateSnapshot on a root node records the node alone', () => {
  const root = createMapNode('root', 'Root', null, 4, 4);
  const party = { nodeId: 'root', tileId: '0,0' };
  const snapshot = regenerateSnapshot({
    node: root,
    parent: null,
    created: [],
    removed: [],
    party,
    recalled: [],
  });
  assert.deepEqual(snapshot.nodes, [root]);
});
