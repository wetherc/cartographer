import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, getTile } from '../src/map/TileGrid.js';
import { authoring, INTERIOR, settled } from './helpers/authoring.js';
import { variantIdAt } from '../src/map/TileCatalog.js';

/** The art path of the plaza variant that the cell at (x, y) picks. */
const plazaAt = (/** @type {number} */ x, /** @type {number} */ y) =>
  `assets/tiles/plaza/${variantIdAt('plaza', x, y)}.svg`;

test('a paint stroke settles the ways out along with the rest of the derived state', async () => {
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

test('a stroke that mutated nothing settles nothing', async () => {
  const { gestures, env, calls } = authoring();
  // The inspect brush selects the pressed cell instead of painting it.
  env.activeBrush = null;
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  assert.deepEqual(calls, ['selectTile']);
});

test('linking a tile recomputes the ways out, because a linked tile is no longer one', async () => {
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

/** Wait one turn, for a gesture that awaits a prompt. */
const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

test('a region stroke links every cell it crosses and settles the ways out', async () => {
  const { gestures, env, grid, calls } = authoring();
  env.activeBrush = 'region';
  env.palettePanel.regionPicker.pick('cellar');
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeCell(1, 0, null, false);
  gestures.onStrokeEnd();
  const keep = grid.getNode('keep') ?? null;
  assert.equal(getTile(keep, '0,0')?.childNodeId, 'cellar');
  assert.equal(getTile(keep, '1,0')?.childNodeId, 'cellar');
  assert.equal(getTile(keep, '2,0')?.childNodeId, null);
  assert.ok(settled(calls).includes('syncExits'), settled(calls).join(','));
});

test('a region stroke moves a cell out of the region it was in', async () => {
  const { gestures, env, grid } = authoring();
  env.activeBrush = 'region';
  env.palettePanel.regionPicker.pick('cellar');
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeEnd();
  env.palettePanel.regionPicker.pick('crypt');
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeEnd();
  assert.equal(getTile(grid.getNode('keep') ?? null, '0,0')?.childNodeId, 'crypt');
});

test('a region stroke with no region picked clears the links it crosses', async () => {
  const { gestures, env, grid } = authoring();
  env.activeBrush = 'region';
  env.palettePanel.regionPicker.pick('cellar');
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeEnd();
  env.palettePanel.regionPicker.target = null;
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeEnd();
  assert.equal(getTile(grid.getNode('keep') ?? null, '0,0')?.childNodeId, null);
});

test('a region stroke over cells that already link there settles nothing', async () => {
  const { gestures, env, grid, calls } = authoring();
  env.activeBrush = 'region';
  env.palettePanel.regionPicker.pick('cellar');
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeEnd();
  const before = grid.getNode('keep');
  calls.length = 0;
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeEnd();
  assert.equal(grid.getNode('keep'), before);
  assert.deepEqual(settled(calls), []);
});

test('one undo takes back a whole region stroke', async () => {
  const { gestures, env, grid } = authoring();
  env.goToNode = () => {};
  env.activeBrush = 'region';
  env.palettePanel.regionPicker.pick('cellar');
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeCell(1, 0, null, false);
  gestures.onStrokeEnd();
  await gestures.undoStroke();
  const keep = grid.getNode('keep') ?? null;
  assert.equal(getTile(keep, '0,0')?.childNodeId ?? null, null);
  assert.equal(getTile(keep, '1,0')?.childNodeId ?? null, null);
});

test('the first region stroke on a node with no children creates one', async () => {
  const { gestures, env, grid, calls } = authoring();
  env.activeBrush = 'region';
  env.nodeActions = { addChildNode: async () => 'cellar' };
  gestures.onStrokeCell(0, 0, null, true);
  // The prompt took the pointer, so the rest of the drag paints nothing.
  gestures.onStrokeCell(1, 0, null, false);
  gestures.onStrokeEnd();
  await tick();
  const keep = grid.getNode('keep') ?? null;
  assert.equal(getTile(keep, '0,0')?.childNodeId, 'cellar');
  assert.equal(getTile(keep, '1,0')?.childNodeId, null);
  assert.equal(env.palettePanel.regionPicker.getTarget(), 'cellar');
  assert.ok(calls.includes('syncExits'), calls.join(','));
});

test('a first region stroke the user cancels out of links nothing', async () => {
  const { gestures, env, grid } = authoring();
  env.activeBrush = 'region';
  env.nodeActions = { addChildNode: async () => null };
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeEnd();
  await tick();
  assert.equal(getTile(grid.getNode('keep'), '0,0')?.childNodeId, null);
});

test('a region stroke hands the inspector its tile back when one is selected', async () => {
  const { gestures, env, inspected } = authoring();
  env.selectedTileId = '0,0';
  env.activeBrush = 'region';
  env.palettePanel.regionPicker.pick('cellar');
  gestures.onStrokeCell(0, 0, null, true);
  gestures.onStrokeEnd();
  assert.equal(inspected.at(-1)?.childNodeId, 'cellar');
});

test('a stroke on the selected tile hands the inspector the painted tile back', async () => {
  const { gestures, env, inspected } = authoring();
  env.selectedTileId = '0,2';
  gestures.onStrokeCell(0, 2, null, true);
  assert.equal(inspected.length, 1);
  assert.equal(inspected[0]?.imageRef, `${INTERIOR}-door-v.svg`);
  // A cell the inspector does not show leaves it alone.
  gestures.onStrokeCell(1, 1, null, false);
  assert.equal(inspected.length, 1);
});

test('the erase brushes clear a tile and a whole path', async () => {
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

test('a scaled stamp places once instead of painting every cell of a drag', async () => {
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

test('the Play-mode fog brush reveals and hides tiles instead of painting them', async () => {
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

test('a Play-mode stroke with no fog tool on paints nothing', async () => {
  const { gestures, grid, calls } = authoring({ mode: 'play' });
  const before = grid.getNode('keep');
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  assert.equal(grid.getNode('keep'), before);
  assert.deepEqual(calls, []);
});

test('linkSelectedTile with nothing selected does nothing', async () => {
  const { gestures, grid, calls } = authoring();
  const before = grid.getNode('keep');
  gestures.linkSelectedTile('cellar');
  assert.equal(grid.getNode('keep'), before);
  assert.deepEqual(calls, []);
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

test('dropping a palette swatch on the canvas paints that cell', async () => {
  const { gestures, grid, calls } = authoring();
  const canvas = canvasStub();
  gestures.wireCanvasDrop(/** @type {any} */ (canvas));
  // 48,48 at a 32-pixel tile size is cell 1,1.
  const event = dropEvent('interior-floor-2', 48, 48);
  canvas.fire('drop', event);
  assert.equal(event.prevented, true);
  assert.equal(getTile(grid.getNode('keep'), '1,1')?.imageRef, `${INTERIOR}-floor-2.svg`);
  assert.ok(settled(calls).includes('refreshMapDescription'), 'a drop settles like a stroke');
});

test('a drop outside Build mode, or of something the palette does not hold, paints nothing', async () => {
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

test('dragover only offers a drop target while authoring', async () => {
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

test('a random-variant brush paints the position pick of each cell', async () => {
  const { gestures, grid, env, app } = authoring();
  env.activeBrush = app.palette.anyVariant('plaza');
  gestures.onStrokeCell(0, 1, null, true);
  gestures.onStrokeCell(1, 1, null, false);
  gestures.onStrokeEnd();
  const node = grid.getNode('keep');
  assert.equal(getTile(node, '0,1')?.imageRef, plazaAt(0, 1));
  assert.equal(getTile(node, '1,1')?.imageRef, plazaAt(1, 1));
});

test('dropping a random-variant swatch paints the position pick', async () => {
  const { gestures, grid } = authoring();
  const canvas = canvasStub();
  gestures.wireCanvasDrop(/** @type {any} */ (canvas));
  canvas.fire('drop', dropEvent('any:plaza', 48, 48));
  assert.equal(getTile(grid.getNode('keep'), '1,1')?.imageRef, plazaAt(1, 1));
});

test('a region stroke leaves a site entrance linked and says so once', async () => {
  const { gestures, env, grid, toastMessages } = authoring();
  // A door on the outer wall is the way into the keep's cellar.
  env.activeBrush = { type: 'interior', imageRef: `${INTERIOR}-door-v.svg` };
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  env.activeBrush = 'region';
  env.palettePanel.regionPicker.pick('cellar');
  gestures.onStrokeCell(0, 1, null, true);
  gestures.onStrokeCell(0, 2, null, false);
  gestures.onStrokeCell(0, 2, null, false);
  gestures.onStrokeEnd();
  const keep = grid.getNode('keep') ?? null;
  assert.equal(getTile(keep, '0,1')?.childNodeId, 'cellar');
  assert.equal(getTile(keep, '0,2')?.childNodeId ?? null, null);
  assert.deepEqual(toastMessages, [
    'The Link tool left a site entrance unchanged. Use the Tile tab to relink one.',
  ]);
});

test('a brush inspects instead of painting while another rail tab is open', async () => {
  const { gestures, env, grid, calls } = authoring();
  env.buildTab = 'build-tab-tile';
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  assert.notEqual(getTile(grid.getNode('keep') ?? null, '0,2')?.imageRef, `${INTERIOR}-door-v.svg`);
  assert.deepEqual(calls, ['selectTile']);
});
