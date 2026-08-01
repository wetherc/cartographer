import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapAuthoring } from '../src/app/mapAuthoring.js';
import { TileGrid, createMapNode, createTile, getTile } from '../src/map/TileGrid.js';
import { MapNavigator } from '../src/map/MapNavigator.js';
import { fillTiles } from './helpers/grid.js';
import { stubApp } from './helpers/app.js';

const INTERIOR = 'assets/tiles/interior/interior';

/**
 * A one-node interior plus the recording app and env the authoring gestures
 * read. Every derived-state call a gesture makes appends its name to `calls`, so
 * a test asserts what a stroke settled rather than reaching into a canvas.
 */
function authoring() {
  const grid = new TileGrid();
  grid.addNode(
    fillTiles(createMapNode('keep', 'Thornhold Keep', 'world', 4, 4, { kind: 'interior' }), (id) =>
      createTile(id, `${INTERIOR}-floor-1.svg`),
    ),
  );
  const navigator = new MapNavigator(grid, 'keep');

  const app = stubApp({ grid, navigator, state: { mode: 'build' } });
  // The gestures record through the app as well as through the env below, so
  // one list holds a stroke's whole trail of derived-state calls.
  const calls = app.calls;
  const env = /** @type {any} */ ({
    selectedTileId: null,
    activeBrush: { type: 'interior', imageRef: `${INTERIOR}-door-v.svg` },
    regionAnchor: null,
    mapCanvas: {
      refreshNodeTiles: () => {},
      refreshNode: () => {},
      marquee: null,
      // The region tool drags out a block on the canvas and reads it back on
      // release, so the stub has to remember it.
      setMarquee(rect) {
        this.marquee = rect;
      },
    },
    inspector: { setTile: () => {} },
    palettePanel: { getScale: () => 1 },
    selectTile: () => calls.push('selectTile'),
    refreshMapDescription: () => calls.push('refreshMapDescription'),
    syncExits: () => calls.push('syncExits'),
  });
  return { gestures: createMapAuthoring(app, env), app, env, grid, navigator, calls };
}

/** The derived-state work a gesture settled, without the save marker. */
const settled = (/** @type {string[]} */ calls) => calls.filter((c) => c !== 'markDirty');

test('a paint stroke settles the ways out along with the rest of the derived state', () => {
  const { gestures, grid, calls } = authoring();
  // Painting a door on the outer wall is what clears Build's sealed-interior
  // warning, and that warning is derived where the exits are, so a stroke which
  // settles the description but not the exits leaves the warning standing over a
  // map that now has a door.
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  const painted = getTile(grid.getNode('keep') ?? null, '0,2');
  assert.equal(painted?.imageRef, `${INTERIOR}-door-v.svg`);
  assert.ok(settled(calls).includes('syncExits'), settled(calls).join(','));
});

test('a stroke that mutated nothing settles nothing', () => {
  const { gestures, env, calls } = authoring();
  // The inspect brush selects the pressed cell instead of painting it.
  env.activeBrush = null;
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  assert.deepEqual(calls, ['selectTile']);
});

test('linking a tile recomputes the ways out, because a linked tile is no longer one', () => {
  const { gestures, env, grid, calls } = authoring();
  grid.addNode(createMapNode('cellar', 'Cellar', 'keep', 2, 2, { kind: 'interior' }));
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  env.selectedTileId = '0,2';
  calls.length = 0;

  // findExits skips a tile that leads further in, so linking the interior's only
  // door seals it. Linking does not go through a stroke, so it owes the sync
  // itself.
  gestures.linkSelectedTile('cellar');
  assert.equal(getTile(grid.getNode('keep') ?? null, '0,2')?.childNodeId, 'cellar');
  assert.ok(calls.includes('syncExits'), calls.join(','));
});

test('a region block link recomputes the ways out too', async () => {
  const { gestures, env, grid, calls } = authoring();
  // No existing child, so the link goes straight to creating one instead of
  // prompting for a target: node:test has no DOM for the dialog.
  // The marquee only links tiles that exist, so paint the block first.
  env.activeBrush = { type: 'interior', imageRef: `${INTERIOR}-door-v.svg` };
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  calls.length = 0;

  // The region tool drags out a block and resolves it to a child link on
  // release, the area counterpart of the per-tile link above. It prompts, so the
  // link lands a turn later than the gesture that started it.
  env.activeBrush = 'region';
  env.nodeActions = { addChildNode: async () => 'cellar' };
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.equal(getTile(grid.getNode('keep') ?? null, '0,2')?.childNodeId, 'cellar');
  assert.ok(calls.includes('syncExits'), calls.join(','));
});
