import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paintTile,
  eraseTile,
  erasePath,
  isInBounds,
  normalizeRect,
  tilesInRect,
  linkTilesInRect,
  stampRegionLink,
  ensureChildLink,
  spanBlocks,
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

test('paintTile overlay on an empty cell keeps an empty base, road as overlay', () => {
  const node = paintTile(node2x2(), '0,0', 'road-h.svg', true);
  const tile = getTile(node, '0,0');
  assert.equal(tile.imageRef, '');
  assert.equal(tile.overlayRef, 'road-h.svg');
});

test('painting terrain under an overlay-only tile fills the base, keeps the path', () => {
  let node = paintTile(node2x2(), '0,0', 'road-h.svg', true);
  node = paintTile(node, '0,0', 'sand.svg');
  const tile = getTile(node, '0,0');
  assert.equal(tile.imageRef, 'sand.svg');
  assert.equal(tile.overlayRef, 'road-h.svg');
});

test('paintTile overlay is a no-op over a POI-marker tile', () => {
  let node = node2x2();
  node = setTile(
    node,
    createTile('0,0', 'grass.svg', {
      metadata: { poiType: 'settlement', discoverable: true, notes: '' },
    }),
  );
  const after = paintTile(node, '0,0', 'road-h.svg', true);
  assert.equal(after, node);
  assert.equal(getTile(after, '0,0').overlayRef, null);
});

