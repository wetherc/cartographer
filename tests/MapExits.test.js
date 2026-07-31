import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  edgeExitBand,
  exitDescription,
  exitForSide,
  exitForTile,
  exitLabel,
  findExits,
  hitExitBand,
  isSealedInterior,
  nearestSide,
} from '../src/map/MapExits.js';
import { createTile } from '../src/map/TileGrid.js';
import { gridTiles } from './helpers/grid.js';

const INTERIOR = 'assets/tiles/interior/interior';

/**
 * @param {Partial<import('../src/types/map.js').MapNode> & { id: string }} fields
 * @returns {import('../src/types/map.js').MapNode}
 */
function node(fields) {
  return {
    name: fields.id,
    parentId: null,
    width: 6,
    height: 6,
    kind: 'region',
    environ: null,
    tiles: [],
    ...fields,
  };
}

/**
 * A parent whose 2x2 block at x 2..3, y 2..3 links to "child", with painted
 * terrain only where `paint` says so.
 * @param {(x: number, y: number) => boolean} paint
 * @returns {import('../src/types/map.js').MapNode}
 */
function parentWithBlock(paint) {
  const tiles = gridTiles(6, 6, (id, x, y) => {
    const inBlock = x >= 2 && x <= 3 && y >= 2 && y <= 3;
    if (inBlock) return createTile(id, 'town.svg', { childNodeId: 'child' });
    return paint(x, y) ? createTile(id, 'grass.svg') : null;
  });
  return node({ id: 'region', name: 'Saltmere Coast', tiles });
}

const child = node({ id: 'child', name: 'Thornhold', parentId: 'region', tiles: gridTiles(6, 6) });

test('no parent means no exits', () => {
  assert.deepEqual(findExits(child, null), []);
  assert.deepEqual(
    findExits(
      null,
      parentWithBlock(() => true),
    ),
    [],
  );
});

test('an outdoor child gets one edge exit per side abutting painted parent terrain', () => {
  const exits = findExits(
    child,
    parentWithBlock(() => true),
  );
  assert.deepEqual(
    exits.map((e) => (e.kind === 'edge' ? e.side : e.kind)),
    ['north', 'east', 'south', 'west'],
  );
  assert.equal(exits[0].targetNodeId, 'region');
  assert.equal(exits[0].targetName, 'Saltmere Coast');
});

test('a side with no painted parent terrain beside the block is not an exit', () => {
  // Terrain everywhere except the row above the block.
  const exits = findExits(
    child,
    parentWithBlock((x, y) => y !== 1),
  );
  assert.deepEqual(
    exits.map((e) => (e.kind === 'edge' ? e.side : e.kind)),
    ['east', 'south', 'west'],
  );
});

test('diagonal contact past a corner is not an exit', () => {
  // A single painted tile off the block's north-west corner: no orthogonal
  // neighbour of any member cell, so nothing to step onto.
  const exits = findExits(
    child,
    parentWithBlock((x, y) => x === 1 && y === 1),
  );
  assert.deepEqual(
    exits.map((e) => e.kind),
    ['fallback'],
  );
});

test('a ragged block reports a side that only one of its cells abuts', () => {
  // L-shaped block: (2,2), (3,2), (2,3). Only (3,2) has painted terrain east of it.
  const tiles = gridTiles(6, 6, (id, x, y) => {
    const inBlock = (x === 2 && y === 2) || (x === 3 && y === 2) || (x === 2 && y === 3);
    if (inBlock) return createTile(id, 'town.svg', { childNodeId: 'child' });
    return x === 4 && y === 2 ? createTile(id, 'grass.svg') : null;
  });
  const exits = findExits(child, node({ id: 'region', name: 'Coast', tiles }));
  assert.deepEqual(
    exits.map((e) => (e.kind === 'edge' ? e.side : e.kind)),
    ['east'],
  );
});

test('an unpainted neighbour cell is not terrain to step onto', () => {
  // Cells exist all around the block but carry no image (an erased map).
  const tiles = gridTiles(6, 6, (id, x, y) => {
    const inBlock = x >= 2 && x <= 3 && y >= 2 && y <= 3;
    return createTile(id, inBlock ? 'town.svg' : '', inBlock ? { childNodeId: 'child' } : {});
  });
  const exits = findExits(child, node({ id: 'region', name: 'Coast', tiles }));
  assert.deepEqual(
    exits.map((e) => e.kind),
    ['fallback'],
  );
});

test('a child no parent tile links to falls back', () => {
  const parent = node({ id: 'region', name: 'Coast', tiles: gridTiles(6, 6) });
  assert.deepEqual(
    findExits(child, parent).map((e) => e.kind),
    ['fallback'],
  );
});

