import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTile, DEFAULT_TILE_METADATA } from '../src/map/TileGrid.js';
import { withTileDefaults } from '../src/map/NodeDefaults.js';
import { setTileFreezing } from '../src/map/TileFreeze.js';

test('a new tile shares the frozen default metadata', () => {
  const tile = createTile('0,0', 'g.svg');
  assert.equal(tile.metadata, DEFAULT_TILE_METADATA);
  assert.equal(createTile('1,0', 'g.svg').metadata, tile.metadata);
});

test('the default metadata rejects a write even with development freezing off', () => {
  const previous = setTileFreezing(false);
  try {
    const tile = createTile('0,0', 'g.svg');
    assert.throws(() => {
      /** @type {any} */ (tile.metadata).notes = 'x';
    }, TypeError);
    assert.equal(DEFAULT_TILE_METADATA.notes, '');
  } finally {
    setTileFreezing(previous);
  }
});

test('a loaded tile with default metadata gets the shared object', () => {
  for (const metadata of [
    undefined,
    null,
    {},
    { poiType: null, discoverable: false, discovered: false, notes: '' },
    { poiType: 7, discoverable: 'yes', notes: null },
  ]) {
    const tile = withTileDefaults(/** @type {any} */ ({ id: '0,0', imageRef: 'g.svg', metadata }));
    assert.equal(tile.metadata, DEFAULT_TILE_METADATA, JSON.stringify(metadata));
  }
});

test('a loaded tile with any non-default metadata field gets its own record', () => {
  for (const metadata of [
    { poiType: 'inn' },
    { discoverable: true },
    { discovered: true },
    { notes: 'A cold draft.' },
  ]) {
    const tile = withTileDefaults(/** @type {any} */ ({ id: '0,0', imageRef: 'g.svg', metadata }));
    assert.notEqual(tile.metadata, DEFAULT_TILE_METADATA);
    assert.deepEqual(tile.metadata, { ...DEFAULT_TILE_METADATA, ...metadata });
  }
});
