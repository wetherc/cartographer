import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { revealAround, hideAll, revealedCount } from '../src/map/FogOfWar.js';

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
