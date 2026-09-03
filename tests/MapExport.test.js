import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectImageRefs,
  exceedsExportCap,
  exportFilename,
  exportTileSize,
  refsToDecode,
  EXPORT_TILE_SIZE,
  MAX_EXPORT_PIXELS,
  MAX_EXPORT_SIDE,
  MIN_EXPORT_TILE_SIZE,
} from '../src/map/MapExport.js';
import { imageSrcForRef } from '../src/map/MapRenderer.js';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';

test('collectImageRefs dedupes bases and includes overlays', () => {
  let node = createMapNode('n', 'Node', null, 3, 1);
  node = setTile(node, createTile('0,0', 'tiles/grass-1.png'));
  node = setTile(node, createTile('1,0', 'tiles/grass-1.png', { overlayRef: 'tiles/road-h.png' }));
  node = setTile(node, createTile('2,0', 'tiles/water-1.png'));

  assert.deepEqual(collectImageRefs(node).sort(), [
    'tiles/grass-1.png',
    'tiles/road-h.png',
    'tiles/water-1.png',
  ]);
});

test('collectImageRefs skips empty refs', () => {
  let node = createMapNode('n', 'Node', null, 1, 1);
  node = setTile(node, createTile('0,0', ''));
  assert.deepEqual(collectImageRefs(node), []);
});

test('imageSrcForRef roots built-in paths and leaves data URLs alone', () => {
  assert.equal(imageSrcForRef('tiles/grass-1.png'), '/tiles/grass-1.png');
  const dataUrl = 'data:image/png;base64,AAAA';
  assert.equal(imageSrcForRef(dataUrl), dataUrl);
});

test('refsToDecode skips refs a live cache already decoded', () => {
  const refs = ['a.png', 'b.png', 'c.png'];
  assert.deepEqual(refsToDecode(refs, undefined), refs, 'no cache means decode everything');
  const cache = new Map([
    ['a.png', /** @type {any} */ ({ complete: true })],
    ['b.png', /** @type {any} */ ({ complete: false })],
  ]);
  assert.deepEqual(refsToDecode(refs, cache), ['b.png', 'c.png'], 'a still-loading image reloads');
});

test('exportFilename slugs the node name and always ends in .png', () => {
  assert.equal(exportFilename('Northmarch Region'), 'northmarch-region.png');
  assert.equal(exportFilename('Crypt (level 2)'), 'crypt-level-2.png');
  assert.equal(exportFilename('***'), 'map.png');
});

/** A node of the given extent, with no tiles. Only the extent is read here. */
const extent = (width, height) => createMapNode('n', 'Node', null, width, height);

test('a node that fits keeps the full tile resolution', () => {
  assert.equal(exportTileSize(extent(1, 1)), EXPORT_TILE_SIZE);
  assert.equal(exportTileSize(extent(64, 64)), EXPORT_TILE_SIZE);
  assert.equal(exceedsExportCap(extent(64, 64)), false);
});

test('a node past the area budget scales down instead of failing', () => {
  const size = exportTileSize(extent(200, 200));
  assert.ok(size < EXPORT_TILE_SIZE, `${size} is smaller than a full tile`);
  assert.ok(size >= MIN_EXPORT_TILE_SIZE, `${size} is still readable`);
  assert.ok(200 * size * (200 * size) <= MAX_EXPORT_PIXELS, 'the canvas fits the area budget');
});

test('a long thin node is held to the longest side, not the area alone', () => {
  const node = extent(1000, 1);
  // 1000 cells leave room for 129 pixels each by area, but 1000 tiles of that
  // size is a side of 129,000 pixels.
  assert.ok(exportTileSize(node) * 1000 <= MAX_EXPORT_SIDE);
  assert.equal(exportTileSize(node), Math.floor(MAX_EXPORT_SIDE / 1000));
});

test('a node too large to draw readably is refused', () => {
  assert.equal(exportTileSize(extent(3000, 3000)), 0);
  assert.equal(exceedsExportCap(extent(3000, 3000)), true);
});

test('exportTileSize never asks for more than the caller wanted', () => {
  assert.equal(exportTileSize(extent(4, 4), 16), 16);
  assert.equal(exportTileSize(extent(4, 4), 1), 1, 'a small request stands');
});

test('a broken extent from an edited save exports nothing', () => {
  assert.equal(exportTileSize(extent(Number.NaN, 4)), 0);
  assert.equal(exportTileSize(extent(4, Number.POSITIVE_INFINITY)), 0);
});
