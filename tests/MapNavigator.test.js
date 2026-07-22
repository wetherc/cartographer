import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { MapNavigator } from '../src/map/MapNavigator.js';

function buildGrid() {
  const grid = new TileGrid();
  grid.addNode(createMapNode('world', 'World', null, 2, 2));
  grid.addNode(createMapNode('region', 'Region', 'world', 2, 2));
  grid.addNode(createMapNode('subregion', 'Subregion', 'region', 2, 2));

  let world = grid.getNode('world');
  world = setTile(world, createTile('0,0', 'grass.svg', { childNodeId: 'region' }));
  world = setTile(world, createTile('1,0', 'grass.svg'));
  grid.updateNode(world);

  let region = grid.getNode('region');
  region = setTile(region, createTile('0,0', 'grass.svg', { childNodeId: 'subregion' }));
  grid.updateNode(region);

  return grid;
}

test('MapNavigator starts at the given root node', () => {
  const nav = new MapNavigator(buildGrid(), 'world');
  assert.equal(nav.getCurrentNode().id, 'world');
});

test('zoomIn moves to the tile\'s child node', () => {
  const nav = new MapNavigator(buildGrid(), 'world');
  const zoomed = nav.zoomIn('0,0');
  assert.equal(zoomed, true);
  assert.equal(nav.getCurrentNode().id, 'region');
});

test('zoomIn is a no-op for a tile with no childNodeId', () => {
  const nav = new MapNavigator(buildGrid(), 'world');
  const zoomed = nav.zoomIn('1,0');
  assert.equal(zoomed, false);
  assert.equal(nav.getCurrentNode().id, 'world');
});

test('zoomIn is a no-op for an unknown tile id', () => {
  const nav = new MapNavigator(buildGrid(), 'world');
  assert.equal(nav.zoomIn('9,9'), false);
  assert.equal(nav.getCurrentNode().id, 'world');
});

test('zoomOut moves to the parent node', () => {
  const nav = new MapNavigator(buildGrid(), 'world');
  nav.zoomIn('0,0');
  assert.equal(nav.zoomOut(), true);
  assert.equal(nav.getCurrentNode().id, 'world');
});

test('zoomOut is a no-op at the root', () => {
  const nav = new MapNavigator(buildGrid(), 'world');
  assert.equal(nav.zoomOut(), false);
  assert.equal(nav.getCurrentNode().id, 'world');
});

test('getBreadcrumb reflects the current position after zooming', () => {
  const nav = new MapNavigator(buildGrid(), 'world');
  nav.zoomIn('0,0');
  nav.zoomIn('0,0');
  const crumbs = nav.getBreadcrumb().map((n) => n.id);
  assert.deepEqual(crumbs, ['world', 'region', 'subregion']);
});

test('goTo jumps directly to a node', () => {
  const nav = new MapNavigator(buildGrid(), 'world');
  nav.goTo('subregion');
  assert.equal(nav.getCurrentNode().id, 'subregion');
});

test('goTo throws for an unknown node id', () => {
  const nav = new MapNavigator(buildGrid(), 'world');
  assert.throws(() => nav.goTo('nope'), /unknown node/);
});
