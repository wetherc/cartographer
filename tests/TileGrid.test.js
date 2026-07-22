import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTile,
  createMapNode,
  setTile,
  getTile,
  updateTileMetadata,
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
