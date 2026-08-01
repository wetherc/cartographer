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
  withNodeDefaults,
  overlayList,
  tilesById,
  TileGrid,
} from '../src/map/TileGrid.js';

test('tilesById indexes a tile array, holding the tiles themselves', () => {
  const tiles = [createTile('0,0', 'grass.png'), createTile('1,0', 'water.png')];
  const byId = tilesById(tiles);
  assert.equal(byId.size, 2);
  // The generators stamp through this index, so it has to hand back the array's
  // own tiles rather than copies.
  assert.equal(byId.get('1,0'), tiles[1]);
  assert.equal(byId.get('9,9'), undefined);
  assert.equal(tilesById([]).size, 0);
});

test('createTile has default unrevealed metadata', () => {
  const tile = createTile('t1', 'grass.png');
  assert.equal(tile.revealed, false);
  assert.equal(tile.metadata.poiType, null);
  assert.equal(tile.metadata.discoverable, false);
  assert.equal(tile.metadata.discovered, false);
  assert.equal(tile.childNodeId, null);
});

test('withNodeDefaults backfills discovered on tiles from older saves', () => {
  const legacy = {
    id: 'n',
    name: 'Old',
    parentId: null,
    width: 1,
    height: 1,
    kind: 'region',
    environ: null,
    tiles: [
      {
        id: '0,0',
        imageRef: 'g.svg',
        overlayRef: null,
        revealed: true,
        childNodeId: null,
        metadata: { poiType: 'dungeon', discoverable: true, notes: '' },
      },
    ],
  };
  const node = withNodeDefaults(/** @type {any} */ (legacy));
  assert.equal(node.tiles[0].metadata.discovered, false);
  assert.equal(node.tiles[0].metadata.poiType, 'dungeon');
});

test('withNodeDefaults survives a node whose tiles are missing or malformed', () => {
  const node = withNodeDefaults(/** @type {any} */ ({ id: 'n' }));
  assert.deepEqual(node.tiles, [], 'a node with no tile array loads empty');
  assert.equal(node.name, 'n', 'a nameless node falls back to its id');
  assert.equal(node.parentId, null);
  assert.equal(node.width, 0);
  assert.equal(node.kind, 'region');

  const messy = withNodeDefaults(
    /** @type {any} */ ({
      id: 'n',
      width: '4',
      height: 3.7,
      tiles: [null, 'grass', { imageRef: 'g.svg' }, { id: '0,0' }],
    }),
  );
  assert.equal(messy.width, 0, 'a non-numeric width reads as zero, never NaN');
  assert.equal(messy.height, 3, 'a fractional height floors to whole tiles');
  assert.deepEqual(
    messy.tiles.map((t) => t.id),
    ['0,0'],
    'tiles that are not records, or carry no id, are dropped',
  );
  assert.deepEqual(messy.tiles[0], {
    id: '0,0',
    imageRef: '',
    overlayRef: null,
    metadata: { poiType: null, discoverable: false, discovered: false, notes: '' },
    revealed: false,
    childNodeId: null,
  });
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
  assert.deepEqual(
    shrunk.tiles.map((t) => t.id),
    ['0,0'],
  );
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

test('getParent resolves one level up, and gives null where there is none', () => {
  const grid = new TileGrid();
  const world = grid.addNode(createMapNode('world', 'World', null, 1, 1));
  const region = grid.addNode(createMapNode('region', 'Region', 'world', 1, 1));
  const orphan = grid.addNode(createMapNode('orphan', 'Orphan', 'ghost', 1, 1));

  assert.equal(grid.getParent(region), world);
  assert.equal(grid.getParent(world), null);
  // A parentId naming a node the grid does not hold reads as no parent, not
  // as undefined.
  assert.equal(grid.getParent(orphan), null);
});

test('getBreadcrumb stops at a node whose parentId points at a missing node', () => {
  const grid = new TileGrid();
  // 'region' claims a parent that was never added — the walk stops there.
  grid.addNode(createMapNode('region', 'Region', 'ghost', 1, 1));
  assert.deepEqual(
    grid.getBreadcrumb('region').map((n) => n.id),
    ['region'],
  );
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

test('overlayList normalizes none, one, and stacked overlays to a draw-ordered list', () => {
  assert.deepEqual(overlayList(createTile('0,0', 'g.svg')), []);
  assert.deepEqual(overlayList(createTile('0,0', 'g.svg', { overlayRef: 'road.svg' })), [
    'road.svg',
  ]);
  assert.deepEqual(
    overlayList(createTile('0,0', 'g.svg', { overlayRef: ['coast.svg', 'river.svg'] })),
    ['coast.svg', 'river.svg'],
  );
});
