import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeCursor,
  describeCursorEdit,
  describeNode,
  placeNoun,
} from '../src/map/MapDescription.js';
import {
  createMapNode,
  createTile,
  getTile,
  setTile,
  updateTileMetadata,
} from '../src/map/TileGrid.js';
import { eraseTile } from '../src/map/TilePaint.js';
import { linkTileTo, setTileRevealed } from '../src/map/FogOfWar.js';

function node() {
  let n = createMapNode('world', 'World', null, 4, 3);
  n = setTile(n, createTile('0,0', 'grass.svg', { revealed: true }));
  n = setTile(n, createTile('1,0', 'grass.svg')); // unrevealed
  n = setTile(
    n,
    createTile('2,1', 'tavern.svg', {
      revealed: true,
      metadata: { poiType: 'tavern', discoverable: true, notes: 'The Prancing Pony' },
    }),
  );
  return n;
}

test('describeNode reports name, size, and explored count in Play mode', () => {
  const text = describeNode(node(), null).status;
  assert.match(text, /World, a region, 4 by 3 tiles\./);
  assert.match(text, /2 of 12 tiles explored\./); // two revealed tiles (0,0 and 2,1)
});

test('describeNode counts and places a tile with an odd grid id, and skips a loose one', () => {
  let n = createMapNode('world', 'World', null, 4, 3);
  n = setTile(n, createTile('01,2', 'well.svg', { metadata: { poiType: 'landmark' } }));
  n = setTile(n, createTile('loose', 'grass.svg'));
  const { status, points } = describeNode(n, null, { revealAll: true });
  assert.match(status, /1 of 12 tiles placed\./);
  assert.deepEqual(points, ['Landmark at column 2, row 3']);
});

test('describeNode names the kind and environment when set', () => {
  const n = { ...node(), kind: /** @type {const} */ ('interior'), environ: 'temple' };
  assert.match(describeNode(n, null).status, /World, an interior \(temple\), 4 by 3 tiles\./);
});

test('describeNode reports the party position when the party is in the node', () => {
  const text = describeNode(node(), { nodeId: 'world', tileId: '0,0' }).status;
  assert.match(text, /Party at column 1, row 1\./);
});

test('describeNode names the start point of a party with no characters', () => {
  const text = describeNode(
    node(),
    { nodeId: 'world', tileId: '0,0' },
    { partyEmpty: true },
  ).status;
  assert.match(text, /Party start at column 1, row 1\. The party has no characters yet\./);
  assert.doesNotMatch(text, /Party at/);
});

test('describeNode omits party position when the party is elsewhere', () => {
  const text = describeNode(node(), { nodeId: 'region', tileId: '0,0' }).status;
  assert.doesNotMatch(text, /Party at/);
});

/** The node above with the tavern already found by the party. */
function found() {
  return updateTileMetadata(node(), '2,1', { discovered: true });
}

test('describeNode hides an undiscovered POI in Play mode', () => {
  const { status, points } = describeNode(node(), null);
  assert.doesNotMatch(status, /of interest/);
  assert.deepEqual(points, []);
});

test('describeNode lists a discovered POI and reads notes only for the GM', () => {
  assert.deepEqual(describeNode(found(), null).points, ['Tavern at column 3, row 2']);
  assert.deepEqual(describeNode(found(), null, { showNotes: true }).points, [
    'Tavern at column 3, row 2: The Prancing Pony',
  ]);
});

test('describeNode counts the points in the status line and keeps their text out of it', () => {
  const { status } = describeNode(found(), null, { showNotes: true });
  assert.match(status, /1 point of interest, listed after the map./);
  assert.doesNotMatch(status, /Tavern|Prancing/);
  const two = setTile(
    found(),
    createTile('0,2', 'dungeon.svg', {
      metadata: { poiType: 'dungeon', discoverable: false, notes: '' },
    }),
  );
  assert.match(
    describeNode(two, null, { revealAll: true }).status,
    /2 points of interest, listed after the map./,
  );
});

