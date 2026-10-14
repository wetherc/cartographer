import test from 'node:test';
import assert from 'node:assert/strict';
import { MapRenderer } from '../src/map/MapRenderer.js';
import { createMapNode } from '../src/map/TileGrid.js';

/** A 2d context that accepts every call and records drawImage sources. */
function permissiveCtx() {
  /** @type {unknown[]} */
  const images = [];
  /** @type {Record<string | symbol, unknown>} */
  const store = { images };
  return /** @type {any} */ (
    new Proxy(store, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'drawImage') return (/** @type {unknown} */ img) => images.push(img);
        return () => {};
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    })
  );
}

/** A live-map renderer with fake offscreen canvases, and a spy on its terrain passes. */
function harness() {
  const main = permissiveCtx();
  /** @type {any[]} */
  const canvases = [];
  const renderer = new MapRenderer(main, {
    tileSize: 32,
    layer: true,
    createCanvas: (width, height) => {
      const canvas = /** @type {any} */ ({ width, height, ctx: permissiveCtx() });
      canvas.getContext = () => canvas.ctx;
      canvases.push(canvas);
      return canvas;
    },
  });
  /** @type {{ ctx: unknown, offsetX: number }[]} */
  const terrain = [];
  const real = renderer._renderTerrain.bind(renderer);
  renderer._renderTerrain = (/** @type {any} */ v, /** @type {any} */ f) => {
    terrain.push({ ctx: renderer.ctx, offsetX: v.offsetX });
    real(v, f);
  };
  return { renderer, main, canvases, terrain };
}

// No tiles, so no tile art loads: the passes only need to run.
const node = createMapNode('n', 'N', null, 4, 4);
const groups = /** @type {any[]} */ ([]);

/** @param {object} [overrides] */
const view = (overrides = {}) =>
  /** @type {any} */ ({
    node,
    regionGroups: groups,
    revealAll: false,
    markerRange: 4,
    partyTileId: null,
    selectedTileId: null,
    cursorCellId: null,
    focused: false,
    scale: 1,
    offsetX: 10.4,
    offsetY: 20.6,
    canvasWidth: 200,
    canvasHeight: 160,
    ...overrides,
  });

test('the live map paints terrain into the layer once and then copies it', () => {
  const { renderer, main, canvases, terrain } = harness();
  renderer.render(view());
  // The first frame at a scale draws direct, from rounded offsets.
  assert.deepEqual(terrain, [{ ctx: main, offsetX: 10 }]);
  // The view starts left of and above the map's first cell, so its rect
  // crosses both wrap lines of the layer and paints as four pieces.
  renderer.render(view());
  assert.equal(terrain.length, 5);
  assert.ok(terrain.slice(1).every((t) => t.ctx === canvases[0].ctx));
  assert.equal(renderer.ctx, main);
  assert.ok(main.images.includes(canvases[0]));
  // A sub-pixel move rounds to the same offset and paints nothing.
  renderer.render(view({ offsetX: 10.2 }));
  assert.equal(terrain.length, 5);
  // A one-pixel move paints the strip on the left, in its two wrap pieces.
  renderer.render(view({ offsetX: 11.2 }));
  assert.equal(terrain.length, 7);
});

test('a tile image load drops the cached terrain', () => {
  const { renderer, terrain } = harness();
  renderer.render(view());
  renderer.render(view());
  const painted = terrain.length;
  renderer.render(view());
  assert.equal(terrain.length, painted);
  renderer._raster.onLoad?.();
  renderer.render(view());
  assert.ok(terrain.length > painted);
});

test('the layer restores the map context when a pass throws', () => {
  const { renderer, main } = harness();
  renderer.render(view());
  renderer._terrainPasses.renderTiles = () => {
    throw new Error('boom');
  };
  assert.throws(() => renderer.render(view()), /boom/);
  assert.equal(renderer.ctx, main);
});

test('a one-shot renderer uses fractional offsets and has no layer', () => {
  const main = permissiveCtx();
  const renderer = new MapRenderer(main, { tileSize: 32 });
  /** @type {number[]} */
  const offsets = [];
  renderer._renderTerrain = (/** @type {any} */ v) => offsets.push(v.offsetX);
  renderer.render(view());
  renderer.render(view());
  assert.deepEqual(offsets, [10.4, 10.4]);
  assert.equal(renderer._terrain, null);
});
