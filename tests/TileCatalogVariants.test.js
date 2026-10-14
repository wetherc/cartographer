import { test } from 'node:test';
import assert from 'node:assert/strict';
import { variantIndexAt } from '../src/map/TileCatalog.js';
import { mulberry32 } from '../src/util/Rng.js';

/**
 * The position hash of `variantIndexAt` with the plain unsigned modulo, as
 * the reference for the int32 form.
 * @param {number} count
 * @param {number} x
 * @param {number} y
 */
function plainIndexAt(count, x, y) {
  let h = Math.imul(x | 0, 0x9e3779b1) ^ Math.imul((y | 0) + 0x632be5ab, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % count;
}

/** Grid cells near the origin, negative cells, and random 32-bit positions. */
function positions() {
  const rand = mulberry32(7);
  /** @type {[number, number][]} */
  const out = [];
  for (let x = -20; x < 60; x += 1) for (let y = -20; y < 60; y += 1) out.push([x, y]);
  for (let i = 0; i < 4000; i += 1) {
    out.push([(rand() * 2 ** 32) | 0, (rand() * 2 ** 32) | 0]);
  }
  return out;
}

test('variantIndexAt matches the plain unsigned modulo for small counts', () => {
  const cells = positions();
  for (let count = 1; count <= 64; count += 1) {
    for (const [x, y] of cells) {
      assert.equal(variantIndexAt(count, x, y), plainIndexAt(count, x, y), `${count} ${x},${y}`);
    }
  }
});

test('variantIndexAt matches the plain unsigned modulo up to and past 2^15', () => {
  const cells = positions();
  for (const count of [97, 1000, 4099, 32767, 32768, 32769, 65536, 1e6, 2 ** 31, 2 ** 32 - 1]) {
    for (const [x, y] of cells) {
      assert.equal(variantIndexAt(count, x, y), plainIndexAt(count, x, y), `${count} ${x},${y}`);
    }
  }
});

test('variantIndexAt returns int32 values below count', () => {
  for (const [x, y] of positions()) {
    const n = variantIndexAt(32768, x, y);
    assert.ok(n >= 0 && n < 32768 && (n | 0) === n);
  }
});
