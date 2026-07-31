import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeEntryTile, resolveEntryTile } from '../src/map/EntryPoint.js';
import { createTile } from '../src/map/TileGrid.js';
import { gridTiles } from './helpers/grid.js';

// 8x8 child region. Its block sits at parent coords x 4..7, y 4..7.
const W = 8;
const H = 8;
const block = { minX: 4, minY: 4, maxX: 7, maxY: 7 };

test('head-on at the west wall lands on the inner west edge, aligned to entry', () => {
  // Aligned with the block on y (within 4..7), west of it on x.
  assert.equal(computeEntryTile(W, H, block, { x: 0, y: 4 }), '0,0');
  assert.equal(computeEntryTile(W, H, block, { x: 0, y: 7 }), '0,7');
  assert.equal(computeEntryTile(W, H, block, { x: 0, y: 6 }), '0,5');
});

test('head-on at the east wall lands on the inner east edge', () => {
  assert.equal(computeEntryTile(W, H, block, { x: 20, y: 4 }), '7,0');
});

test('head-on at the north wall lands on the inner north edge, aligned to entry', () => {
  assert.equal(computeEntryTile(W, H, block, { x: 6, y: 0 }), '5,0');
});

test('head-on at the south wall lands on the inner south edge', () => {
  assert.equal(computeEntryTile(W, H, block, { x: 4, y: 20 }), '0,7');
});

test('diagonal past a corner lands on the matching inner corner', () => {
  assert.equal(computeEntryTile(W, H, block, { x: 0, y: 0 }), '0,0'); // NW
  assert.equal(computeEntryTile(W, H, block, { x: 20, y: 0 }), '7,0'); // NE
  assert.equal(computeEntryTile(W, H, block, { x: 0, y: 20 }), '0,7'); // SW
  assert.equal(computeEntryTile(W, H, block, { x: 20, y: 20 }), '7,7'); // SE
});

test('falls back to centre when the party stands inside the block footprint', () => {
  assert.equal(computeEntryTile(W, H, block, { x: 5, y: 5 }), '4,4');
});

test('falls back to centre with no block or no party', () => {
  assert.equal(computeEntryTile(W, H, null, { x: 0, y: 0 }), '4,4');
  assert.equal(computeEntryTile(W, H, block, null), '4,4');
});

test('a single-tile block projects a head-on approach to the wall midpoint', () => {
  const one = { minX: 5, minY: 5, maxX: 5, maxY: 5 };
  // West of a 1-tile block, aligned on y: west edge, mid height.
  assert.equal(computeEntryTile(W, H, one, { x: 0, y: 5 }), '0,3');
});

test('resolveEntryTile keeps a real, walkable preferred tile', () => {
  const node = {
    id: 'n',
    name: 'N',
    parentId: null,
    width: 4,
    height: 4,
    kind: 'interior',
    environ: null,
    tiles: [createTile('1,1', 'assets/tiles/interior/interior-floor-1.svg')],
  };
  assert.equal(resolveEntryTile(node, '1,1'), '1,1');
});

test('resolveEntryTile snaps a void or wall preferred tile to the nearest walkable one, doors first', () => {
  const node = {
    id: 'n',
    name: 'N',
    parentId: null,
    width: 6,
    height: 6,
    kind: 'interior',
    environ: null,
    tiles: [
      createTile('2,0', 'assets/tiles/interior/interior-wall-h.svg'),
      createTile('2,1', 'assets/tiles/interior/interior-floor-2.svg'),
      createTile('3,0', 'assets/tiles/interior/interior-door-h.svg'),
    ],
  };
  // '2,0' exists but is a wall: nearest walkable are the floor (d=1) and the
  // door (d=1); the door wins the tie.
  assert.equal(resolveEntryTile(node, '2,0'), '3,0');
  // Void cell: same resolution applies.
  assert.equal(resolveEntryTile(node, '5,5'), '2,1');
});

test('resolveEntryTile returns the preferred id for an empty node', () => {
  const node = {
    id: 'n',
    name: 'N',
    parentId: null,
    width: 4,
    height: 4,
    kind: 'region',
    environ: null,
    tiles: [],
  };
  assert.equal(resolveEntryTile(node, '2,2'), '2,2');
});

test('resolveEntryTile returns the first pool tile when the preferred id is unparseable', () => {
  const node = {
    id: 'n',
    name: 'N',
    parentId: null,
    width: 4,
    height: 4,
    kind: 'interior',
    environ: null,
    tiles: [
      createTile('1,1', 'assets/tiles/interior/interior-floor-1.svg'),
      createTile('2,2', 'assets/tiles/interior/interior-floor-2.svg'),
    ],
  };
  // No coords to score against: the first walkable tile is taken as-is.
  assert.equal(resolveEntryTile(node, 'not-a-coord'), '1,1');
});

