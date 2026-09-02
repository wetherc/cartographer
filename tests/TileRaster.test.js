import test from 'node:test';
import assert from 'node:assert/strict';
import { TileRaster, rasterSize, imageSrcForRef } from '../src/map/TileRaster.js';

/**
 * A stand-in for a decoded image. The class only reads `complete`,
 * `naturalWidth`, `src`, and `onload`.
 */
function fakeImage() {
  return { src: '', onload: null, complete: true, naturalWidth: 64 };
}

/**
 * A stand-in for an offscreen canvas that records every draw. `getContext`
 * returns a context whose `drawImage` appends to `draws`.
 */
function fakeCanvasFactory() {
  const made = [];
  const factory = (width, height) => {
    const canvas = {
      width,
      height,
      draws: [],
      getContext: () => ({
        drawImage: (...args) => canvas.draws.push(args),
      }),
    };
    made.push(canvas);
    return canvas;
  };
  return { factory, made };
}

/** A TileRaster wired to fakes. */
function harness({ enabled = true } = {}) {
  const canvases = fakeCanvasFactory();
  const images = [];
  const raster = new TileRaster({
    enabled,
    createImage: () => {
      const img = fakeImage();
      images.push(img);
      return img;
    },
    createCanvas: canvases.factory,
  });
  return { raster, canvases, images };
}

test('imageSrcForRef roots built-in paths and leaves data URLs alone', () => {
  assert.equal(imageSrcForRef('assets/tiles/grass/grass-1.svg'), '/assets/tiles/grass/grass-1.svg');
  const dataUrl = 'data:image/png;base64,AAAA';
  assert.equal(imageSrcForRef(dataUrl), dataUrl);
});

test('rasterSize takes the destination size, rounded up to a whole pixel', () => {
  assert.equal(rasterSize(48), 48);
  assert.equal(rasterSize(17.76), 18);
  assert.equal(rasterSize(192), 192);
  assert.equal(rasterSize(256), 256);
});

test('rasterSize keeps a tiny destination at one pixel', () => {
  assert.equal(rasterSize(0.4), 1);
  assert.equal(rasterSize(0), 1);
});

test('rasterSize returns 0 past the ceiling, which means do not cache', () => {
  assert.equal(rasterSize(257), 0);
  assert.equal(rasterSize(1024), 0);
});

test('a raster built with no options caches and brings its own factories', () => {
  const raster = new TileRaster();
  assert.equal(raster.enabled, true);
  assert.equal(raster.onLoad, undefined);
  // The browser factories are installed but not called, so construction stays
  // safe outside a document.
  assert.equal(typeof raster.createImage, 'function');
  assert.equal(typeof raster.createCanvas, 'function');
});

test('image decodes a ref once and reuses it', () => {
  const { raster, images } = harness();
  const first = raster.image('a.svg');
  const second = raster.image('a.svg');
  assert.equal(first, second);
  assert.equal(images.length, 1);
  assert.equal(first.src, '/a.svg');
});

test('image reports a load, so the canvas can draw again once bytes arrive', () => {
  let loads = 0;
  const raster = new TileRaster({
    onLoad: () => {
      loads += 1;
    },
    createImage: fakeImage,
  });
  raster.image('a.svg').onload();
  assert.equal(loads, 1);
});

test('source rasterizes once and returns the cached canvas after that', () => {
  const { raster, canvases } = harness();
  const first = raster.source('a.svg', 48, 48);
  const second = raster.source('a.svg', 48, 48);
  assert.equal(first, canvases.made[0]);
  assert.equal(second, first);
  assert.equal(canvases.made.length, 1);
  assert.equal(first.width, 48);
  assert.deepEqual(first.draws, [[raster.image('a.svg'), 0, 0, 48, 48]]);
});

test('source shares one raster across destinations that round to the same pixel', () => {
  const { raster, canvases } = harness();
  raster.source('a.svg', 17.2, 17.2);
  raster.source('a.svg', 17.9, 17.9);
  assert.equal(canvases.made.length, 1);
  assert.equal(canvases.made[0].width, 18);
});

test('source keeps a separate raster per size and per aspect', () => {
  const { raster, canvases } = harness();
  raster.source('a.svg', 48, 48);
  raster.source('a.svg', 130, 130);
  raster.source('a.svg', 96, 48);
  assert.equal(canvases.made.length, 3);
  assert.deepEqual(
    canvases.made.map((c) => [c.width, c.height]),
    [
      [48, 48],
      [130, 130],
      [96, 48],
    ],
  );
});

