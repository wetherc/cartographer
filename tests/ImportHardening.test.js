import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deserialize } from '../src/storage/SaveManager.js';
import { overlayList } from '../src/map/TileGrid.js';
import { imageSrcForRef } from '../src/map/MapRenderer.js';
import { exceedsExportCap } from '../src/map/MapExport.js';

/**
 * Each test here feeds one malformed campaign file through `deserialize`,
 * then runs the code that used to throw on the loaded result. An import
 * stores what it reads and reloads it, so a field that survives the load
 * with a bad type becomes the stored save of an app that no longer starts.
 * @param {Record<string, any>} fields
 */
function loadFile(fields) {
  return deserialize(JSON.stringify({ version: 7, ...fields }));
}

/** @param {Record<string, any>} tile */
function loadTile(tile) {
  const state = loadFile({
    nodes: [{ id: 'n', name: 'Node', parentId: null, width: 2, height: 2, tiles: [tile] }],
  });
  return state.nodes[0].tiles[0];
}

test('a non-string overlay loads as no overlay, so every draw can read its refs', () => {
  for (const overlayRef of [[5], 7, { ref: 'x' }, true, [], [null, 3]]) {
    const tile = loadTile({ id: '0,0', imageRef: 'g.svg', overlayRef });
    assert.equal(tile.overlayRef, null, `${JSON.stringify(overlayRef)} reads as no overlay`);
    assert.deepEqual(overlayList(tile), []);
  }
});

test('an overlay stack keeps only its string members', () => {
  const tile = loadTile({
    id: '0,0',
    imageRef: 'g.svg',
    overlayRef: ['coast.svg', 4, 'river.svg'],
  });
  assert.deepEqual(tile.overlayRef, ['coast.svg', 'river.svg']);
  // The renderer maps every overlay through this, which reads a string.
  assert.deepEqual(overlayList(tile).map(imageSrcForRef), ['/coast.svg', '/river.svg']);
  assert.equal(
    loadTile({ id: '0,0', imageRef: 'g.svg', overlayRef: 'road.svg' }).overlayRef,
    'road.svg',
  );
});

test('a childNodeId that is not a string loads as no link', () => {
  assert.equal(loadTile({ id: '0,0', imageRef: 'g.svg', childNodeId: 12 }).childNodeId, null);
  assert.equal(loadTile({ id: '0,0', imageRef: 'g.svg', childNodeId: ['r'] }).childNodeId, null);
  assert.equal(loadTile({ id: '0,0', imageRef: 'g.svg', childNodeId: 'r' }).childNodeId, 'r');
});

test('a span survives only as a whole cell count above one', () => {
  assert.equal(loadTile({ id: '0,0', imageRef: 'g.svg', span: 3 }).span, 3);
  assert.equal(loadTile({ id: '0,0', imageRef: 'g.svg', span: 2.9 }).span, 2);
  for (const span of ['3', 1, 1.5, 0, -2, Infinity, null, { n: 2 }]) {
    const tile = loadTile({ id: '0,0', imageRef: 'g.svg', span });
    assert.equal('span' in tile, false, `${JSON.stringify(span)} is dropped`);
  }
});

test('metadata fields of the wrong type load as their defaults', () => {
  const tile = loadTile({
    id: '0,0',
    imageRef: 'g.svg',
    metadata: { poiType: 4, discoverable: 'yes', discovered: 1, notes: ['a'] },
  });
  assert.deepEqual(tile.metadata, {
    poiType: null,
    discoverable: false,
    discovered: false,
    notes: '',
  });
  const kept = loadTile({
    id: '0,0',
    imageRef: 'g.svg',
    metadata: { poiType: 'shop', discoverable: true, discovered: true, notes: 'Rope.' },
  });
  assert.deepEqual(kept.metadata, {
    poiType: 'shop',
    discoverable: true,
    discovered: true,
    notes: 'Rope.',
  });
});

test('an oversized node is refused by the PNG export instead of drawn', () => {
  const [small, huge] = loadFile({
    nodes: [
      { id: 'a', name: 'A', parentId: null, width: 1000, height: 1000, tiles: [] },
      { id: 'b', name: 'B', parentId: null, width: 1001, height: 1000, tiles: [] },
    ],
  }).nodes;
  assert.equal(exceedsExportCap(small), false, 'one million cells is the last allowed size');
  assert.equal(exceedsExportCap(huge), true);
});