test('resolveEntryTile skips pool tiles whose ids do not parse when scoring', () => {
  const node = {
    id: 'n',
    name: 'N',
    parentId: null,
    width: 4,
    height: 4,
    kind: 'interior',
    environ: null,
    tiles: [
      createTile('bogus', 'assets/tiles/interior/interior-floor-1.svg'),
      createTile('3,3', 'assets/tiles/interior/interior-floor-2.svg'),
    ],
  };
  // Preferred '3,3' is a wall/void miss here; the malformed-id tile is skipped
  // in scoring, leaving the one real coord as the nearest.
  assert.equal(resolveEntryTile(node, '3,3'), '3,3');
});

test('computeRegionEntryTile falls back to centre when no region group matches', async () => {
  const { computeRegionEntryTile } = await import('../src/map/EntryPoint.js');
  const parent = {
    id: 'world',
    name: 'World',
    parentId: null,
    width: 6,
    height: 6,
    kind: 'region',
    environ: null,
    tiles: [createTile('0,0', 'grass.svg')], // no tile links to 'ghost'
  };
  const childTiles = gridTiles(4, 4);
  const child = {
    id: 'ghost',
    name: 'Ghost',
    parentId: 'world',
    width: 4,
    height: 4,
    kind: 'region',
    environ: null,
    tiles: childTiles,
  };
  // No group -> null block -> centre of the child.
  assert.equal(
    computeRegionEntryTile(parent, child, 'ghost', { nodeId: 'world', tileId: '5,5' }),
    '2,2',
  );
});

test('computeRegionEntryTile lands a stairs descent on the child level stairs-up', async () => {
  const { computeRegionEntryTile } = await import('../src/map/EntryPoint.js');
  const parent = {
    id: 'lvl-1',
    name: 'Crypt',
    parentId: null,
    width: 6,
    height: 6,
    kind: 'interior',
    environ: null,
    tiles: [
      createTile('4,4', 'assets/tiles/interior/interior-stairs-down.svg', { childNodeId: 'lvl-2' }),
      createTile('1,1', 'assets/tiles/interior/interior-floor-1.svg'),
    ],
  };
  const child = {
    id: 'lvl-2',
    name: 'Crypt (level 2)',
    parentId: 'lvl-1',
    width: 6,
    height: 6,
    kind: 'interior',
    environ: null,
    tiles: [
      createTile('2,3', 'assets/tiles/interior/interior-stairs-up.svg'),
      createTile('0,0', 'assets/tiles/interior/interior-floor-2.svg'),
    ],
  };
  const landed = computeRegionEntryTile(parent, child, 'lvl-2', { nodeId: 'lvl-1', tileId: '1,1' });
  assert.equal(landed, '2,3');
});

test('computeRegionEntryTile reads the approach geometry when no stairs connect the nodes', async () => {
  const { computeRegionEntryTile } = await import('../src/map/EntryPoint.js');
  // A 2x2 region block at parent coords x 2..3, y 2..3.
  const parentTiles = [
    createTile('2,2', 'grass.svg', { childNodeId: 'town' }),
    createTile('3,2', 'grass.svg', { childNodeId: 'town' }),
    createTile('2,3', 'grass.svg', { childNodeId: 'town' }),
    createTile('3,3', 'grass.svg', { childNodeId: 'town' }),
  ];
  const parent = {
    id: 'world',
    name: 'World',
    parentId: null,
    width: 6,
    height: 6,
    kind: 'region',
    environ: null,
    tiles: parentTiles,
  };
  const childTiles = gridTiles(4, 4);
  const child = {
    id: 'town',
    name: 'Town',
    parentId: 'world',
    width: 4,
    height: 4,
    kind: 'region',
    environ: null,
    tiles: childTiles,
  };

  // Head-on from the west, aligned with the block's top row.
  assert.equal(
    computeRegionEntryTile(parent, child, 'town', { nodeId: 'world', tileId: '0,2' }),
    '0,0',
  );
  // Party elsewhere in the world: no approach to read, land at the centre.
  assert.equal(
    computeRegionEntryTile(parent, child, 'town', { nodeId: 'somewhere-else', tileId: '0,0' }),
    '2,2',
  );
});

// --- Leaving a child node ------------------------------------------------

const INTERIOR = 'assets/tiles/interior/interior';

/**
 * A 10x10 outdoor parent, fully painted, whose 3x3 block at x 4..6, y 4..6
 * links to the child region.
 * @returns {import('../src/types/map.js').MapNode}
 */
function returnParent() {
  return {
    id: 'region',
    name: 'Saltmere Coast',
    parentId: null,
    width: 10,
    height: 10,
    kind: 'region',
    environ: null,
    tiles: gridTiles(10, 10, (id, x, y) => {
      const inBlock = x >= 4 && x <= 6 && y >= 4 && y <= 6;
      return createTile(id, inBlock ? 'town.svg' : 'grass.svg', {
        childNodeId: inBlock ? 'child' : null,
      });
    }),
  };
}

