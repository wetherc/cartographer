import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTile,
  createMapNode,
  setTile,
  getTile,
  updateTileMetadata,
  resizeNode,
  tilesOutsideBounds,
  TileGrid,
} from '../src/map/TileGrid.js';

test('createTile has default unrevealed metadata', () => {
  const tile = createTile('t1', 'grass.png');
  assert.equal(tile.revealed, false);
  assert.equal(tile.metadata.poiType, null);
  assert.equal(tile.childNodeId, null);
});

test('setTile adds a new tile and replaces an existing one by id', () => {
  let node = createMapNode('n1', 'World', null, 2, 2);
  node = setTile(node, createTile('t1', 'grass.png'));
  assert.equal(node.tiles.length, 1);

  node = setTile(node, createTile('t1', 'forest.png'));
  assert.equal(node.tiles.length, 1);
  assert.equal(getTile(node, 't1').imageRef, 'forest.png');
});

test('updateTileMetadata merges metadata without touching other fields', () => {
  let node = createMapNode('n1', 'World', null, 1, 1);
  node = setTile(node, createTile('t1', 'grass.png'));
  node = updateTileMetadata(node, 't1', { poiType: 'settlement', notes: 'a village' });

  const tile = getTile(node, 't1');
  assert.equal(tile.metadata.poiType, 'settlement');
  assert.equal(tile.metadata.notes, 'a village');
  assert.equal(tile.metadata.discoverable, false);
});

test('tilesOutsideBounds finds coordinate tiles past the bounds, ignoring non-coordinate ids', () => {
  let node = createMapNode('n', 'N', null, 4, 4);
  node = setTile(node, createTile('1,1', 'grass.png'));
  node = setTile(node, createTile('3,0', 'grass.png'));
  node = setTile(node, createTile('0,3', 'grass.png'));
  node = setTile(node, createTile('poi', 'town.png'));
  const outside = tilesOutsideBounds(node, 2, 2).map((t) => t.id);
  assert.deepEqual(outside.sort(), ['0,3', '3,0']);
});

test('resizeNode grow keeps every tile', () => {
  let node = createMapNode('n', 'N', null, 2, 2);
  node = setTile(node, createTile('1,1', 'grass.png'));
  const grown = resizeNode(node, 5, 6);
  assert.equal(grown.width, 5);
  assert.equal(grown.height, 6);
  assert.equal(grown.tiles.length, 1);
});

test('resizeNode shrink prunes tiles outside the new bounds', () => {
  let node = createMapNode('n', 'N', null, 4, 4);
  node = setTile(node, createTile('0,0', 'grass.png'));
  node = setTile(node, createTile('3,3', 'grass.png'));
  const shrunk = resizeNode(node, 2, 2);
  assert.deepEqual(shrunk.tiles.map((t) => t.id), ['0,0']);
});

test('resizeNode clamps dimensions to at least 1x1', () => {
  const shrunk = resizeNode(createMapNode('n', 'N', null, 4, 4), 0, -3);
  assert.equal(shrunk.width, 1);
  assert.equal(shrunk.height, 1);
});

test('TileGrid tracks parent/child hierarchy and breadcrumb', () => {
  const grid = new TileGrid();
  grid.addNode(createMapNode('world', 'World', null, 1, 1));
  grid.addNode(createMapNode('region', 'Region', 'world', 1, 1));
  grid.addNode(createMapNode('subregion', 'Subregion', 'region', 1, 1));

  const children = grid.getChildren('world');
  assert.equal(children.length, 1);
  assert.equal(children[0].id, 'region');

  const breadcrumb = grid.getBreadcrumb('subregion').map((n) => n.id);
  assert.deepEqual(breadcrumb, ['world', 'region', 'subregion']);
});

test('TileGrid resolves a tile zoom target through childNodeId', () => {
  const grid = new TileGrid();
  grid.addNode(createMapNode('world', 'World', null, 1, 1));
  const region = grid.addNode(createMapNode('region', 'Region', 'world', 1, 1));

  let world = grid.getNode('world');
  world = setTile(world, createTile('poi', 'town.png', { childNodeId: 'region' }));
  grid.updateNode(world);

  const target = grid.getZoomTarget(getTile(world, 'poi'));
  assert.equal(target.id, 'region');
  assert.equal(target, region);
});
