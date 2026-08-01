import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapTravel } from '../src/app/mapTravel.js';
import { TileGrid, createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { MapNavigator } from '../src/map/MapNavigator.js';
import { PartyTracker } from '../src/party/PartyTracker.js';
import { fillTiles, gridTiles } from './helpers/grid.js';
import { stubApp } from './helpers/app.js';

const INTERIOR = 'assets/tiles/interior/interior';

/**
 * A two-node world plus the recording app and env the travel handlers read:
 * a 6x6 "World" whose tile 2,4 links to a 4x4 "Saltmere", with the party
 * standing next to that tile. Every view call the handlers make appends its
 * name to `calls`, so a test asserts which syncs a gesture ran rather than
 * reaching into a canvas.
 * @param {{ interior?: boolean, mode?: 'play' | 'build' }} [opts]
 */
function world({ interior = false, mode = 'play' } = {}) {
  const grid = new TileGrid();
  const parent = fillTiles(createMapNode('world', 'World', null, 6, 6), (id) =>
    createTile(id, 'grass.svg'),
  );
  grid.addNode(setTile(parent, createTile('2,4', 'town.svg', { childNodeId: 'child' })));
  const child = createMapNode('child', 'Saltmere', 'world', 4, 4, {
    kind: interior ? 'interior' : 'region',
  });
  grid.addNode({
    ...child,
    tiles: interior
      ? gridTiles(4, 4, (id, x, y) =>
          createTile(id, x === 0 && y === 2 ? `${INTERIOR}-door-v.svg` : `${INTERIOR}-floor-1.svg`),
        )
      : gridTiles(4, 4),
  });

  const navigator = new MapNavigator(grid, 'world');
  const partyTracker = new PartyTracker(grid, { nodeId: 'world', tileId: '2,5' });

  const app = stubApp({ grid, navigator, partyTracker, state: { role: 'gm', mode } });
  const state = app.state;
  // The handlers record through the app as well as through the env below, so one
  // list holds a gesture's whole trail of syncs, in the order they ran.
  const calls = app.calls;
  const log = app.log;
  const env = /** @type {any} */ ({
    goToNode: (id) => {
      navigator.goTo(id);
      // The real goToNode resyncs through resyncMapViews, which sets the node
      // and re-places the party marker; both are what the exits ride on.
      calls.push('goToNode');
      calls.push('setNode');
      calls.push('syncPartyMarker');
    },
    mapCanvas: {
      setNode: () => calls.push('setNode'),
      refreshNode: () => calls.push('refreshNode'),
    },
    breadcrumb: { update: () => calls.push('breadcrumb') },
    worldTree: { update: () => calls.push('worldTree') },
    regionTree: { update: () => calls.push('regionTree') },
    syncPartyMarker: () => calls.push('syncPartyMarker'),
    syncExits: () => calls.push('syncExits'),
    tileTooltip: { show: () => {}, hide: () => {} },
  });
  const travel = createMapTravel(app, env);
  /** @param {string} tileId */
  const clickTile = (tileId) => {
    const node = navigator.getCurrentNode();
    const [x, y] = tileId.split(',').map(Number);
    travel.onCellClick(x, y, node.tiles.find((t) => t.id === tileId) ?? null);
  };
  return { app, env, travel, grid, navigator, partyTracker, state, calls, log, clickTile };
}

test('walking into a region recomputes its ways out', () => {
  const { calls, clickTile, navigator } = world();
  clickTile('2,4');
  assert.equal(navigator.getCurrentNode().id, 'child');
  // The regression this pins: this path swaps the node itself instead of going
  // through resyncMapViews, and used to leave the exits alone, so a party that
  // walked into a sub-region got no return arrows while one teleported in from
  // the region rail did.
  const setNode = calls.indexOf('setNode');
  const exits = calls.indexOf('syncExits');
  assert.ok(setNode >= 0, `expected the canvas to be given the child node: ${calls.join(',')}`);
  assert.ok(exits > setNode, `expected the exits recomputed after it: ${calls.join(',')}`);
  assert.ok(calls.includes('syncPartyMarker'));
});

test('every travel gesture that changes the node in view syncs the party marker', () => {
  // One list, because the invariant is the point: the encounter and NPC markers,
  // the screen-reader description, and mapWiring's own exit recompute all hang
  // off this one sync, so a path that moves the view without it leaves them stale.
  const entering = world();
  entering.clickTile('2,4');
  assert.ok(entering.calls.includes('syncPartyMarker'), 'entering a region');

  const leaving = world();
  leaving.clickTile('2,4');
  leaving.calls.length = 0;
  leaving.travel.exitToParent({
    kind: 'edge',
    side: 'south',
    targetNodeId: 'world',
    targetName: 'World',
  });
  assert.ok(leaving.calls.includes('syncPartyMarker'), 'leaving through an exit');

  const stepping = world();
  stepping.clickTile('1,5');
  assert.ok(stepping.calls.includes('syncPartyMarker'), 'stepping within a node');
});

test('currentExits reports the node in view, and nothing while authoring', () => {
  const { travel, clickTile } = world();
  assert.deepEqual(travel.currentExits(), [], 'the root node has no parent to return to');
  clickTile('2,4');
  assert.deepEqual(
    travel.currentExits().map((e) => (e.kind === 'edge' ? e.side : e.kind)),
    ['north', 'east', 'south', 'west'],
  );

  const building = world({ mode: 'build' });
  building.clickTile('2,4');
  assert.deepEqual(building.travel.currentExits(), [], 'Build mode offers no ways out');
});

test('an exit moves the party into the parent beside the block and logs the return', () => {
  const { travel, partyTracker, navigator, log, clickTile } = world();
  clickTile('2,4');
  travel.exitToParent({ kind: 'edge', side: 'south', targetNodeId: 'world', targetName: 'World' });
  const position = partyTracker.getPosition();
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.equal(position.nodeId, 'world');
  // South of the one-tile block at 2,4.
  assert.equal(position.tileId, '2,5');
  assert.equal(log.at(-1), 'The party returns to World.');
});

test('an exit for a node the view has already left does nothing', () => {
  const { travel, partyTracker, navigator, log } = world();
  // The party never entered, so the view is still on the root: an exit list
  // computed for the child cannot be acted on here.
  travel.exitToParent({ kind: 'edge', side: 'south', targetNodeId: 'world', targetName: 'World' });
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.equal(partyTracker.getPosition().tileId, '2,5');
  assert.deepEqual(log, []);
});

test('a door leads out only once the mover stands on it', () => {
  const { navigator, partyTracker, clickTile, log } = world({ interior: true });
  clickTile('2,4');
  assert.equal(navigator.getCurrentNode().id, 'child');
  // First click walks onto the door; the party stays inside.
  clickTile('0,2');
  assert.equal(navigator.getCurrentNode().id, 'child');
  assert.equal(partyTracker.getPosition().tileId, '0,2');
  // Clicking it again, from on top of it, is leaving through it.
  clickTile('0,2');
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.equal(log.at(-1), 'The party returns to World.');
});
