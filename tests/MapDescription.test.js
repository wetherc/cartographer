import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeNode } from '../src/map/MapDescription.js';
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
  assert.match(text, /World, 4 by 3 tiles\./);
  assert.match(text, /2 of 12 tiles explored\./); // two revealed tiles (0,0 and 2,1)
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
