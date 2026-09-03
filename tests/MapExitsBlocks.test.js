import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authoringWarning, blockFor, blocksFor, findExits } from '../src/map/MapExits.js';
import { createTile } from '../src/map/TileGrid.js';
import { gridTiles } from './helpers/grid.js';

/**
 * A 6x6 parent whose tiles at (1,1) and (4,4) each link to "child" as two
 * one-cell blocks that do not touch.
 * @returns {import('../src/types/map.js').MapNode}
 */
function twoBlocks() {
  return {
    id: 'region',
    name: 'Coast',
    parentId: null,
    width: 6,
    height: 6,
    kind: 'region',
    environ: null,
    tiles: gridTiles(6, 6, (id, x, y) => {
      const linked = (x === 1 && y === 1) || (x === 4 && y === 4);
      return createTile(id, 'grass.svg', { childNodeId: linked ? 'child' : null });
    }),
  };
}

test('blockFor picks the block that holds the zoom-through tile', () => {
  const parent = twoBlocks();
  assert.deepEqual(blockFor(parent, 'child', '4,4')?.tileIds, ['4,4']);
  assert.deepEqual(blockFor(parent, 'child', '1,1')?.tileIds, ['1,1']);
});

test('blockFor falls back to the first block without a tile, or with a stray one', () => {
  const parent = twoBlocks();
  assert.deepEqual(blockFor(parent, 'child')?.tileIds, ['1,1']);
  assert.deepEqual(blockFor(parent, 'child', '0,0')?.tileIds, ['1,1']);
});

test('blockFor is null when no tile links to the child', () => {
  assert.equal(blockFor(twoBlocks(), 'nowhere', '1,1'), null);
});

test('blocksFor reports every block linked to the child, and none for a stranger', () => {
  const parent = twoBlocks();
  assert.deepEqual(
    blocksFor(parent, 'child').map((g) => g.tileIds),
    [['1,1'], ['4,4']],
  );
  assert.deepEqual(blocksFor(parent, 'nowhere'), []);
});

/**
 * A 6x6 parent with two one-cell blocks linking "child". Only the block at
 * (1,1) has painted terrain beside it: the block at (5,0) sits in the corner
 * with blank cells on the two sides that are not the grid border.
 * @returns {import('../src/types/map.js').MapNode}
 */
function oneMouthLandlocked() {
  return {
    id: 'region',
    name: 'Coast',
    parentId: null,
    width: 6,
    height: 6,
    kind: 'region',
    environ: null,
    tiles: gridTiles(6, 6, (id, x, y) => {
      const linked = (x === 1 && y === 1) || (x === 5 && y === 0);
      // Everything past x=3 is unpainted, so the second block has nothing to
      // step onto except through the first block's terrain.
      if (x > 3 && !linked) return null;
      return createTile(id, 'grass.svg', { childNodeId: linked ? 'child' : null });
    }),
  };
}

/** The child that both blocks of the parent above link to. */
const child = () => ({
  id: 'child',
  name: 'Sea Cave',
  parentId: 'region',
  width: 3,
  height: 3,
  kind: /** @type {const} */ ('region'),
  environ: null,
  tiles: gridTiles(3, 3),
});

test('the exits of a child are the sides of the block the party came in by', () => {
  const parent = oneMouthLandlocked();
  const sides = (/** @type {string | null} */ through) =>
    findExits(child(), parent, through)
      .map((e) => (e.kind === 'edge' ? e.side : e.kind))
      .sort();
  // The (1,1) block has painted terrain on all four sides.
  assert.deepEqual(sides('1,1'), ['east', 'north', 'south', 'west']);
  // The (5,0) block sits in the parent's corner with blank cells beside it,
  // so its own only way back is the fallback exit.
  assert.deepEqual(sides('5,0'), ['fallback']);
});

test('an unknown entry tile reports the sides of every block, so no way out is hidden', () => {
  const parent = oneMouthLandlocked();
  const sides = findExits(child(), parent, null)
    .map((e) => (e.kind === 'edge' ? e.side : e.kind))
    .sort();
  assert.deepEqual(sides, ['east', 'north', 'south', 'west']);
});

test('Build mode does not call a two-mouth child sealed when one mouth has terrain', () => {
  assert.equal(authoringWarning(child(), oneMouthLandlocked()), null);
});