// The cache keys by ref once and then by size, so a lookup never builds a
// key string containing the ref. A GM-supplied ref is a data: URL that runs
// to hundreds of kilobytes, and a per-draw key that long is what this
// layout avoids.
test('every size of one ref lives under one entry for that ref', () => {
  const { raster } = harness();
  raster.source('a.svg', 48, 48);
  raster.source('a.svg', 130, 130);
  raster.source('b.svg', 48, 48);
  assert.equal(raster.rasters.size, 2);
  assert.equal(raster.rasters.get('a.svg').size, 2);
  assert.equal(raster.rasters.get('b.svg').size, 1);
});

test('source returns null while the art has not decoded', () => {
  const canvases = fakeCanvasFactory();
  const raster = new TileRaster({
    createImage: () => ({ src: '', onload: null, complete: false, naturalWidth: 0 }),
    createCanvas: canvases.factory,
  });
  assert.equal(raster.source('a.svg', 48, 48), null);
  assert.equal(canvases.made.length, 0);
});

test('source returns null for art that decoded to nothing', () => {
  const raster = new TileRaster({
    createImage: () => ({ src: '', onload: null, complete: true, naturalWidth: 0 }),
  });
  assert.equal(raster.source('broken.svg', 48, 48), null);
});

test('source draws the vector art itself past the size ceiling', () => {
  const { raster, canvases } = harness();
  const source = raster.source('a.svg', 800, 800);
  assert.equal(source, raster.image('a.svg'));
  assert.equal(canvases.made.length, 0);
});

test('source draws the vector art itself when rasterizing is off', () => {
  const { raster, canvases } = harness({ enabled: false });
  assert.equal(raster.source('a.svg', 48, 48), raster.image('a.svg'));
  assert.equal(canvases.made.length, 0);
});

test('source falls back to the vector art when no context is available', () => {
  const raster = new TileRaster({
    createImage: fakeImage,
    createCanvas: () => null,
  });
  const source = raster.source('a.svg', 48, 48);
  assert.equal(source, raster.image('a.svg'));
  assert.equal(raster.rasters.size, 0);
});

test('the cache drops itself once it passes the byte ceiling', () => {
  const { raster } = harness();
  // Each 256x256 entry is 256 KB, so 128 of them reach the 32 MB ceiling.
  for (let i = 0; i < 128; i++) raster.source(`t${i}.svg`, 256, 256);
  assert.equal(raster.rasters.size, 128);
  assert.equal(raster.bytes, 128 * 256 * 256 * 4);
  raster.source('one-more.svg', 256, 256);
  assert.equal(raster.rasters.size, 1);
  assert.equal(raster.bytes, 256 * 256 * 4);
});

test('clearRasters keeps the decoded images, which cost a network round trip', () => {
  const { raster } = harness();
  const img = raster.image('a.svg');
  raster.source('a.svg', 48, 48);
  raster.clearRasters();
  assert.equal(raster.rasters.size, 0);
  assert.equal(raster.image('a.svg'), img);
});

test('seedImages copies only complete images, and never overwrites its own', () => {
  const { raster, images } = harness();
  raster.image('own.svg');
  const own = images[0];
  const seed = new Map([
    ['ready.svg', { ...fakeImage(), src: '/ready.svg' }],
    ['loading.svg', { ...fakeImage(), complete: false }],
    ['broken.svg', { ...fakeImage(), naturalWidth: 0 }],
    ['own.svg', { ...fakeImage(), src: '/other.svg' }],
  ]);
  assert.equal(raster.seedImages(/** @type {any} */ (seed)), 1);
  assert.equal(raster.images.get('ready.svg'), seed.get('ready.svg'));
  assert.equal(raster.images.has('loading.svg'), false);
  assert.equal(raster.images.has('broken.svg'), false);
  assert.equal(raster.images.get('own.svg'), own);
  assert.equal(raster.seedImages(undefined), 0);
});

test('imageSrcForRef gives no src for a ref the app refuses to load', () => {
  assert.equal(imageSrcForRef('//evil.example/pixel.png'), '');
  assert.equal(imageSrcForRef('data:text/html,x'), '');
  assert.equal(imageSrcForRef(''), '');
});
