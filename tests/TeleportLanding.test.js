import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teleportLanding } from '../src/view/TeleportLanding.js';
import { createTile } from '../src/map/TileGrid.js';

const FLOOR = 'assets/tiles/interior/interior-floor-1.svg';

/** An interior node of the given tiles. */
const node = (tiles) =>
  /** @type {any} */ ({
    id: 'n',
    name: 'N',
    parentId: null,
    width: 4,
    height: 4,
    kind: 'interior',
    environ: null,
    tiles,
  });

test('teleportLanding lands on the first revealed tile of a visited node', () => {
  const tiles = [
    createTile('0,0', FLOOR),
    createTile('3,1', FLOOR, { revealed: true }),
    createTile('3,2', FLOOR, { revealed: true }),
  ];
  assert.deepEqual(teleportLanding(node(tiles)), { tileId: '3,1', firstVisit: false });
});

test('teleportLanding aims at the grid center of an unvisited node', () => {
  const tiles = [createTile('0,0', FLOOR), createTile('2,2', FLOOR)];
  assert.deepEqual(teleportLanding(node(tiles)), { tileId: '2,2', firstVisit: true });
});

test('teleportLanding moves an empty center cell to the nearest real tile', () => {
  const tiles = [createTile('0,0', FLOOR), createTile('1,2', FLOOR)];
  assert.deepEqual(teleportLanding(node(tiles)), { tileId: '1,2', firstVisit: true });
});

test('teleportLanding keeps the grid center of a node with no tiles', () => {
  assert.deepEqual(teleportLanding(node([])), { tileId: '2,2', firstVisit: true });
});