test('describeNode leaves out a POI outside detection range', () => {
  const { status, points } = describeNode(found(), null, { markerVisible: (id) => id !== '2,1' });
  assert.doesNotMatch(status, /of interest/);
  assert.deepEqual(points, []);
});

test('describeNode ignores tiles whose ids are not grid coordinates', () => {
  let n = node();
  n = setTile(
    n,
    createTile('legend', 'dungeon.svg', {
      revealed: true,
      metadata: { poiType: 'dungeon', discoverable: false, notes: '' },
    }),
  );
  const { status, points } = describeNode(n, null);
  assert.match(
    status,
    /2 of 12 tiles explored\./,
    'a non-grid tile is not a placed or revealed cell',
  );
  assert.deepEqual(points, [], 'and it has no position to narrate');
});

test('describeNode reads fog, discovery, and notes from each node that shares an art stamp', () => {
  const hidden = node();
  const gm = { showNotes: true };
  assert.deepEqual(describeNode(hidden, null, gm).points, []);
  // Each edit below keeps the art stamp, so the point list comes from the
  // cached summary, and each node still reads its own tile fields.
  const discovered = updateTileMetadata(hidden, '2,1', { discovered: true });
  const noted = updateTileMetadata(discovered, '2,1', { notes: 'Closed for repairs' });
  const stepped = setTileRevealed(noted, '1,0', true);
  const fogged = setTileRevealed(stepped, '2,1', false);
  assert.deepEqual(describeNode(noted, null, gm).points, [
    'Tavern at column 3, row 2: Closed for repairs',
  ]);
  assert.match(describeNode(stepped, null).status, /3 of 12 tiles explored\./);
  assert.deepEqual(describeNode(fogged, null).points, [], 'a fogged point is not named');
  assert.match(describeNode(fogged, null).status, /2 of 12 tiles explored\./);
  // The older nodes, as undo hands them back.
  assert.deepEqual(describeNode(discovered, null, gm).points, [
    'Tavern at column 3, row 2: The Prancing Pony',
  ]);
  assert.match(describeNode(noted, null).status, /2 of 12 tiles explored\./);
  assert.deepEqual(describeNode(hidden, null, gm).points, []);
});

test('describeNode in Build mode counts placed tiles and includes unrevealed POIs', () => {
  let n = node();
  n = setTile(
    n,
    createTile('3,2', 'dungeon.svg', {
      metadata: { poiType: 'dungeon', discoverable: false, notes: '' },
    }),
  );
  const { status, points } = describeNode(n, null, { revealAll: true });
  assert.match(status, /4 of 12 tiles placed\./);
  assert.ok(points.includes('Dungeon at column 4, row 3'));
});

test('describeCursor names the cell and what stands there', () => {
  const labelFor = (ref) => (ref === 'tavern.svg' ? 'Tavern' : undefined);
  assert.equal(
    describeCursor(node(), '2,1', { revealAll: true, labelFor }),
    'Cursor at column 3, row 2: Tavern, Tavern.',
  );
  assert.equal(
    describeCursor(node(), '1,0', { revealAll: true, labelFor }),
    'Cursor at column 2, row 1: grass.svg.',
    'an art reference with no label reads as the reference itself',
  );
});

test('describeCursor reports an empty cell and hides an unexplored one in Play mode', () => {
  assert.equal(describeCursor(node(), '3,2'), 'Cursor at column 4, row 3: empty.');
  assert.equal(describeCursor(node(), '1,0'), 'Cursor at column 2, row 1: unexplored.');
  assert.equal(
    describeCursor(node(), '0,0', { labelFor: () => 'Grass' }),
    'Cursor at column 1, row 1: Grass.',
    'Play mode names no fog state for an explored cell, the only state it shows',
  );
});