test('an interior exits through a door on its border', () => {
  const interior = node({
    id: 'child',
    name: 'Keep',
    kind: 'interior',
    tiles: [
      createTile('0,2', `${INTERIOR}-door-v.svg`),
      createTile('1,2', `${INTERIOR}-floor-1.svg`),
    ],
  });
  const exits = findExits(
    interior,
    parentWithBlock(() => true),
  );
  assert.deepEqual(exits, [
    {
      kind: 'tile',
      tileId: '0,2',
      via: 'door',
      targetNodeId: 'region',
      targetName: 'Saltmere Coast',
    },
  ]);
});

test('an interior exits through a door that opens onto the void', () => {
  // Door at (2,2) with an empty cell above it: outside the structure.
  const interior = node({
    id: 'child',
    name: 'Vault',
    kind: 'interior',
    tiles: [
      createTile('2,2', `${INTERIOR}-door-h.svg`),
      createTile('2,3', `${INTERIOR}-floor-1.svg`),
      createTile('1,2', `${INTERIOR}-wall-v.svg`),
      createTile('3,2', `${INTERIOR}-wall-v.svg`),
    ],
  });
  const exits = findExits(
    interior,
    parentWithBlock(() => true),
  );
  assert.deepEqual(
    exits.map((e) => (e.kind === 'tile' ? e.tileId : e.kind)),
    ['2,2'],
  );
});

test('an interior door boxed in by floor on every side is not a way out', () => {
  const interior = node({
    id: 'child',
    name: 'Vault',
    kind: 'interior',
    width: 5,
    height: 5,
    tiles: gridTiles(5, 5, (id, x, y) =>
      createTile(id, x === 2 && y === 2 ? `${INTERIOR}-door-h.svg` : `${INTERIOR}-floor-1.svg`),
    ),
  });
  assert.deepEqual(
    findExits(
      interior,
      parentWithBlock(() => true),
    ).map((e) => e.kind),
    ['fallback'],
  );
});

test('an interior exits up its stairs, and skips ones that lead further in', () => {
  const interior = node({
    id: 'child',
    name: 'Crypt level 2',
    kind: 'interior',
    tiles: [
      createTile('4,4', `${INTERIOR}-stairs-down.svg`, { childNodeId: 'lvl-3' }),
      createTile('2,3', `${INTERIOR}-stairs-up.svg`),
      createTile('1,1', `${INTERIOR}-floor-1.svg`),
    ],
  });
  const exits = findExits(
    interior,
    parentWithBlock(() => true),
  );
  assert.deepEqual(
    exits.map((e) => (e.kind === 'tile' ? `${e.via}@${e.tileId}` : e.kind)),
    ['stairs-up@2,3'],
  );
});

test('exits are ordered by tile id whatever order the tiles came in', () => {
  const interior = node({
    id: 'child',
    name: 'Keep',
    kind: 'interior',
    tiles: [
      createTile('4,0', `${INTERIOR}-door-h.svg`),
      createTile('0,1', `${INTERIOR}-door-v.svg`),
      createTile('2,5', `${INTERIOR}-door-h.svg`),
    ],
  });
  assert.deepEqual(
    findExits(
      interior,
      parentWithBlock(() => true),
    ).map((e) => (e.kind === 'tile' ? e.tileId : '')),
    ['0,1', '2,5', '4,0'],
  );
});

test('isSealedInterior flags only an interior with nothing authored', () => {
  const parent = parentWithBlock(() => true);
  const sealed = node({
    id: 'child',
    kind: 'interior',
    tiles: [createTile('1,1', `${INTERIOR}-floor-1.svg`)],
  });
  const open = node({
    id: 'child',
    kind: 'interior',
    tiles: [createTile('0,1', `${INTERIOR}-door-v.svg`)],
  });
  assert.equal(isSealedInterior(sealed, parent), true);
  assert.equal(isSealedInterior(open, parent), false);
  // An outdoor child with no terrain beside its block gets a fallback too, but
  // it is not a sealed interior and Build mode has nothing to warn about.
  assert.equal(
    isSealedInterior(
      child,
      parentWithBlock(() => false),
    ),
    false,
  );
  assert.equal(isSealedInterior(null, parent), false);
  assert.equal(isSealedInterior(sealed, null), false);
});

test('exitForTile and exitForSide find the exit a click resolves to', () => {
  const exits = findExits(
    child,
    parentWithBlock(() => true),
  );
  assert.equal(exitForSide(exits, 'south')?.kind, 'edge');
  assert.equal(exitForTile(exits, '1,1'), null);
  const doorExits = findExits(
    node({ id: 'child', kind: 'interior', tiles: [createTile('0,1', `${INTERIOR}-door-v.svg`)] }),
    parentWithBlock(() => true),
  );
  assert.equal(exitForTile(doorExits, '0,1')?.kind, 'tile');
  assert.equal(exitForSide(doorExits, 'north'), null);
});