/** @returns {import('../src/types/map.js').MapNode} */
function returnChild(overrides = {}) {
  return {
    id: 'child',
    name: 'Thornhold',
    parentId: 'region',
    width: 8,
    height: 8,
    kind: 'region',
    environ: null,
    tiles: gridTiles(8, 8),
    ...overrides,
  };
}

/** @param {import('../src/types/map.js').ExitSide} side */
function edgeExit(side) {
  return /** @type {import('../src/types/map.js').MapExit} */ ({
    kind: 'edge',
    side,
    targetNodeId: 'region',
    targetName: 'Saltmere Coast',
  });
}

test('leaving by an edge lands one cell outside the block, aligned to where you left', async () => {
  const { computeParentReturnTile } = await import('../src/map/EntryPoint.js');
  const parent = returnParent();
  const child = returnChild();
  // West edge, a third of the way down the child: block rows 4..6, so f=3/7 -> y 5.
  assert.equal(
    computeParentReturnTile(parent, child, edgeExit('west'), { nodeId: 'child', tileId: '0,3' }),
    '3,5',
  );
  // North edge from the child's east side: block columns 4..6 -> x 6.
  assert.equal(
    computeParentReturnTile(parent, child, edgeExit('north'), { nodeId: 'child', tileId: '7,0' }),
    '6,3',
  );
  assert.equal(
    computeParentReturnTile(parent, child, edgeExit('south'), { nodeId: 'child', tileId: '0,7' }),
    '4,7',
  );
  assert.equal(
    computeParentReturnTile(parent, child, edgeExit('east'), { nodeId: 'child', tileId: '7,7' }),
    '7,6',
  );
});

test('entering a region then leaving the way you came returns you beside where you started', async () => {
  const { computeParentReturnTile, computeRegionEntryTile } =
    await import('../src/map/EntryPoint.js');
  const parent = returnParent();
  const child = returnChild();
  const start = { nodeId: 'region', tileId: '3,5' }; // west of the block
  const entry = computeRegionEntryTile(parent, child, 'child', start);
  const back = computeParentReturnTile(parent, child, edgeExit('west'), {
    nodeId: 'child',
    tileId: entry,
  });
  assert.equal(back, '3,5');
});

test('leaving a child the party is not standing in uses the child centre', async () => {
  const { computeParentReturnTile } = await import('../src/map/EntryPoint.js');
  const parent = returnParent();
  const child = returnChild();
  // Centre column 4 of 8 -> f = 4/7 -> block columns 4..6 -> x 5.
  assert.equal(
    computeParentReturnTile(parent, child, edgeExit('north'), { nodeId: 'region', tileId: '0,0' }),
    '5,3',
  );
});

test('a one-cell block returns to the cell beside it', async () => {
  const { computeParentReturnTile } = await import('../src/map/EntryPoint.js');
  const parent = {
    id: 'region',
    name: 'Coast',
    parentId: null,
    width: 6,
    height: 6,
    kind: /** @type {const} */ ('region'),
    environ: null,
    tiles: gridTiles(6, 6, (id, x, y) =>
      createTile(id, x === 2 && y === 2 ? 'town.svg' : 'grass.svg', {
        childNodeId: x === 2 && y === 2 ? 'child' : null,
      }),
    ),
  };
  assert.equal(
    computeParentReturnTile(parent, returnChild(), edgeExit('east'), {
      nodeId: 'child',
      tileId: '7,4',
    }),
    '3,2',
  );
});

test('leaving through a door uses the side the door sits nearest', async () => {
  const { computeParentReturnTile } = await import('../src/map/EntryPoint.js');
  const parent = returnParent();
  const interior = returnChild({
    kind: 'interior',
    name: 'Keep',
    tiles: [createTile('0,6', `${INTERIOR}-door-v.svg`)],
  });
  const exit = /** @type {import('../src/types/map.js').MapExit} */ ({
    kind: 'tile',
    tileId: '0,6',
    via: 'door',
    targetNodeId: 'region',
    targetName: 'Saltmere Coast',
  });
  // Door on the west border at y 6 of 8 -> f = 6/7 -> block rows 4..6 -> y 6.
  assert.equal(
    computeParentReturnTile(parent, interior, exit, { nodeId: 'child', tileId: '1,6' }),
    '3,6',
  );
});

