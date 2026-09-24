import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, getTile } from '../src/map/TileGrid.js';
import { authoring, INTERIOR, settled } from './helpers/authoring.js';

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

test('a stroke on the selected tile hands the inspector the painted tile back', () => {
  const { gestures, env, inspected } = authoring();
  env.selectedTileId = '0,2';
  gestures.onStrokeCell(0, 2, null, true);
  assert.equal(inspected.length, 1);
  assert.equal(inspected[0]?.imageRef, `${INTERIOR}-door-v.svg`);
  // A cell the inspector does not show leaves it alone.
  gestures.onStrokeCell(1, 1, null, false);
  assert.equal(inspected.length, 1);
});

test('the erase brushes clear a tile and a whole path', () => {
  const erasing = authoring();
  erasing.env.activeBrush = 'erase';
  erasing.gestures.onStrokeCell(1, 1, null, true);
  erasing.gestures.onStrokeEnd();
  assert.equal(getTile(erasing.grid.getNode('keep'), '1,1'), undefined);
  assert.ok(settled(erasing.calls).includes('refreshMapDescription'));

  const pathing = authoring();
  pathing.env.activeBrush = 'erase-path';
  pathing.gestures.onStrokeCell(1, 1, null, true);
  pathing.gestures.onStrokeEnd();
  assert.ok(settled(pathing.calls).includes('syncExits'));
});

test('a scaled stamp places once instead of painting every cell of a drag', () => {
  const { gestures, grid, env } = authoring({ scale: 2 });
  env.activeBrush = { type: 'interior', imageRef: `${INTERIOR}-floor-2.svg` };
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeCell(1, 0, null, false);
  gestures.onStrokeCell(2, 0, null, false);
  // The 2x stamp covers the block at the pressed cell. The dragged-over cells
  // are inside it, so nothing else was placed on top.
  assert.equal(getTile(grid.getNode('keep'), '0,0')?.imageRef, `${INTERIOR}-floor-2.svg`);
  assert.equal(getTile(grid.getNode('keep'), '2,0')?.imageRef, `${INTERIOR}-floor-1.svg`);
});

test('the Play-mode fog brush reveals and hides tiles instead of painting them', () => {
  const revealing = authoring({ mode: 'play' });
  revealing.env.fogTool = 'reveal';
  revealing.gestures.onStrokeCell(3, 3, null, true);
  revealing.gestures.onStrokeEnd();
  assert.equal(getTile(revealing.grid.getNode('keep'), '3,3')?.revealed, true);

  const hiding = authoring({ mode: 'play' });
  hiding.env.fogTool = 'hide';
  hiding.gestures.onStrokeCell(3, 3, null, true);
  assert.equal(getTile(hiding.grid.getNode('keep'), '3,3')?.revealed, false);
});

test('a Play-mode stroke with no fog tool on paints nothing', () => {
  const { gestures, grid, calls } = authoring({ mode: 'play' });
  const before = grid.getNode('keep');
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  assert.equal(grid.getNode('keep'), before);
  assert.deepEqual(calls, []);
});

test('linkSelectedTile with nothing selected does nothing', () => {
  const { gestures, grid, calls } = authoring();
  const before = grid.getNode('keep');
  gestures.linkSelectedTile('cellar');
  assert.equal(grid.getNode('keep'), before);
  assert.deepEqual(calls, []);
});

test('a region drag the user cancels out of leaves the block unlinked', async () => {
  const { gestures, env, grid } = authoring();
  env.activeBrush = 'region';
  env.nodeActions = { addChildNode: async () => null };
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeEnd();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.equal(getTile(grid.getNode('keep'), '0,0')?.childNodeId, null);
});

test('a region release with no marquee drawn does nothing', () => {
  const { gestures, env, grid } = authoring();
  const before = grid.getNode('keep');
  env.regionAnchor = { x: 0, y: 0 };
  env.mapCanvas.marquee = null;
  gestures.onStrokeEnd();
  assert.equal(env.regionAnchor, null, 'the release always clears the anchor');
  assert.equal(grid.getNode('keep'), before);
});

test('a region block link hands the inspector its tile back when one is selected', async () => {
  const { gestures, env, inspected } = authoring();
  env.selectedTileId = '0,0';
  env.activeBrush = 'region';
  env.nodeActions = { addChildNode: async () => 'cellar' };
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeEnd();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.equal(inspected.at(-1)?.childNodeId, 'cellar');
});

/**
 * A canvas stand-in for the drop target: it records the listeners the wiring
 * registers, and fires one with a given event.
 */
function canvasStub() {
  /** @type {Map<string, (event: any) => void>} */
  const handlers = new Map();
  return {
    width: 128,
    height: 128,
    addEventListener: (/** @type {string} */ type, /** @type {any} */ handler) =>
      handlers.set(type, handler),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 128, height: 128 }),
    fire: (/** @type {string} */ type, /** @type {any} */ event) => handlers.get(type)?.(event),
  };
}

/** A drop event carrying one palette id, which records whether it was consumed. */
function dropEvent(tileId, x, y) {
  return {
    clientX: x,
    clientY: y,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    dataTransfer: { getData: () => tileId },
  };
}

test('dropping a palette swatch on the canvas paints that cell', () => {
  const { gestures, grid, calls } = authoring({
    palette: {
      get: (/** @type {string} */ id) =>
        id === 'floor-2' ? { type: 'interior', imageRef: `${INTERIOR}-floor-2.svg` } : undefined,
    },
  });
  const canvas = canvasStub();
  gestures.wireCanvasDrop(/** @type {any} */ (canvas));
  // 48,48 at a 32-pixel tile size is cell 1,1.
  const event = dropEvent('floor-2', 48, 48);
  canvas.fire('drop', event);
  assert.equal(event.prevented, true);
  assert.equal(getTile(grid.getNode('keep'), '1,1')?.imageRef, `${INTERIOR}-floor-2.svg`);
  assert.ok(settled(calls).includes('refreshMapDescription'), 'a drop settles like a stroke');
});

test('a drop outside Build mode, or of something the palette does not hold, paints nothing', () => {
  const playing = authoring({ mode: 'play' });
  const playCanvas = canvasStub();
  playing.gestures.wireCanvasDrop(/** @type {any} */ (playCanvas));
  const ignored = dropEvent('floor-2', 48, 48);
  playCanvas.fire('drop', ignored);
  assert.equal(ignored.prevented, false, 'Play mode is not a drop target');

  const building = authoring();
  const buildCanvas = canvasStub();
  building.gestures.wireCanvasDrop(/** @type {any} */ (buildCanvas));
  const before = building.grid.getNode('keep');
  buildCanvas.fire('drop', dropEvent('unknown', 48, 48));
  assert.equal(building.grid.getNode('keep'), before);
});

test('dragover only offers a drop target while authoring', () => {
  const building = authoring();
  const buildCanvas = canvasStub();
  building.gestures.wireCanvasDrop(/** @type {any} */ (buildCanvas));
  const over = dropEvent('floor-2', 0, 0);
  buildCanvas.fire('dragover', over);
  assert.equal(over.prevented, true);

  const playing = authoring({ mode: 'play' });
  const playCanvas = canvasStub();
  playing.gestures.wireCanvasDrop(/** @type {any} */ (playCanvas));
  const ignored = dropEvent('floor-2', 0, 0);
  playCanvas.fire('dragover', ignored);
  assert.equal(ignored.prevented, false);
});
