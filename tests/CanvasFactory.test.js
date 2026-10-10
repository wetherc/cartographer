import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOffscreenCanvas } from '../src/map/CanvasFactory.js';
import { TileRaster } from '../src/map/TileRaster.js';

test('createOffscreenCanvas returns null when there is no document', () => {
  assert.equal(createOffscreenCanvas(4, 4), null);
});

test('createOffscreenCanvas sizes a new canvas element', (t) => {
  const made = /** @type {{ tag: string, width: number, height: number }[]} */ ([]);
  globalThis.document = /** @type {any} */ ({
    createElement: (/** @type {string} */ tag) => {
      const canvas = { tag, width: 0, height: 0 };
      made.push(canvas);
      return canvas;
    },
  });
  t.after(() => delete (/** @type {any} */ (globalThis).document));
  const canvas = createOffscreenCanvas(30, 20);
  assert.deepEqual(canvas, { tag: 'canvas', width: 30, height: 20 });
  assert.equal(made.length, 1);
});

test('a default TileRaster makes no canvas under node instead of throwing', () => {
  const raster = new TileRaster();
  assert.equal(raster.createCanvas(8, 8), null);
});
