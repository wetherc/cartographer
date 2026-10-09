import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_EDGE, encodeSizes, fitDimensions, pickFit } from '../src/ui/imageField.js';

test('an image already inside the cap keeps its dimensions', () => {
  assert.deepEqual(fitDimensions(800, 600, 1280), { width: 800, height: 600 });
  assert.deepEqual(fitDimensions(1280, 1280, 1280), { width: 1280, height: 1280 });
});

test('a fractional source size floors rather than growing', () => {
  assert.deepEqual(fitDimensions(800.9, 600.9, 1280), { width: 800, height: 600 });
});

test('an oversized image scales its longest edge to the cap, either orientation', () => {
  assert.deepEqual(fitDimensions(4000, 3000, 1280), { width: 1280, height: 960 });
  assert.deepEqual(fitDimensions(3000, 4000, 1280), { width: 960, height: 1280 });
  assert.deepEqual(fitDimensions(4000, 4000, 1280), { width: 1280, height: 1280 });
});

test('an extreme aspect ratio keeps a drawable short edge', () => {
  // 20000x3 scales to an edge of 1280 at a factor of 0.064, which rounds the
  // short side to 0 — a canvas of zero height encodes nothing at all.
  const fitted = fitDimensions(20000, 3, 1280);
  assert.equal(fitted.width, 1280);
  assert.equal(fitted.height, 1);
});

test('an unusable source size falls back to one pixel rather than zero', () => {
  for (const [width, height] of [
    [0, 100],
    [100, 0],
    [-5, 5],
    [NaN, 100],
    [100, Infinity],
  ]) {
    assert.deepEqual(fitDimensions(width, height, 1280), { width: 1, height: 1 });
  }
});

test('the sizes are the full edge then half of it, each fitted to the source', () => {
  assert.deepEqual(encodeSizes(4000, 3000), [
    fitDimensions(4000, 3000, MAX_EDGE),
    fitDimensions(4000, 3000, MAX_EDGE / 2),
  ]);
  // A one-pixel edge cannot halve below one.
  assert.deepEqual(encodeSizes(10, 10, 1), [
    { width: 1, height: 1 },
    { width: 1, height: 1 },
  ]);
});

test('pickFit returns the shortest candidate that fits under the limit', () => {
  assert.equal(pickFit(['aaaa', 'bb'], 10), 'bb');
  assert.equal(pickFit(['aaaa', 'bb'], 3), 'bb');
  assert.equal(pickFit(['aaaa', 'bb'], 1), null);
});

test('pickFit skips a format that was not tried and handles no candidates', () => {
  assert.equal(pickFit([null, 'ccc'], 3), 'ccc');
  assert.equal(pickFit([null, null], 3), null);
  assert.equal(pickFit([], 3), null);
});
