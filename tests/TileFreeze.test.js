import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freezeTile,
  freezeTiles,
  isTileFreezingEnabled,
  setTileFreezing,
} from '../src/map/TileFreeze.js';
import {
  createMapNode,
  createTile,
  resizeNode,
  setTile,
  withNodeDefaults,
} from '../src/map/TileGrid.js';
import { withNodeTiles } from '../src/map/TileIndex.js';
import { eraseTile } from '../src/map/TilePaint.js';
import { hideAll, revealAround } from '../src/map/FogOfWar.js';
import { fillTiles } from './helpers/grid.js';

/**
 * Run a body with freezing forced on or off, restoring whatever the environment
 * detected. Every assertion below states which setting it depends on rather than
 * inheriting one, so the file passes under either.
 * @param {boolean} value
 * @param {() => void} body
 */
function withFreezing(value, body) {
  const previous = setTileFreezing(value);
  try {
    body();
  } finally {
    setTileFreezing(previous);
  }
}

test('freezing is on under the test runner, which is what enforces the invariant', () => {
  assert.equal(isTileFreezingEnabled(), true);
});

test('setTileFreezing reports the setting it replaced', () => {
  const previous = setTileFreezing(false);
  assert.equal(isTileFreezingEnabled(), false);
  assert.equal(setTileFreezing(previous), false);
  assert.equal(isTileFreezingEnabled(), previous);
});

test('freezeTile covers the tile, its metadata, and an overlay stack', () => {
  withFreezing(true, () => {
    const tile = createTile('0,0', 'grass.svg', { overlayRef: ['coast.svg', 'road.svg'] });
    assert.equal(freezeTile(tile), tile); // same object, not a copy
    assert.equal(Object.isFrozen(tile), true);
    assert.equal(Object.isFrozen(tile.metadata), true);
    assert.equal(Object.isFrozen(tile.overlayRef), true);
  });
});

test('freezeTile leaves a tile alone when freezing is off', () => {
  withFreezing(false, () => {
    const tile = freezeTile(createTile('0,0', 'grass.svg'));
    assert.equal(Object.isFrozen(tile), false);
    tile.imageRef = 'water.svg'; // writable, so a benchmark or build can opt out
    assert.equal(tile.imageRef, 'water.svg');
  });
});

test('freezeTiles freezes the list and every tile in it', () => {
  withFreezing(true, () => {
    const tiles = [createTile('0,0', 'a.svg'), createTile('1,0', 'b.svg')];
    assert.equal(freezeTiles(tiles), tiles);
    assert.equal(Object.isFrozen(tiles), true);
    assert.ok(tiles.every((t) => Object.isFrozen(t)));
  });
});

test('freezeTiles skips a list it has already frozen', () => {
  withFreezing(true, () => {
    const frozen = freezeTiles([createTile('0,0', 'a.svg')]);
    // A tile added behind the freeze cannot exist through the public helpers;
    // the short-circuit is what keeps a repeat call with an unchanged list off
    // the O(tiles) path.
    assert.equal(freezeTiles(frozen), frozen);
  });
});

test('a tile written into a node through setTile cannot be mutated in place', () => {
  withFreezing(true, () => {
    const node = setTile(createMapNode('n', 'N', null, 4, 4), createTile('1,1', 'grass.svg'));
    const tile = node.tiles[0];
    assert.throws(() => {
      tile.imageRef = 'water.svg';
    }, TypeError);
    assert.throws(() => {
      tile.metadata.notes = 'x';
    }, TypeError);
    assert.equal(tile.imageRef, 'grass.svg');
  });
});

test('a fog reveal freezes the tiles it flips', () => {
  withFreezing(true, () => {
    const node = fillTiles(createMapNode('n', 'N', null, 4, 4));
    const revealed = revealAround(node, '1,1', 1);
    const tile = revealed.tiles.find((t) => t.id === '1,1');
    assert.equal(tile?.revealed, true);
    assert.throws(() => {
      /** @type {any} */ (tile).revealed = false;
    }, TypeError);
  });
});

test('the per-cell helpers leave the tile list writable, which is the cost they avoid', () => {
  withFreezing(true, () => {
    // Freezing an array walks its elements, so paying it per painted cell would
    // restore the O(all tiles) cost the layout carry removes. Membership is
    // protected on the node-entry path instead.
    const node = setTile(createMapNode('n', 'N', null, 4, 4), createTile('1,1', 'grass.svg'));
    assert.equal(Object.isFrozen(node.tiles), false);
    assert.equal(Object.isFrozen(node.tiles[0]), true);
  });
});

test('every whole-list node producer freezes the list it hands over', () => {
  withFreezing(true, () => {
    const node = fillTiles(createMapNode('n', 'N', null, 4, 4));
    const cases = {
      withNodeTiles: withNodeTiles(node, node.tiles.slice()),
      withNodeDefaults: withNodeDefaults(node),
      resizeNode: resizeNode(node, 2, 2),
      eraseTile: eraseTile(node, '1,1'),
      hideAll: hideAll(node),
    };
    for (const [name, produced] of Object.entries(cases)) {
      assert.equal(Object.isFrozen(produced.tiles), true, `${name} froze its list`);
      assert.ok(
        produced.tiles.every((t) => Object.isFrozen(t)),
        `${name} froze its tiles`,
      );
    }
  });
});

test('a node built while freezing is off stays fully writable', () => {
  withFreezing(false, () => {
    const node = withNodeDefaults({
      ...createMapNode('n', 'N', null, 2, 2),
      tiles: [createTile('0,0', 'grass.svg')],
    });
    assert.equal(Object.isFrozen(node.tiles), false);
    assert.equal(Object.isFrozen(node.tiles[0]), false);
  });
});
