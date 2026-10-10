import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INK } from '../src/map/CanvasInk.js';
import {
  approximateCell,
  compassArea,
  miniMapStartsOpen,
  miniMapTileSize,
  miniMapView,
  paintTerrain,
} from '../src/map/MiniMapLayout.js';
import { findRegionGroups } from '../src/map/RegionGroups.js';
import { interiorArt } from '../src/map/TileKinds.js';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { fillTiles, gridTiles } from './helpers/grid.js';

/** @typedef {import('../src/types/map.js').MapNode} MapNode */

/**
 * A parent painted from a picture, one row per string: a letter links that
 * cell to the child of the same name, and "." leaves it unlinked.
 * @param {string[]} rows
 * @returns {MapNode}
 */
function painted(rows) {
  return fillTiles(createMapNode('world', 'World', null, rows[0].length, rows.length), (id, x, y) =>
    createTile(id, 'grass.svg', { childNodeId: rows[y][x] === '.' ? null : rows[y][x] }),
  );
}

/** @param {string} id @param {number} [size] @returns {MapNode} */
function child(id, size = 9) {
  return { ...createMapNode(id, id, 'world', size, size), tiles: gridTiles(size, size) };
}

/** @param {MapNode} parent @param {string} id */
function group(parent, id) {
  const found = findRegionGroups(parent).find((g) => g.childNodeId === id);
  assert.ok(found);
  return found;
}

// A is a 3x3 square at (1..3, 0..2). B is an L whose top row reaches x 4.
const WORLD = painted(['.AAABB', '.AAAB.', '.AAAB.', '......']);
const L = painted(['BBB', 'B..', 'B..']);

test('approximateCell scales a child cell onto the block', () => {
  const a = group(WORLD, 'A');
  const node = child('A');
  assert.deepEqual(approximateCell(a, node, { x: 0, y: 0 }), { x: 1, y: 0 });
  assert.deepEqual(approximateCell(a, node, { x: 8, y: 8 }), { x: 3, y: 2 });
  assert.deepEqual(approximateCell(a, node, { x: 4, y: 4 }), { x: 2, y: 1 });
});

test('approximateCell moves a point outside a ragged block to its nearest cell', () => {
  const b = group(L, 'B');
  // The east edge of the child maps to (2, 1), which is outside the L.
  assert.deepEqual(approximateCell(b, child('B'), { x: 8, y: 4 }), { x: 2, y: 0 });
});

test('miniMapView is null for the world and for a node no parent tile links to', () => {
  const position = { nodeId: 'A', tileId: '0,0' };
  assert.equal(miniMapView(WORLD, null, position), null);
  assert.equal(miniMapView(child('C'), WORLD, position), null);
});

test('miniMapView marks the party in the node, on the parent, or nowhere', () => {
  const node = child('A');
  const inNode = miniMapView(node, WORLD, { nodeId: 'A', tileId: '8,0' });
  assert.equal(inNode?.parent, WORLD);
  assert.equal(inNode?.group.childNodeId, 'A');
  assert.deepEqual(inNode?.partyCell, { x: 3, y: 0 });

  const onParent = miniMapView(node, WORLD, { nodeId: 'world', tileId: '0,3' });
  assert.deepEqual(onParent?.partyCell, { x: 0, y: 3 });

  assert.equal(miniMapView(node, WORLD, { nodeId: 'B', tileId: '0,0' })?.partyCell, null);
  assert.equal(
    miniMapView(node, WORLD, { nodeId: 'A', tileId: 'entrance' })?.partyCell,
    null,
    'an id that is not a grid cell marks nothing',
  );
});

test('miniMapView uses the block the traveler entered through', () => {
  const twoMouths = painted(['A.A', '...']);
  const view = miniMapView(child('A'), twoMouths, { nodeId: 'A', tileId: '0,0' }, '2,0');
  assert.deepEqual(view?.partyCell, { x: 2, y: 0 });
});

test('miniMapTileSize fits the longest side and never drops below one pixel', () => {
  assert.equal(miniMapTileSize(40, 20, 160), 4);
  assert.equal(miniMapTileSize(6, 6, 160), 26);
  assert.equal(miniMapTileSize(500, 10, 160), 1);
  assert.equal(miniMapTileSize(0, 0, 160), 160);
});

