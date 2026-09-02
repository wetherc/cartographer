import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeParentReturnTile, computeRegionEntryTile } from '../src/map/EntryPoint.js';
import { createTile } from '../src/map/TileGrid.js';
import { gridTiles } from './helpers/grid.js';

/**
 * A 10x10 outdoor parent, fully painted, with one block that links to the
 * child wherever `inBlock` says so.
 * @param {(x: number, y: number) => boolean} inBlock
 * @returns {import('../src/types/map.js').MapNode}
 */
function parentWith(inBlock) {
  return {
    id: 'region',
    name: 'Saltmere Coast',
    parentId: null,
    width: 10,
    height: 10,
    kind: 'region',
    environ: null,
    tiles: gridTiles(10, 10, (id, x, y) =>
      createTile(id, inBlock(x, y) ? 'town.svg' : 'grass.svg', {
        childNodeId: inBlock(x, y) ? 'child' : null,
      }),
    ),
  };
}

/** @returns {import('../src/types/map.js').MapNode} */
function child() {
  return {
    id: 'child',
    name: 'Thornhold',
    parentId: 'region',
    width: 8,
    height: 8,
    kind: 'region',
    environ: null,
    tiles: gridTiles(8, 8),
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

const inRange = (v, lo, hi) => v >= lo && v <= hi;

test('leaving north from a block on the parent top edge lands beside the block', () => {
  // Block columns 4..6, rows 0..1. North of it is off the grid.
  const parent = parentWith((x, y) => inRange(x, 4, 6) && inRange(y, 0, 1));
  const back = computeParentReturnTile(parent, child(), edgeExit('north'), {
    nodeId: 'child',
    tileId: '0,0',
  });
  // Column 4 projects to itself. Row -1 clamps to row 0, which is the block,
  // so the snap moves one cell west onto painted grass.
  assert.equal(back, '3,0');
});

test('leaving west from a block on the parent left edge lands beside the block', () => {
  // Block columns 0..2, rows 4..6. West of it is off the grid.
  const parent = parentWith((x, y) => inRange(x, 0, 2) && inRange(y, 4, 6));
  const back = computeParentReturnTile(parent, child(), edgeExit('west'), {
    nodeId: 'child',
    tileId: '0,3',
  });
  // Row 3 of 8 projects to block row 5. Column -1 clamps to column 0, in
  // the block, so the snap picks the nearest painted cell off it: (0,3) and
  // (0,7) tie, and the first in tile order wins.
  assert.equal(back, '0,3');
});

test('leaving east from a block on the parent right edge lands beside the block', () => {
  // Block columns 7..9, rows 4..6.
  const parent = parentWith((x, y) => inRange(x, 7, 9) && inRange(y, 4, 6));
  const back = computeParentReturnTile(parent, child(), edgeExit('east'), {
    nodeId: 'child',
    tileId: '7,7',
  });
  assert.equal(back, '9,7');
});

test('leaving south from a block on the parent bottom edge lands beside the block', () => {
  // Block columns 4..6, rows 8..9.
  const parent = parentWith((x, y) => inRange(x, 4, 6) && inRange(y, 8, 9));
  const back = computeParentReturnTile(parent, child(), edgeExit('south'), {
    nodeId: 'child',
    tileId: '0,7',
  });
  assert.equal(back, '3,9');
});

// Two blocks that do not touch, both linking the same child: a cave with two
// mouths. Block A sits at columns 1..2, rows 1..2. Block B sits at columns
// 6..7, rows 6..7.
const twoMouths = () =>
  parentWith(
    (x, y) => (inRange(x, 1, 2) && inRange(y, 1, 2)) || (inRange(x, 6, 7) && inRange(y, 6, 7)),
  );

test('the return uses the block the party zoomed through', () => {
  const parent = twoMouths();
  const from = { nodeId: 'child', tileId: '0,0' };
  // Through block B: column 0 projects onto column 6, one row north of it.
  assert.equal(computeParentReturnTile(parent, child(), edgeExit('north'), from, '6,6'), '6,5');
  // Through block A, the same way.
  assert.equal(computeParentReturnTile(parent, child(), edgeExit('north'), from, '2,1'), '1,0');
});

test('the return falls back to the first block when the way in is unknown', () => {
  const parent = twoMouths();
  const from = { nodeId: 'child', tileId: '0,0' };
  assert.equal(computeParentReturnTile(parent, child(), edgeExit('north'), from), '1,0');
  // A tile that belongs to no block of this child is the same as none.
  assert.equal(computeParentReturnTile(parent, child(), edgeExit('north'), from, '0,0'), '1,0');
});

test('the entry uses the block the party zooms through', () => {
  const parent = twoMouths();
  // West of block B, aligned with its rows.
  const party = { nodeId: 'region', tileId: '5,6' };
  assert.equal(computeRegionEntryTile(parent, child(), 'child', party, '6,6'), '0,0');
  // Without the tile, block A is read, and the same party stands past its
  // south-east corner.
  assert.equal(computeRegionEntryTile(parent, child(), 'child', party), '7,7');
});
