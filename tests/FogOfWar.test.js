import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { revealAround, withinRadius, hideAll, revealAll, setTileRevealed, revealedCount, discoveredNodes } from '../src/map/FogOfWar.js';

function grid5x5() {
  let node = createMapNode('n', 'Node', null, 5, 5);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      node = setTile(node, createTile(`${x},${y}`, 'grass.svg'));
    }
  }
  return node;
}

test('revealAround radius 0 reveals only the center tile', () => {
  const node = revealAround(grid5x5(), '2,2', 0);
  assert.equal(revealedCount(node), 1);
  assert.equal(node.tiles.find((t) => t.id === '2,2').revealed, true);
});

test('revealAround radius 1 reveals orthogonal neighbors but not diagonals', () => {
  const node = revealAround(grid5x5(), '2,2', 1);
  assert.equal(revealedCount(node), 5); // center + 4 orthogonal neighbors
  for (const id of ['2,2', '1,2', '3,2', '2,1', '2,3']) {
    assert.equal(node.tiles.find((t) => t.id === id).revealed, true, id);
  }
  assert.equal(node.tiles.find((t) => t.id === '1,1').revealed, false);
});

test('revealAround radius sqrt(2) also reveals diagonal neighbors', () => {
  const node = revealAround(grid5x5(), '2,2', Math.SQRT2);
  assert.equal(revealedCount(node), 9); // full 3x3 block
});

test('revealAround does not un-reveal already-revealed tiles outside the new radius', () => {
  let node = revealAround(grid5x5(), '0,0', 0);
  node = revealAround(node, '4,4', 0);
  assert.equal(revealedCount(node), 2);
});

test('revealAround is a no-op for a center id that is not a grid coordinate', () => {
  const before = grid5x5();
  const after = revealAround(before, 'not-a-coord', 5);
  assert.equal(revealedCount(after), 0);
  assert.equal(after, before);
});

test('hideAll resets every tile to unrevealed', () => {
  const revealed = revealAround(grid5x5(), '2,2', 5);
  assert.equal(revealedCount(revealed), 25);
  const hidden = hideAll(revealed);
  assert.equal(revealedCount(hidden), 0);
});

test('discoveredNodes keeps nodes with at least one revealed tile', () => {
  const visited = revealAround({ ...grid5x5(), id: 'a' }, '2,2', 1);
  const unvisited = { ...grid5x5(), id: 'b' };
  const result = discoveredNodes([visited, unvisited], { nodeId: 'a', tileId: '2,2' });
  assert.deepEqual(result.map((n) => n.id), ['a']);
});

test('discoveredNodes always includes the node the party stands in, even with no revealed tiles', () => {
  const emptyWorld = createMapNode('world', 'World', null, 8, 6);
  const result = discoveredNodes([emptyWorld], { nodeId: 'world', tileId: '0,0' });
  assert.deepEqual(result.map((n) => n.id), ['world']);
});

test('discoveredNodes preserves input order across multiple discovered nodes', () => {
  const a = revealAround({ ...grid5x5(), id: 'a' }, '0,0', 0);
  const b = revealAround({ ...grid5x5(), id: 'b' }, '0,0', 0);
  const fogged = { ...grid5x5(), id: 'c' };
  const result = discoveredNodes([a, fogged, b], { nodeId: 'b', tileId: '0,0' });
  assert.deepEqual(result.map((n) => n.id), ['a', 'b']);
});

test('revealAll reveals every tile', () => {
  let node = createMapNode('n', 'N', null, 2, 2);
  node = setTile(node, createTile('0,0', 'a.svg'));
  node = setTile(node, createTile('1,1', 'b.svg'));
  const lit = revealAll(node);
  assert.ok(lit.tiles.every((t) => t.revealed));
});

test('setTileRevealed flips one tile each way and no-ops on missing or unchanged tiles', () => {
  let node = createMapNode('n', 'N', null, 2, 2);
  node = setTile(node, createTile('0,0', 'a.svg'));
  const lit = setTileRevealed(node, '0,0', true);
  assert.equal(lit.tiles[0].revealed, true);
  const dark = setTileRevealed(lit, '0,0', false);
  assert.equal(dark.tiles[0].revealed, false);
  assert.equal(setTileRevealed(dark, '0,0', false), dark, 'unchanged state returns same node');
  assert.equal(setTileRevealed(dark, '9,9', true), dark, 'missing tile is a no-op');
});

test('withinRadius applies the same Euclidean cutoff as revealAround', () => {
  assert.equal(withinRadius('2,2', '2,2', 0), true, 'a tile is within any radius of itself');
  assert.equal(withinRadius('4,2', '2,2', 2), true, 'straight-line distance 2');
  assert.equal(withinRadius('4,4', '2,2', 2), false, 'diagonal distance 2*sqrt(2) exceeds 2');
  assert.equal(withinRadius('4,4', '2,2', 4), true, 'diagonal within a doubled radius');
  assert.equal(withinRadius('2,7', '2,2', 4), false, 'distance 5 is past the doubled radius');
});

test('withinRadius is false when either id is not a grid coordinate', () => {
  assert.equal(withinRadius('not-a-tile', '2,2', 10), false);
  assert.equal(withinRadius('2,2', 'not-a-tile', 10), false);
});