test('describeCursor names a POI in Play mode only once it is found and in range', () => {
  const labelFor = () => 'Tavern art';
  assert.equal(
    describeCursor(node(), '2,1', { labelFor }),
    'Cursor at column 3, row 2: Tavern art.',
    'an undiscovered POI reads as its art alone',
  );
  assert.equal(
    describeCursor(found(), '2,1', { labelFor }),
    'Cursor at column 3, row 2: Tavern art, Tavern.',
  );
  assert.equal(
    describeCursor(found(), '2,1', { labelFor, markerVisible: () => false }),
    'Cursor at column 3, row 2: Tavern art.',
  );
});

test('placeNoun names a place by the marker that links to it', () => {
  const world = createMapNode('world', 'The Marches', null, 4, 4);
  const town = createMapNode('kelmoor', 'Kelmoor', 'vale', 14, 14, { environ: 'grassland' });
  const link = (ref) => createTile('1,1', ref, { childNodeId: 'kelmoor' });
  assert.equal(placeNoun(world, null), 'the world map');
  assert.equal(placeNoun(town, link('assets/tiles/village/village-1.svg')), 'a village');
  assert.equal(placeNoun(town, link('assets/tiles/inn/inn-2.svg')), 'an inn');
  assert.equal(placeNoun(town, link('assets/tiles/grass/grass-1.svg')), null);
  assert.equal(placeNoun(town, link('data:image/png;base64,AAAA')), null);
  assert.equal(placeNoun(town, undefined), null);
});

test('a named place drops the environ from the description', () => {
  const town = createMapNode('kelmoor', 'Kelmoor', 'vale', 14, 14, { environ: 'grassland' });
  const named = describeNode(town, null, { placeNoun: 'a village' }).status;
  assert.match(named, /^Kelmoor, a village, 14 by 14 tiles\./);
  assert.match(describeNode(town, null).status, /^Kelmoor, a region \(grassland\), /);
});

test('linkTileTo finds the tile that opens a child node', () => {
  let vale = createMapNode('vale', 'Vale', 'world', 4, 4);
  vale = setTile(vale, createTile('2,1', 'assets/tiles/port/port-1.svg', { childNodeId: 'k' }));
  assert.equal(linkTileTo(vale, 'k')?.id, '2,1');
  assert.equal(linkTileTo(vale, 'nobody'), undefined);
});

test('describeCursor names no fog state in Build mode', () => {
  // Regression: Build mode draws no fog, but the line said "unexplored".
  assert.doesNotMatch(describeCursor(node(), '1,0', { revealAll: true }), /explored/);
});

test('describeCursorEdit names the art a keyboard stroke painted', () => {
  const labelFor = (ref) => ({ 'road.svg': 'Road', 'tree.svg': 'Tree' })[ref];
  const before = node();
  const painted = setTile(before, createTile('3,2', 'road.svg'));
  assert.equal(
    describeCursorEdit(painted, '3,2', null, { revealAll: true, labelFor }),
    'Painted Road at column 4, row 3.',
  );
  const repainted = setTile(before, createTile('0,0', 'road.svg'));
  assert.equal(
    describeCursorEdit(repainted, '0,0', getTile(before, '0,0') ?? null, { labelFor }),
    'Painted Road at column 1, row 1.',
  );
  const old = /** @type {any} */ (getTile(before, '0,0'));
  const overlaid = setTile(before, { ...old, overlayRef: 'tree.svg' });
  assert.equal(
    describeCursorEdit(overlaid, '0,0', old, { revealAll: true, labelFor }),
    'Painted Tree at column 1, row 1.',
  );
});

test('describeCursorEdit names an erase, and an unchanged cell as the cursor line', () => {
  const before = node();
  const tile = getTile(before, '0,0') ?? null;
  const erased = eraseTile(before, '0,0');
  assert.equal(describeCursorEdit(erased, '0,0', tile), 'Erased the tile at column 1, row 1.');
  assert.equal(
    describeCursorEdit(before, '3,2', null, { revealAll: true }),
    'Cursor at column 4, row 3: empty.',
    'an erase on an empty cell changes nothing',
  );
  assert.equal(
    describeCursorEdit(before, '0,0', tile, { revealAll: true }),
    'Cursor at column 1, row 1: grass.svg.',
    'an Inspect press reads as the cursor line',
  );
});
