import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectImageRefs,
  exportCanvasSize,
  exportFilename,
  exportLead,
  exportTileSize,
  refsToDecode,
  EXPORT_LEAD,
  EXPORT_TILE_SIZE,
  MAX_EXPORT_PIXELS,
  MAX_EXPORT_SIDE,
  MIN_EXPORT_TILE_SIZE,
} from '../src/map/MapExport.js';
import { coordLabelLayout, visibleCoordLabels } from '../src/map/CoordLabels.js';
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
  // 63 tiles of 64 pixels plus the label margin is a 4,096 pixel side.
  assert.equal(exportTileSize(extent(63, 63)), EXPORT_TILE_SIZE);
  assert.notEqual(exportTileSize(extent(64, 64)), 0);
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
});

test('exportTileSize never asks for more than the caller wanted', () => {
  assert.equal(exportTileSize(extent(4, 4), 16), 16);
  assert.equal(exportTileSize(extent(4, 4), 1), 1, 'a small request stands');
});

test('a broken extent from an edited save exports nothing', () => {
  assert.equal(exportTileSize(extent(Number.NaN, 4)), 0);
  assert.equal(exportTileSize(extent(4, Number.POSITIVE_INFINITY)), 0);
});

test('an export leaves a label margin only when the tiles are labelled', () => {
  assert.equal(exportLead(EXPORT_TILE_SIZE), EXPORT_LEAD);
  assert.equal(exportLead(MIN_EXPORT_TILE_SIZE), 0, 'tiny tiles draw no labels');
  assert.deepEqual(exportCanvasSize(extent(4, 3), 64), { width: 320, height: 256, lead: 64 });
  assert.deepEqual(exportCanvasSize(extent(4, 3), 8), { width: 32, height: 24, lead: 0 });
});

test('the label margin counts toward the canvas side limit', () => {
  // 256 tiles at 64 pixels fill the side limit exactly, so the margin pushes
  // the tile size down one step.
  const node = extent(256, 1);
  const size = exportTileSize(node);
  assert.equal(size, 63);
  assert.ok(exportCanvasSize(node, size).width <= MAX_EXPORT_SIDE);
});

test('an export at full size labels column 1 and row 1', () => {
  // Regression: an export drawn at offset 0 dropped the first label of each
  // run and drew the rest over the first row and column of tiles.
  const node = extent(5, 4);
  const { width, height, lead } = exportCanvasSize(node, EXPORT_TILE_SIZE);
  const view = {
    node,
    offsetX: lead,
    offsetY: lead,
    scale: 1,
    canvasWidth: width,
    canvasHeight: height,
  };
  const layout = coordLabelLayout(view, EXPORT_TILE_SIZE);
  assert.ok(layout);
  const { columns, rows } = visibleCoordLabels(view, layout);
  assert.deepEqual(
    columns.map((c) => c.text),
    ['1', '2', '3', '4', '5'],
  );
  assert.deepEqual(
    rows.map((r) => r.text),
    ['1', '2', '3', '4'],
  );
  assert.ok(layout.colY < lead, 'column labels sit above the first row');
  assert.ok(layout.rowX < lead, 'row labels sit left of the first column');
});