test('nearestSide picks the closest border', () => {
  const n = node({ id: 'n', width: 10, height: 6 });
  assert.equal(nearestSide(n, { x: 5, y: 0 }), 'north');
  assert.equal(nearestSide(n, { x: 0, y: 3 }), 'west');
  assert.equal(nearestSide(n, { x: 9, y: 3 }), 'east');
  assert.equal(nearestSide(n, { x: 5, y: 5 }), 'south');
});

test('labels name the region and, for assistive tech, the way out', () => {
  const exits = findExits(
    child,
    parentWithBlock(() => true),
  );
  assert.equal(exitLabel(exits[0]), 'Return to Saltmere Coast');
  assert.equal(
    exitDescription(exits[0]),
    'Return to Saltmere Coast, off the north edge of the map',
  );
  const door = {
    /** @type {'tile'} */ kind: 'tile',
    tileId: '0,1',
    /** @type {'door'} */ via: 'door',
    targetNodeId: 'region',
    targetName: 'Saltmere Coast',
  };
  assert.equal(exitDescription(door), 'Return to Saltmere Coast, through the door at 0,1');
  assert.equal(
    exitDescription({ ...door, via: 'stairs-up' }),
    'Return to Saltmere Coast, through the stairs up at 0,1',
  );
  assert.equal(
    exitDescription({ kind: 'fallback', targetNodeId: 'region', targetName: 'Saltmere Coast' }),
    'Return to Saltmere Coast',
  );
});

const geom = {
  width: 8,
  height: 8,
  tileSize: 48,
  offsetX: 250,
  offsetY: 250,
  scale: 1,
  canvasWidth: 900,
  canvasHeight: 800,
  alongCell: 3,
};

/** @param {import('../src/types/map.js').ExitSide} side */
function band(side, over = geom) {
  return edgeExitBand(
    { kind: 'edge', side, targetNodeId: 'region', targetName: 'Saltmere Coast' },
    over,
  );
}

test('an edge band is a bounded pill just outside the map border', () => {
  const north = band('north');
  // Above the grid's top edge, and no taller than a tile.
  assert.ok(north.y + north.h <= geom.offsetY);
  assert.ok(north.h <= 46);
  // Centred on the party's column.
  assert.equal(Math.round(north.x + north.w / 2), geom.offsetX + 3.5 * 48);

  const south = band('south');
  assert.ok(south.y >= geom.offsetY + geom.height * 48);

  const west = band('west');
  assert.ok(west.x + west.w <= geom.offsetX);
  assert.equal(Math.round(west.y + west.h / 2), geom.offsetY + 3.5 * 48);

  const east = band('east');
  assert.ok(east.x >= geom.offsetX + geom.width * 48);
});

test('a band clamps onto the canvas when the map edge is panned out of view', () => {
  const panned = { ...geom, offsetX: -900, offsetY: -900 };
  for (const side of /** @type {const} */ (['north', 'east', 'south', 'west'])) {
    const b = band(side, panned);
    assert.ok(b.x >= 8, `${side} x`);
    assert.ok(b.y >= 8, `${side} y`);
    assert.ok(b.x + b.w <= panned.canvasWidth, `${side} right`);
    assert.ok(b.y + b.h <= panned.canvasHeight, `${side} bottom`);
  }
});

test('the band centre clamps to the map extent for an out-of-range party cell', () => {
  const far = band('north', { ...geom, alongCell: 99 });
  assert.equal(Math.round(far.x + far.w / 2), geom.offsetX + 7.5 * 48);
  const before = band('north', { ...geom, alongCell: -4 });
  assert.equal(Math.round(before.x + before.w / 2), geom.offsetX + 0.5 * 48);
});

test('hitExitBand answers only for points inside the band', () => {
  const exit = /** @type {const} */ ({
    kind: 'edge',
    side: 'north',
    targetNodeId: 'region',
    targetName: 'Saltmere Coast',
  });
  const b = edgeExitBand(exit, geom);
  assert.equal(hitExitBand(exit, geom, b.x + 2, b.y + 2), true);
  assert.equal(hitExitBand(exit, geom, b.x + b.w / 2, b.y + b.h / 2), true);
  assert.equal(hitExitBand(exit, geom, b.x - 4, b.y + b.h / 2), false);
  assert.equal(hitExitBand(exit, geom, b.x + b.w / 2, b.y + b.h + 4), false);
});

test('a band never grows past the canvas, however long the region name', () => {
  const long = edgeExitBand(
    {
      kind: 'edge',
      side: 'north',
      targetNodeId: 'region',
      targetName: 'The Impossibly Overlong Coastal Margravate of Saltmere and Thornhold',
    },
    { ...geom, canvasWidth: 300 },
  );
  assert.ok(long.w <= 300 - 16);
});