test('leaving up a stairway lands on the parent stairs-down that leads here', async () => {
  const { computeParentReturnTile } = await import('../src/map/EntryPoint.js');
  const parent = {
    id: 'lvl-1',
    name: 'Crypt',
    parentId: null,
    width: 6,
    height: 6,
    kind: /** @type {const} */ ('interior'),
    environ: null,
    tiles: [
      createTile('4,4', `${INTERIOR}-stairs-down.svg`, { childNodeId: 'child' }),
      createTile('1,1', `${INTERIOR}-floor-1.svg`),
    ],
  };
  const child = returnChild({
    kind: 'interior',
    tiles: [createTile('2,3', `${INTERIOR}-stairs-up.svg`)],
  });
  const exit = /** @type {import('../src/types/map.js').MapExit} */ ({
    kind: 'tile',
    tileId: '2,3',
    via: 'stairs-up',
    targetNodeId: 'lvl-1',
    targetName: 'Crypt',
  });
  assert.equal(
    computeParentReturnTile(parent, child, exit, { nodeId: 'child', tileId: '2,3' }),
    '4,4',
  );
});

test('a fallback exit lands on the block entrance tile', async () => {
  const { computeParentReturnTile } = await import('../src/map/EntryPoint.js');
  const parent = returnParent();
  // Mark the block's middle tile as the entrance art.
  parent.tiles = parent.tiles.map((t) =>
    t.id === '5,5'
      ? { ...t, metadata: { ...t.metadata, poiType: /** @type {const} */ ('dungeon') } }
      : t,
  );
  const exit = /** @type {import('../src/types/map.js').MapExit} */ ({
    kind: 'fallback',
    targetNodeId: 'region',
    targetName: 'Saltmere Coast',
  });
  assert.equal(
    computeParentReturnTile(parent, returnChild(), exit, { nodeId: 'child', tileId: '1,1' }),
    '5,5',
  );
});

test('a fallback with no entrance art lands on the first block tile', async () => {
  const { computeParentReturnTile } = await import('../src/map/EntryPoint.js');
  const exit = /** @type {import('../src/types/map.js').MapExit} */ ({
    kind: 'fallback',
    targetNodeId: 'region',
    targetName: 'Saltmere Coast',
  });
  const landed = computeParentReturnTile(returnParent(), returnChild(), exit, {
    nodeId: 'child',
    tileId: '1,1',
  });
  assert.ok(['4,4', '5,4', '6,4', '4,5', '5,5', '6,5', '4,6', '5,6', '6,6'].includes(landed));
});

test('leaving a child no parent tile links to lands on painted parent ground', async () => {
  const { computeParentReturnTile } = await import('../src/map/EntryPoint.js');
  const parent = {
    id: 'region',
    name: 'Coast',
    parentId: null,
    width: 6,
    height: 6,
    kind: /** @type {const} */ ('region'),
    environ: null,
    tiles: [createTile('1,1', 'grass.svg')],
  };
  assert.equal(
    computeParentReturnTile(parent, returnChild(), edgeExit('north'), {
      nodeId: 'child',
      tileId: '0,0',
    }),
    '1,1',
  );
});

test('resolveReturnTile stays off the block it came out of, and off walls', async () => {
  const { resolveReturnTile } = await import('../src/map/EntryPoint.js');
  const parent = {
    id: 'region',
    name: 'Coast',
    parentId: null,
    width: 6,
    height: 6,
    kind: /** @type {const} */ ('interior'),
    environ: null,
    tiles: [
      createTile('2,2', 'town.svg', { childNodeId: 'child' }),
      createTile('2,3', `${INTERIOR}-wall-h.svg`),
      createTile('4,4', `${INTERIOR}-floor-1.svg`),
      createTile('0,0', ''),
    ],
  };
  // '2,2' is the block, '2,3' a wall, '0,0' unpainted: the floor is all that's left.
  assert.equal(resolveReturnTile(parent, '2,2', 'child'), '4,4');
  // Nothing usable at all: the preferred id stands.
  const bare = { ...parent, tiles: [createTile('0,0', '')] };
  assert.equal(resolveReturnTile(bare, '3,3', 'child'), '3,3');
  // Every tile belongs to the block: it falls back to painted tiles anyway
  // rather than leaving the party nowhere.
  const allBlock = {
    ...parent,
    tiles: [createTile('2,2', 'town.svg', { childNodeId: 'child' })],
  };
  assert.equal(resolveReturnTile(allBlock, '2,2', 'child'), '2,2');
});

test('resolveReturnTile falls back to the first candidate for an unparseable target', async () => {
  const { resolveReturnTile } = await import('../src/map/EntryPoint.js');
  const parent = {
    id: 'region',
    name: 'Coast',
    parentId: null,
    width: 4,
    height: 4,
    kind: /** @type {const} */ ('region'),
    environ: null,
    tiles: [createTile('1,1', 'grass.svg'), createTile('2,2', 'grass.svg')],
  };
  assert.equal(resolveReturnTile(parent, 'not-a-coord', 'child'), '1,1');
});
