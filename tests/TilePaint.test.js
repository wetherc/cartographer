import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paintTile,
  eraseTile,
  isInBounds,
  normalizeRect,
  tilesInRect,
  linkTilesInRect,
} from '../src/map/TilePaint.js';
import { createMapNode, createTile, setTile, getTile } from '../src/map/TileGrid.js';

function node2x2() {
  return createMapNode('n', 'N', null, 2, 2);
}

test('isInBounds respects the node width/height', () => {
  const node = node2x2();
  assert.equal(isInBounds(node, '0,0'), true);
  assert.equal(isInBounds(node, '1,1'), true);
  assert.equal(isInBounds(node, '2,0'), false);
  assert.equal(isInBounds(node, '0,2'), false);
  assert.equal(isInBounds(node, 'poi'), false);
});

test('paintTile creates a new unrevealed tile with the given image', () => {
  const painted = paintTile(node2x2(), '0,0', 'grass.svg');
  const tile = getTile(painted, '0,0');
  assert.equal(tile.imageRef, 'grass.svg');
  assert.equal(tile.revealed, false);
});

test('paintTile over an existing tile keeps metadata, childNodeId, revealed', () => {
  let node = node2x2();
  node = setTile(
    node,
    createTile('1,1', 'old.svg', {
      revealed: true,
      childNodeId: 'region',
      metadata: { poiType: 'dungeon', discoverable: true, notes: 'crypt' },
    }),
  );
  const painted = paintTile(node, '1,1', 'new.svg');
  const tile = getTile(painted, '1,1');
  assert.equal(tile.imageRef, 'new.svg');
  assert.equal(tile.revealed, true);
  assert.equal(tile.childNodeId, 'region');
  assert.deepEqual(tile.metadata, { poiType: 'dungeon', discoverable: true, notes: 'crypt' });
});

test('paintTile creates overlayRef null by default', () => {
  const painted = paintTile(node2x2(), '0,0', 'grass.svg');
  assert.equal(getTile(painted, '0,0').overlayRef, null);
});

test('paintTile overlay layers on an existing tile, keeping its terrain', () => {
  let node = paintTile(node2x2(), '0,0', 'desert.svg');
  node = paintTile(node, '0,0', 'road-h.svg', true);
  const tile = getTile(node, '0,0');
  assert.equal(tile.imageRef, 'desert.svg');
  assert.equal(tile.overlayRef, 'road-h.svg');
});

test('re-terraining beneath an overlay keeps the overlay', () => {
  let node = paintTile(node2x2(), '0,0', 'desert.svg');
  node = paintTile(node, '0,0', 'road-h.svg', true);
  node = paintTile(node, '0,0', 'snow.svg');
  const tile = getTile(node, '0,0');
  assert.equal(tile.imageRef, 'snow.svg');
  assert.equal(tile.overlayRef, 'road-h.svg');
});

test('paintTile overlay on an empty cell becomes the base image', () => {
  const node = paintTile(node2x2(), '0,0', 'road-h.svg', true);
  const tile = getTile(node, '0,0');
  assert.equal(tile.imageRef, 'road-h.svg');
  assert.equal(tile.overlayRef, null);
});

test('paintTile out of bounds is a no-op', () => {
  const node = node2x2();
  assert.equal(paintTile(node, '5,5', 'grass.svg'), node);
});

test('eraseTile removes a tile and no-ops when absent', () => {
  let node = paintTile(node2x2(), '0,0', 'grass.svg');
  node = eraseTile(node, '0,0');
  assert.equal(getTile(node, '0,0'), undefined);
  assert.equal(eraseTile(node, '0,0'), node);
});

test('normalizeRect orders corners regardless of drag direction', () => {
  const expected = { minX: 1, minY: 0, maxX: 3, maxY: 2 };
  assert.deepEqual(normalizeRect({ x: 1, y: 0 }, { x: 3, y: 2 }), expected);
  assert.deepEqual(normalizeRect({ x: 3, y: 2 }, { x: 1, y: 0 }), expected);
});

test('tilesInRect returns only existing tiles inside the inclusive rect', () => {
  let node = createMapNode('n', 'N', null, 4, 4);
  node = setTile(node, createTile('1,1', 'grass.svg'));
  node = setTile(node, createTile('2,2', 'grass.svg'));
  node = setTile(node, createTile('3,3', 'grass.svg'));
  node = setTile(node, createTile('poi', 'town.svg'));
  const rect = { minX: 1, minY: 1, maxX: 2, maxY: 2 };
  assert.deepEqual(tilesInRect(node, rect).map((t) => t.id).sort(), ['1,1', '2,2']);
});

test('linkTilesInRect stamps childNodeId onto in-rect tiles only, creating none', () => {
  let node = createMapNode('n', 'N', null, 4, 4);
  node = setTile(node, createTile('0,0', 'grass.svg'));
  node = setTile(node, createTile('1,0', 'grass.svg'));
  node = setTile(node, createTile('3,3', 'grass.svg', { childNodeId: 'other' }));
  const linked = linkTilesInRect(node, { minX: 0, minY: 0, maxX: 1, maxY: 1 }, 'region');
  assert.equal(getTile(linked, '0,0').childNodeId, 'region');
  assert.equal(getTile(linked, '1,0').childNodeId, 'region');
  assert.equal(getTile(linked, '3,3').childNodeId, 'other');
  assert.equal(linked.tiles.length, 3); // empty cells in the rect stay empty
});

test('linkTilesInRect is a no-op node when the rect covers no tiles', () => {
  const node = node2x2();
  assert.equal(linkTilesInRect(node, { minX: 0, minY: 0, maxX: 1, maxY: 1 }, 'region'), node);
});