test('compassArea names the third of the map a cell is in', () => {
  assert.equal(compassArea({ x: 0, y: 0 }, 9, 9), 'north-west');
  assert.equal(compassArea({ x: 4, y: 0 }, 9, 9), 'north');
  assert.equal(compassArea({ x: 8, y: 4 }, 9, 9), 'east');
  assert.equal(compassArea({ x: 4, y: 4 }, 9, 9), 'center');
  assert.equal(compassArea({ x: 8, y: 8 }, 9, 9), 'south-east');
  assert.equal(compassArea({ x: 0, y: 8 }, 0, 0), 'south-west');
});

/** A 2d context that records fills, as [style, x, y, w, h], and draws, as [source, x, y]. */
function recordingContext() {
  const fills = [];
  const draws = [];
  return {
    fills,
    draws,
    fillStyle: '',
    /** @param {number} x @param {number} y @param {number} w @param {number} h */
    fillRect(x, y, w, h) {
      fills.push([this.fillStyle, x, y, w, h]);
    },
    /** @param {any} source @param {number} x @param {number} y */
    drawImage(source, x, y) {
      draws.push([source, x, y]);
    },
  };
}

/** A 2x2 parent: a revealed tile with an overlay, a fogged tile, an unloaded base, and no base. */
function terrainParent() {
  const node = createMapNode('p', 'P', null, 2, 2);
  return {
    ...node,
    tiles: [
      createTile('0,0', 'grass', { revealed: true, overlayRef: 'road' }),
      createTile('1,0', 'grass'),
      createTile('0,1', 'slow', { revealed: true, overlayRef: 'slow-road' }),
      createTile('1,1', '', { revealed: true }),
      createTile('entrance', 'grass', { revealed: true }),
    ],
  };
}

/** @param {string} ref @param {number} size */
const loaded = (ref, size) =>
  ref.startsWith('slow') ? null : /** @type {any} */ (`${ref}@${size}`);

test('paintTerrain draws each tile from the source at the tile size, with fog outside Build mode', () => {
  const ctx = recordingContext();
  paintTerrain(/** @type {any} */ (ctx), terrainParent(), 3, false, loaded);
  assert.deepEqual(ctx.draws, [
    ['grass@3', 0, 0],
    ['road@3', 0, 0],
  ]);
  assert.deepEqual(ctx.fills, [
    [INK.mapBackdrop, 0, 0, 6, 6],
    [INK.fog, 3, 0, 3, 3],
    [INK.missingArt, 0, 3, 3, 3],
    [INK.missingArt, 3, 3, 3, 3],
  ]);
});

test('paintTerrain draws a fogged tile in Build mode, and a missing overlay leaves no placeholder', () => {
  const ctx = recordingContext();
  paintTerrain(/** @type {any} */ (ctx), terrainParent(), 3, true, loaded);
  assert.deepEqual(
    ctx.draws.map((d) => d[0]),
    ['grass@3', 'road@3', 'grass@3'],
  );
  assert.deepEqual(
    ctx.fills.map((f) => f[0]),
    [INK.mapBackdrop, INK.missingArt, INK.missingArt],
  );
});

test('paintTerrain draws the frontier of an interior a lighter fog', () => {
  const node = createMapNode('keep', 'Keep', 'vale', 2, 1, { kind: 'interior' });
  const parent = {
    ...node,
    tiles: [
      createTile('0,0', interiorArt('floor-1'), { revealed: true }),
      createTile('1,0', interiorArt('floor-1')),
    ],
  };
  const ctx = recordingContext();
  paintTerrain(/** @type {any} */ (ctx), parent, 3, false, loaded);
  assert.deepEqual(ctx.fills.at(-1), [INK.fogFrontier, 3, 0, 3, 3]);
});

test('miniMapStartsOpen follows the stored choice, then the window width', () => {
  assert.equal(miniMapStartsOpen('1', false), false);
  assert.equal(miniMapStartsOpen('0', true), true);
  assert.equal(miniMapStartsOpen(null, false), true);
  assert.equal(miniMapStartsOpen(null, true), false);
});
