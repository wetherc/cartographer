import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCursor, describeNode } from '../src/map/MapDescription.js';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';

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
  const text = describeNode(node(), null);
  assert.match(text, /World, a region, 4 by 3 tiles\./);
  assert.match(text, /2 of 12 tiles explored\./); // two revealed tiles (0,0 and 2,1)
});

test('describeNode names the kind and environment when set', () => {
  const n = { ...node(), kind: /** @type {const} */ ('interior'), environ: 'temple' };
  assert.match(describeNode(n, null), /World, an interior \(temple\), 4 by 3 tiles\./);
});

test('describeNode reports the party position when the party is in the node', () => {
  const text = describeNode(node(), { nodeId: 'world', tileId: '0,0' });
  assert.match(text, /Party at column 1, row 1\./);
});

test('describeNode omits party position when the party is elsewhere', () => {
  const text = describeNode(node(), { nodeId: 'region', tileId: '0,0' });
  assert.doesNotMatch(text, /Party at/);
});

test('describeNode lists only revealed POIs with notes in Play mode', () => {
  const text = describeNode(node(), null);
  assert.match(text, /Points of interest: Tavern at column 3, row 2: The Prancing Pony\./);
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
  const text = describeNode(n, null);
  assert.match(
    text,
    /2 of 12 tiles explored\./,
    'a non-grid tile is not a placed or revealed cell',
  );
  assert.doesNotMatch(text, /Dungeon/, 'and it has no position to narrate');
});

test('describeNode in Build mode counts placed tiles and includes unrevealed POIs', () => {
  let n = node();
  n = setTile(
    n,
    createTile('3,2', 'dungeon.svg', {
      metadata: { poiType: 'dungeon', discoverable: false, notes: '' },
    }),
  );
  const text = describeNode(n, null, { revealAll: true });
  assert.match(text, /4 of 12 tiles placed\./);
  assert.match(text, /Dungeon at column 4, row 3/);
});

test('describeCursor names the cell and what stands there', () => {
  const labelFor = (ref) => (ref === 'tavern.svg' ? 'Tavern' : undefined);
  assert.equal(
    describeCursor(node(), '2,1', { revealAll: true, labelFor }),
    'Cursor at column 3, row 2: Tavern, Tavern, explored.',
  );
  assert.equal(
    describeCursor(node(), '1,0', { revealAll: true, labelFor }),
    'Cursor at column 2, row 1: grass.svg, unexplored.',
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
