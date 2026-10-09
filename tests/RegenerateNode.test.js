import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  linkedDescendants,
  regenerateLanding,
  regenerateSnapshot,
  regenerateTokenMoves,
  stackBase,
  stackPlace,
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

test('linkedDescendants lists a child once when many tiles lead to it', () => {
  const { nodes, level1 } = world();
  const wide = withNodeTiles(createMapNode('wide', 'Wide', null, 3, 1), [
    createTile('0,0', 'grass.svg', { childNodeId: 'l1' }),
    createTile('1,0', 'grass.svg', { childNodeId: 'l1' }),
    createTile('2,0', 'grass.svg', { childNodeId: 'l1' }),
  ]);
  const all = [...nodes.filter((n) => n.id !== 'l1'), { ...level1, parentId: 'wide' }, wide];
  assert.deepEqual(
    linkedDescendants(all, wide).map((n) => n.id),
    ['l2', 'l3', 'cellar', 'l1'],
  );
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
  const creatures = [{ creatureId: 'goblin', location: { nodeId: 'l1', tileId: '3,3' } }];
  const handouts = [{ handoutId: 'crypt-note', nodeId: 'l2' }];
  const entryTiles = { party: { l1: '3,3' } };
  const snapshot = regenerateSnapshot({
    node: level1,
    parent: town,
    created: ['fresh-2'],
    removed,
    party,
    recalled,
    creatures,
    handouts,
    entryTiles,
  });
  assert.deepEqual(snapshot, {
    label: 'map generation',
    nodes: [level1, town],
    after: null,
    created: ['fresh-2'],
    removed,
    party,
    recalled,
    creatures,
    handouts,
    entryTiles,
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
    creatures: [],
    handouts: [],
    entryTiles: {},
  });
  assert.deepEqual(snapshot.nodes, [root]);
});

/**
 * Five tokens: one in the node on a good tile, one in the node on what
 * became a wall, one in the node outside the new extent, one in another
 * node, and one with no location of its own.
 */
function splitRoster() {
  return [
    { id: 'good', location: { nodeId: 'l1', tileId: '2,2' } },
    { id: 'walled', location: { nodeId: 'l1', tileId: '3,3' } },
    { id: 'outside', location: { nodeId: 'l1', tileId: '9,9' } },
    { id: 'elsewhere', location: { nodeId: 'town', tileId: '1,1' } },
    { id: 'unplaced', location: null },
  ];
}

/** The node's entry rules: '3,3' became a wall, so it resolves to '4,3'. */
const landingFor = (/** @type {string} */ tileId) => (tileId === '3,3' ? '4,3' : tileId);

test('regenerateTokenMoves re-lands only the tokens the layout displaced', () => {
  const moves = regenerateTokenMoves({
    tokens: splitRoster(),
    nodeId: 'l1',
    width: 8,
    height: 8,
    entry: '0,3',
    landingFor,
  });
  assert.deepEqual(moves, [
    { id: 'walled', tileId: '4,3' },
    { id: 'outside', tileId: '0,3' },
  ]);
});

test('regenerateTokenMoves reads an unparseable tile as outside the extent', () => {
  const moves = regenerateTokenMoves({
    tokens: [{ id: 'lost', location: { nodeId: 'l1', tileId: 'nowhere' } }],
    nodeId: 'l1',
    width: 8,
    height: 8,
    entry: '0,3',
    landingFor,
  });
  assert.deepEqual(moves, [{ id: 'lost', tileId: '0,3' }]);
});

test('regenerateTokenMoves on tokens that hold no location returns nothing', () => {
  const moves = regenerateTokenMoves({
    tokens: [{ id: 'a' }, { id: 'b', location: null }],
    nodeId: 'l1',
    width: 8,
    height: 8,
    entry: '0,3',
    landingFor,
  });
  assert.deepEqual(moves, []);
});

/** @param {import('../src/types/map.js').MapNode[]} nodes */
const parentIn = (nodes) => (/** @type {import('../src/types/map.js').MapNode} */ node) =>
  nodes.find((n) => n.id === node.parentId) ?? null;

test('stackPlace counts the levels above a node reached by stairs down', () => {
  const { nodes, level1 } = world();
  const byId = (/** @type {string} */ id) => /** @type {any} */ (nodes.find((n) => n.id === id));
  const parentOf = parentIn(nodes);
  assert.deepEqual(stackPlace(byId('l2'), parentOf), { back: 'stairs-up', level: 2 });
  assert.deepEqual(stackPlace(byId('l3'), parentOf), { back: 'stairs-up', level: 3 });
  // Level 1 opens from the town by no staircase, and the root has no parent.
  assert.equal(stackPlace(level1, parentOf), null);
  assert.equal(stackPlace(byId('town'), parentOf), null);
  // The cellar has a parent, but no tile of the parent links to it.
  assert.equal(stackPlace(byId('cellar'), parentOf), null);
});

test('stackPlace reads a floor that its parent reaches by stairs up', () => {
  const keep = withNodeTiles(createMapNode('keep', 'Keep', null, 4, 4, { kind: 'interior' }), [
    createTile('0,0', `${INTERIOR}-stairs-up.svg`, { childNodeId: 'upper' }),
  ]);
  const upper = createMapNode('upper', 'Keep (upper floor)', 'keep', 4, 4, { kind: 'interior' });
  assert.deepEqual(stackPlace(upper, parentIn([keep, upper])), { back: 'stairs-down', level: 2 });
});

test('stackPlace stops on a parent loop', () => {
  const a = withNodeTiles(createMapNode('a', 'A', 'b', 4, 4, { kind: 'interior' }), [
    createTile('1,1', `${INTERIOR}-stairs-down.svg`, { childNodeId: 'b' }),
  ]);
  const b = withNodeTiles(createMapNode('b', 'B', 'a', 4, 4, { kind: 'interior' }), [
    createTile('1,1', `${INTERIOR}-stairs-down.svg`, { childNodeId: 'a' }),
  ]);
  assert.deepEqual(stackPlace(b, parentIn([a, b])), { back: 'stairs-up', level: 2 });
});

test('stackBase drops the label of a forced sub-map', () => {
  assert.equal(stackBase('Ashford Barrow (level 2)'), 'Ashford Barrow');
  assert.equal(stackBase('Keep (upper floor)'), 'Keep');
  assert.equal(stackBase('Keep (dungeons)'), 'Keep');
  assert.equal(stackBase('Inn (cellar)'), 'Inn');
  assert.equal(stackBase('The Crypt (old)'), 'The Crypt (old)');
});
