import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spreadTiles } from '../src/map/SpawnSpread.js';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { interiorArt } from '../src/map/TileKinds.js';

const GRASS = 'assets/tiles/grass/grass-1.svg';

/**
 * A 3x3 node of grass with a wall at 1,0 and deep water at 0,1. The cell at
 * 2,2 is left empty when `hole` is set.
 */
function node(hole = false) {
  let n = createMapNode('n', 'N', null, 3, 3);
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++)
      if (!(hole && x === 2 && y === 2)) n = setTile(n, createTile(`${x},${y}`, GRASS));
  n = setTile(n, createTile('1,0', interiorArt('cave-wall')));
  return setTile(n, createTile('0,1', 'assets/tiles/deep-water/deep-water-1.svg'));
}

test('spreadTiles walks outward from the chosen tile in order of distance', () => {
  assert.deepEqual(spreadTiles(node(), '1,1', 5), ['1,1', '2,1', '1,2', '2,0', '2,2']);
});

test('spreadTiles skips walls, deep water, and empty cells', () => {
  const tiles = spreadTiles(node(true), '1,1', 9);
  for (const bad of ['1,0', '0,1', '2,2']) assert.ok(!tiles.includes(bad), bad);
});

test('spreadTiles does not pass through a wall or water to reach a tile', () => {
  // From 0,0 the only neighbours are the wall and the water, so every copy
  // stays on the chosen tile.
  assert.deepEqual(spreadTiles(node(), '0,0', 3), ['0,0', '0,0', '0,0']);
});

test('spreadTiles puts the rest on the chosen tile when the open area runs out', () => {
  const tiles = spreadTiles(node(), '1,1', 12);
  assert.equal(tiles.length, 12);
  assert.equal(new Set(tiles).size, 6, 'the open tiles reachable from 1,1');
  assert.equal(tiles.at(-1), '1,1');
});

test('spreadTiles returns the chosen tile alone for one copy', () => {
  assert.deepEqual(spreadTiles(node(), '2,2', 1), ['2,2']);
});
