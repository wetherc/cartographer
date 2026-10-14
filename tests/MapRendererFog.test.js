import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MapRenderer } from '../src/map/MapRenderer.js';
import { INK } from '../src/map/CanvasInk.js';
import { DEFAULT_TILE_METADATA, createMapNode, createTile } from '../src/map/TileGrid.js';

/**
 * A renderer over a recording context. The raster stand-in returns a
 * marker object for every ref, so a test reads which images drew.
 */
function recorder() {
  /** @type {{ op: string, fill?: string, image?: unknown }[]} */
  const calls = [];
  const ctx = /** @type {any} */ ({
    fillStyle: '',
    fillRect() {
      calls.push({ op: 'fillRect', fill: ctx.fillStyle });
    },
    drawImage(/** @type {unknown} */ image) {
      calls.push({ op: 'drawImage', image });
    },
  });
  const raster = /** @type {any} */ ({ source: (/** @type {string} */ ref) => ({ ref }) });
  const renderer = new MapRenderer(ctx, { tileSize: 32, raster });
  /** @type {number[]} */
  const outlines = [];
  /** @type {any} */ (renderer)._decorations.renderPoiOutline = (/** @type {number} */ x) =>
    outlines.push(x);
  return { renderer, calls, outlines };
}

/** A fogged tile with a point of interest, which is not discoverable. */
const poiTile = createTile('0,0', 'grass.svg', {
  metadata: { ...DEFAULT_TILE_METADATA, poiType: 'ruin' },
});

/** @param {boolean} fogDim */
const view = (fogDim) =>
  /** @type {any} */ ({
    node: createMapNode('n', 'N', null, 1, 1),
    revealAll: false,
    fogDim,
    markerRange: 99,
    partyTileId: '0,0',
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

test('see-through fog draws the art, then a dim fill, and no POI outline', () => {
  const { renderer, calls, outlines } = recorder();
  /** @type {any} */ (renderer)._terrainPasses.renderTile(
    view(true),
    poiTile,
    0,
    0,
    32,
    32,
    new Set(),
    new Set(),
  );
  assert.deepEqual(calls, [
    { op: 'drawImage', image: { ref: 'grass.svg' } },
    { op: 'fillRect', fill: INK.fogDim },
  ]);
  assert.deepEqual(outlines, [], 'a fogged point of interest gives nothing away');
});

test('see-through fog on a frontier tile uses the frontier tint', () => {
  const { renderer, calls } = recorder();
  /** @type {any} */ (renderer)._terrainPasses.renderTile(
    view(true),
    poiTile,
    0,
    0,
    32,
    32,
    new Set(),
    new Set(['0,0']),
  );
  assert.deepEqual(calls.at(-1), { op: 'fillRect', fill: INK.fogDimFrontier });
});

test('solid fog draws no image for a fogged tile', () => {
  const { renderer, calls, outlines } = recorder();
  /** @type {any} */ (renderer)._terrainPasses.renderTile(
    view(false),
    poiTile,
    0,
    0,
    32,
    32,
    new Set(),
    new Set(),
  );
  assert.deepEqual(calls, [{ op: 'fillRect', fill: INK.fog }]);
  assert.deepEqual(outlines, []);
});

test('see-through fog gates no multi-tile art on the revealed set', () => {
  const { renderer } = recorder();
  const r = /** @type {any} */ (renderer);
  assert.equal(r._revealedIds(view(true)), null);
  assert.notEqual(r._revealedIds(view(false)), null, 'solid fog gates group art');
});

test('a revealed point of interest in range gets its outline', () => {
  const { renderer, outlines } = recorder();
  const tile = { ...poiTile, revealed: true };
  /** @type {any} */ (renderer)._terrainPasses.renderTile(
    view(true),
    tile,
    0,
    0,
    32,
    32,
    new Set(),
    new Set(),
  );
  assert.deepEqual(outlines, [0], 'the outline stand-in records a real draw');
});