test('erasePath removes only the overlay, keeping terrain and no-ops when absent', () => {
  let node = paintTile(node2x2(), '0,0', 'grass.svg');
  node = paintTile(node, '0,0', 'road-h.svg', true);
  const noOverlay = erasePath(node, '0,0');
  assert.equal(getTile(noOverlay, '0,0').overlayRef, null);
  assert.equal(getTile(noOverlay, '0,0').imageRef, 'grass.svg');
  assert.equal(erasePath(noOverlay, '0,0'), noOverlay); // already no overlay
  const empty = node2x2();
  assert.equal(erasePath(empty, '0,0'), empty); // absent tile: identical no-op
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

test('stampRegionLink stamps a 2x2 block on an outdoor node', () => {
  let node = createMapNode('world', 'World', null, 4, 4);
  for (const id of ['1,1', '2,1', '1,2', '2,2']) node = setTile(node, createTile(id, 'grass.svg'));
  const linked = stampRegionLink(node, '1,1', 'vale');
  for (const id of ['1,1', '2,1', '1,2', '2,2']) {
    assert.equal(getTile(linked, id).childNodeId, 'vale', id);
  }
});

test('stampRegionLink shifts the block up/left at the far edges', () => {
  let node = createMapNode('world', 'World', null, 3, 3);
  for (const id of ['1,1', '2,1', '1,2', '2,2']) node = setTile(node, createTile(id, 'grass.svg'));
  const linked = stampRegionLink(node, '2,2', 'vale');
  for (const id of ['1,1', '2,1', '1,2', '2,2']) {
    assert.equal(getTile(linked, id).childNodeId, 'vale', id);
  }
});

test('stampRegionLink skips walls, other links, and empty cells but always stamps the anchor', () => {
  let node = createMapNode('world', 'World', null, 4, 4);
  node = setTile(node, createTile('1,1', 'grass.svg'));
  node = setTile(node, createTile('2,1', 'grass.svg', { childNodeId: 'other' }));
  node = setTile(node, createTile('1,2', 'assets/tiles/interior/interior-wall-h.svg'));
  const linked = stampRegionLink(node, '1,1', 'vale');
  assert.equal(getTile(linked, '1,1').childNodeId, 'vale');
  assert.equal(getTile(linked, '2,1').childNodeId, 'other', 'neighboring link preserved');
  assert.equal(getTile(linked, '1,2').childNodeId, null, 'wall not linked');
  assert.equal(getTile(linked, '2,2'), undefined, 'no tile created on the empty cell');
});

test('stampRegionLink links a single tile on interiors', () => {
  let node = createMapNode('inn', 'Inn', null, 4, 4, { kind: 'interior' });
  node = setTile(node, createTile('1,1', 'floor.svg'));
  node = setTile(node, createTile('2,1', 'floor.svg'));
  const linked = stampRegionLink(node, '1,1', 'cellar');
  assert.equal(getTile(linked, '1,1').childNodeId, 'cellar');
  assert.equal(getTile(linked, '2,1').childNodeId, null);
});

test('stampRegionLink with null clears the whole contiguous block', () => {
  let node = createMapNode('world', 'World', null, 4, 4);
  for (const id of ['1,1', '2,1', '1,2', '2,2']) node = setTile(node, createTile(id, 'grass.svg'));
  node = stampRegionLink(node, '1,1', 'vale');
  const cleared = stampRegionLink(node, '2,2', null);
  for (const id of ['1,1', '2,1', '1,2', '2,2']) {
    assert.equal(getTile(cleared, id).childNodeId, null, id);
  }
});

test('ensureChildLink widens its outdoor link to the 2x2 block', () => {
  let node = createMapNode('world', 'World', null, 5, 5);
  for (const id of ['2,2', '3,2', '2,3', '3,3']) node = setTile(node, createTile(id, 'grass.svg'));
  const result = ensureChildLink(node, 'crypt', { markerRef: 'dungeon.svg', createRef: 'grass.svg' });
  assert.equal(result.tileId, '2,2');
  for (const id of ['2,2', '3,2', '2,3', '3,3']) {
    assert.equal(getTile(result.node, id).childNodeId, 'crypt', id);
  }
  assert.equal(getTile(result.node, '3,3').imageRef, 'grass.svg', 'marker art only on the anchor');
});

test('ensureChildLink is a no-op when a link to the child already exists', () => {
  let node = createMapNode('world', 'World', null, 4, 4);
  node = setTile(node, createTile('1,1', 'grass.svg', { childNodeId: 'crypt' }));
  const result = ensureChildLink(node, 'crypt', { createRef: 'grass.svg' });
  assert.equal(result.tileId, null);
  assert.equal(result.node, node);
});

test('ensureChildLink stamps the plain tile nearest the centre with marker art and the link', () => {
  let node = createMapNode('world', 'World', null, 5, 5);
  node = setTile(node, createTile('0,0', 'grass.svg'));
  node = setTile(node, createTile('2,2', 'grass.svg'));
  node = setTile(node, createTile('4,4', 'grass.svg'));
  const result = ensureChildLink(node, 'crypt', {
    markerRef: 'dungeon.svg',
    createRef: 'grass.svg',
    poiType: 'dungeon',
  });
  assert.equal(result.tileId, '2,2', 'nearest to centre wins');
  const tile = getTile(result.node, '2,2');
  assert.equal(tile.childNodeId, 'crypt');
  assert.equal(tile.imageRef, 'dungeon.svg');
  assert.equal(tile.metadata.poiType, 'dungeon');
});

test('ensureChildLink skips walls, existing links, and POI tiles', () => {
  let node = createMapNode('world', 'World', null, 3, 3);
  node = setTile(node, createTile('1,1', 'assets/tiles/interior/interior-wall-h.svg'));
  node = setTile(node, createTile('1,0', 'grass.svg', { childNodeId: 'other' }));
  node = setTile(node, createTile('0,1', 'tavern.svg', {
    metadata: { poiType: 'settlement', discoverable: false, discovered: false, notes: '' },
  }));
  node = setTile(node, createTile('2,2', 'grass.svg'));
  const result = ensureChildLink(node, 'crypt', { markerRef: 'dungeon.svg', createRef: 'grass.svg' });
  assert.equal(result.tileId, '2,2', 'only the plain tile is eligible');
});

test('ensureChildLink creates a tile on the empty cell nearest the centre when nothing is eligible', () => {
  const node = createMapNode('world', 'World', null, 3, 3);
  const result = ensureChildLink(node, 'crypt', { markerRef: 'dungeon.svg', createRef: 'grass.svg' });
  assert.equal(result.tileId, '1,1');
  const tile = getTile(result.node, '1,1');
  assert.equal(tile.childNodeId, 'crypt');
  assert.equal(tile.imageRef, 'dungeon.svg');
});

test('ensureChildLink without a marker keeps the terrain art and uses createRef only for new tiles', () => {
  let node = createMapNode('world', 'World', null, 3, 3);
  node = setTile(node, createTile('1,1', 'forest.svg'));
  const kept = ensureChildLink(node, 'vale', { markerRef: null, createRef: 'grass.svg' });
  assert.equal(getTile(kept.node, '1,1').imageRef, 'forest.svg', 'existing terrain art kept');

  const empty = createMapNode('world2', 'World2', null, 3, 3);
  const made = ensureChildLink(empty, 'vale', { markerRef: null, createRef: 'grass.svg' });
  assert.equal(getTile(made.node, made.tileId).imageRef, 'grass.svg', 'new tile falls back to createRef');
});

test('paintTile with span > 1 stamps the anchor with the span', () => {
  const node = createMapNode('n', 'N', null, 5, 5);
  const painted = paintTile(node, '1,1', 'academy.svg', false, 3);
  const anchor = getTile(painted, '1,1');
  assert.equal(anchor.imageRef, 'academy.svg');
  assert.equal(anchor.span, 3);
  assert.equal(painted.tiles.length, 1, 'covered neighbors get no tiles');
});

test('paintTile shifts a span block up/left so it stays in bounds', () => {
  const node = createMapNode('n', 'N', null, 5, 5);
  const painted = paintTile(node, '4,4', 'keep.svg', false, 2);
  assert.equal(getTile(painted, '4,4'), undefined);
  assert.equal(getTile(painted, '3,3').span, 2);
});

test('paintTile at 1x clears a previous span, and overlays ignore span', () => {
  let node = createMapNode('n', 'N', null, 5, 5);
  node = paintTile(node, '0,0', 'academy.svg', false, 3);
  node = paintTile(node, '0,0', 'grass.svg');
  assert.equal(getTile(node, '0,0').span, undefined);

  node = paintTile(node, '2,2', 'road-h.svg', true, 3);
  assert.equal(getTile(node, '2,2').overlayRef, 'road-h.svg');
  assert.equal(getTile(node, '2,2').span, undefined);
});

test('spanBlocks lists each scaled tile with its clamped rect and covered ids', () => {
  let node = createMapNode('n', 'N', null, 4, 4);
  node = paintTile(node, '0,0', 'academy.svg', false, 3);
  node = setTile(node, createTile('3,3', 'grass.svg'));
  const blocks = spanBlocks(node);
  assert.equal(blocks.length, 1);
  assert.deepEqual(
    { minX: blocks[0].minX, minY: blocks[0].minY, maxX: blocks[0].maxX, maxY: blocks[0].maxY },
    { minX: 0, minY: 0, maxX: 2, maxY: 2 },
  );
  assert.equal(blocks[0].tileIds.length, 9);
  assert.ok(blocks[0].tileIds.includes('2,2'));
});
