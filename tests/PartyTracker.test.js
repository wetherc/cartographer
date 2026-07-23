import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { revealedCount } from '../src/map/FogOfWar.js';
import { PartyTracker } from '../src/party/PartyTracker.js';

function grid5x5(id = 'n') {
  let node = createMapNode(id, 'Node', null, 5, 5);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      node = setTile(node, createTile(`${x},${y}`, 'grass.svg'));
    }
  }
  return node;
}

test('constructing a tracker reveals fog around the initial position', () => {
  const grid = new TileGrid();
  grid.addNode(grid5x5());
  new PartyTracker(grid, { nodeId: 'n', tileId: '2,2' }, { revealRadius: 0 });
  assert.equal(revealedCount(grid.getNode('n')), 1);
});

test('getPosition reflects the constructor position', () => {
  const grid = new TileGrid();
  grid.addNode(grid5x5());
  const tracker = new PartyTracker(grid, { nodeId: 'n', tileId: '2,2' }, { revealRadius: 0 });
  assert.deepEqual(tracker.getPosition(), { nodeId: 'n', tileId: '2,2' });
});

test('moveTo updates position and reveals fog at the new tile', () => {
  const grid = new TileGrid();
  grid.addNode(grid5x5());
  const tracker = new PartyTracker(grid, { nodeId: 'n', tileId: '0,0' }, { revealRadius: 0 });
  tracker.moveTo('n', '4,4');
  assert.deepEqual(tracker.getPosition(), { nodeId: 'n', tileId: '4,4' });
  assert.equal(revealedCount(grid.getNode('n')), 2); // 0,0 and 4,4, reveal is monotonic
});

test('moveTo reveals fog on the default radius', () => {
  const grid = new TileGrid();
  grid.addNode(grid5x5());
  new PartyTracker(grid, { nodeId: 'n', tileId: '2,2' });
  assert.ok(revealedCount(grid.getNode('n')) > 1);
});

test('moveTo can cross into a different node', () => {
  const grid = new TileGrid();
  grid.addNode(grid5x5('world'));
  grid.addNode(grid5x5('region'));
  const tracker = new PartyTracker(grid, { nodeId: 'world', tileId: '0,0' }, { revealRadius: 0 });
  tracker.moveTo('region', '2,2');
  assert.deepEqual(tracker.getPosition(), { nodeId: 'region', tileId: '2,2' });
  assert.equal(revealedCount(grid.getNode('region')), 1);
  assert.equal(revealedCount(grid.getNode('world')), 1); // unaffected by the move
});

test('throws if constructed or moved onto an unknown node', () => {
  const grid = new TileGrid();
  grid.addNode(grid5x5());
  assert.throws(() => new PartyTracker(grid, { nodeId: 'nope', tileId: '0,0' }), /unknown node/);

  const tracker = new PartyTracker(grid, { nodeId: 'n', tileId: '0,0' }, { revealRadius: 0 });
  assert.throws(() => tracker.moveTo('nope', '0,0'), /unknown node/);
});
