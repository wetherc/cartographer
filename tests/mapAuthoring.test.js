import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapAuthoring } from '../src/app/mapAuthoring.js';
import { TileGrid, createMapNode, createTile, getTile } from '../src/map/TileGrid.js';
import { MapNavigator } from '../src/map/MapNavigator.js';
import { fillTiles } from './helpers/grid.js';
import { stubApp } from './helpers/app.js';
import { regenerateSnapshot } from '../src/map/RegenerateNode.js';
import { moveCharacter, placementsIn, recallFrom } from '../src/party/CharacterTokens.js';
import { createCharacter } from '../src/entities/Character.js';

const INTERIOR = 'assets/tiles/interior/interior';

/**
 * A one-node interior plus the recording app and env the authoring gestures
 * read. Every derived-state call a gesture makes appends its name to `calls`, so
 * a test asserts what a stroke settled rather than reaching into a canvas.
 */
function authoring({ mode = 'build', scale = 1, palette = { get: () => undefined } } = {}) {
  const grid = new TileGrid();
  grid.addNode(
    fillTiles(createMapNode('keep', 'Thornhold Keep', 'world', 4, 4, { kind: 'interior' }), (id) =>
      createTile(id, `${INTERIOR}-floor-1.svg`),
    ),
  );
  const navigator = new MapNavigator(grid, 'keep');

  /** @type {string[]} */
  const toastMessages = [];
  const partyTracker = /** @type {any} */ ({
    moveTo: (/** @type {string} */ nodeId, /** @type {string} */ tileId) => {
      partyTracker.position = { nodeId, tileId };
    },
    getPosition: () => partyTracker.position,
    position: { nodeId: 'keep', tileId: '0,0' },
    revealRadius: 1,
  });
  const app = stubApp({
    grid,
    navigator,
    partyTracker,
    palette: /** @type {any} */ (palette),
    state: { mode },
    toasts: { show: (/** @type {string} */ message) => toastMessages.push(message) },
  });
  // The gestures record through the app as well as through the env below, so
  // one list holds a stroke's whole trail of derived-state calls.
  const calls = app.calls;
  /** @type {any[]} */
  const inspected = [];
  const env = /** @type {any} */ ({
    selectedTileId: null,
    activeBrush: { type: 'interior', imageRef: `${INTERIOR}-door-v.svg` },
    regionAnchor: null,
    fogTool: null,
    mapCanvas: {
      refreshNodeTiles: () => {},
      refreshNode: () => {},
      setNode: () => calls.push('setNode'),
      marquee: null,
      tileSize: 32,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      // The region tool drags out a block on the canvas and reads it back on
      // release, so the stub has to remember it.
      setMarquee(rect) {
        this.marquee = rect;
      },
    },
    inspector: { setTile: (/** @type {any} */ tile) => inspected.push(tile) },
    palettePanel: { getScale: () => scale },
    selectTile: () => calls.push('selectTile'),
    refreshMapDescription: () => calls.push('refreshMapDescription'),
    syncExits: () => calls.push('syncExits'),
    clearSelection: () => calls.push('clearSelection'),
    syncPartyMarker: () => calls.push('syncPartyMarker'),
    syncPaletteKind: () => calls.push('syncPaletteKind'),
    breadcrumb: { update: () => calls.push('breadcrumb') },
    worldTree: { update: () => calls.push('worldTree') },
    regionTree: { update: () => calls.push('regionTree') },
  });
  return {
    gestures: createMapAuthoring(app, env),
    app,
    env,
    grid,
    navigator,
    partyTracker,
    calls,
    toastMessages,
    inspected,
  };
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

test('undoStroke puts back the node as it stood before the last stroke', () => {
  const { gestures, grid, calls, toastMessages } = authoring();
  const before = getTile(grid.getNode('keep'), '0,2')?.imageRef;
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  assert.equal(getTile(grid.getNode('keep'), '0,2')?.imageRef, `${INTERIOR}-door-v.svg`);
  calls.length = 0;

  gestures.undoStroke();
  assert.equal(getTile(grid.getNode('keep'), '0,2')?.imageRef, before);
  assert.deepEqual(toastMessages, ['Undid the last edit.']);
  // The undo re-frames, because the whole node came back.
  assert.ok(calls.includes('setNode'));
  assert.ok(calls.includes('clearSelection'));
  assert.ok(calls.includes('markDirty'));
});

test('undoStroke on an empty ring says so and changes nothing', () => {
  const { gestures, grid, calls, toastMessages } = authoring();
  const before = grid.getNode('keep');
  gestures.undoStroke();
  assert.equal(grid.getNode('keep'), before);
  assert.deepEqual(toastMessages, ['Nothing to undo.']);
  assert.deepEqual(calls, []);
});

test('undoStroke skips a node deleted since the snapshot was taken', () => {
  const { gestures, grid, toastMessages } = authoring();
  grid.addNode(createMapNode('cellar', 'Cellar', 'keep', 2, 2, { kind: 'interior' }));
  gestures.snapshotEdit(grid.getNode('cellar'));
  grid.removeNode('cellar');
  gestures.undoStroke();
  assert.equal(grid.getNode('cellar'), undefined, 'the deleted node stays deleted');
  assert.deepEqual(toastMessages, ['Undid the last edit.']);
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

/**
 * The state after a regeneration of the keep: the cellar its tiles led to is
 * gone, a deeper level is new, the keep's tiles changed, and the party was
 * re-landed in the new level. The snapshot was taken before any of it.
 */
function regenerated() {
  const fixture = authoring();
  const { gestures, grid, navigator, partyTracker, calls } = fixture;
  fixture.env.goToNode = (/** @type {string} */ id) => {
    navigator.goTo(id);
    calls.push('goToNode');
  };
  const cellar = createMapNode('cellar', 'Cellar', 'keep', 2, 2, { kind: 'interior' });
  grid.addNode(cellar);
  const keepBefore = fillTiles(grid.getNode('keep'), (id) =>
    createTile(id, `${INTERIOR}-floor-1.svg`, { childNodeId: id === '3,3' ? 'cellar' : null }),
  );
  grid.updateNode(keepBefore);
  // A character stood in the cellar. The regeneration recalls them to the
  // party marker, the same as generateAction does.
  fixture.app.state.characters = moveCharacter([createCharacter('hero', 'Aldric')], 'hero', {
    nodeId: 'cellar',
    tileId: '1,0',
  });
  const recalled = placementsIn(fixture.app.state.characters, new Set(['cellar']));
  // The party had walked into the cellar through the keep's tile 3,3.
  fixture.app.state.entryTiles = { party: { cellar: '3,3' } };
  gestures.recordEdit(
    regenerateSnapshot({
      node: keepBefore,
      parent: null,
      created: ['deep'],
      removed: [cellar],
      party: { nodeId: 'keep', tileId: '0,0' },
      recalled,
      entryTiles: fixture.app.state.entryTiles,
    }),
  );
  fixture.app.state.characters = recallFrom(fixture.app.state.characters, new Set(['cellar']));
  fixture.app.state.entryTiles = {}; // the cellar is gone, so its entry is too
  grid.removeNode('cellar');
  grid.addNode(createMapNode('deep', 'Keep (level 2)', 'keep', 2, 2, { kind: 'interior' }));
  grid.updateNode(
    fillTiles(grid.getNode('keep'), (id) =>
      createTile(id, `${INTERIOR}-wall-h.svg`, { childNodeId: id === '0,0' ? 'deep' : null }),
    ),
  );
  partyTracker.moveTo('deep', '1,1');
  calls.length = 0;
  return { ...fixture, keepBefore, cellar };
}

test('undoStroke removes what a regeneration created, restores what it removed, and moves the party back', () => {
  const { gestures, grid, partyTracker, keepBefore, cellar, toastMessages } = regenerated();
  gestures.undoStroke();
  assert.equal(grid.getNode('deep'), undefined, 'the new level is gone');
  assert.equal(grid.getNode('cellar'), cellar, 'the removed cellar is back');
  assert.equal(grid.getNode('keep'), keepBefore, 'the keep stands as it did');
  assert.deepEqual(partyTracker.getPosition(), { nodeId: 'keep', tileId: '0,0' });
  assert.deepEqual(toastMessages, ['Undid the last edit.']);
});

test('undoStroke puts a character the regeneration recalled back on their own tile', () => {
  const { gestures, app } = regenerated();
  assert.equal(app.state.characters[0].location, null, 'the recall moved them to the party');
  gestures.undoStroke();
  assert.deepEqual(app.state.characters[0].location, { nodeId: 'cellar', tileId: '1,0' });
});

test('undoStroke brings back the entry memory of a restored level', () => {
  const { gestures, app } = regenerated();
  gestures.undoStroke();
  assert.deepEqual(app.state.entryTiles, { party: { cellar: '3,3' } });
});

test('undoStroke leaves the entry memory alone for an edit that never touched it', () => {
  const { gestures, app, grid } = authoring();
  app.state.entryTiles = { party: { cellar: '3,3' } };
  const memory = app.state.entryTiles;
  gestures.snapshotEdit(grid.getNode('keep'));
  gestures.undoStroke();
  assert.equal(app.state.entryTiles, memory);
});

test('undoStroke moves a view left inside a removed level to the restored node', () => {
  const { gestures, navigator, calls } = regenerated();
  navigator.goTo('deep');
  gestures.undoStroke();
  assert.equal(navigator.currentNodeId, 'keep');
  assert.ok(calls.includes('goToNode'));
  assert.ok(!calls.includes('setNode'), 'goToNode owns the redraw, not a resync');
});

test('undoStroke leaves the party alone when its recorded node no longer exists', () => {
  const { gestures, partyTracker } = authoring();
  gestures.recordEdit(
    regenerateSnapshot({
      node: createMapNode('keep', 'Keep', 'world', 4, 4),
      parent: null,
      created: [],
      removed: [],
      party: { nodeId: 'nowhere', tileId: '0,0' },
      recalled: [],
      entryTiles: {},
    }),
  );
  gestures.undoStroke();
  assert.deepEqual(partyTracker.getPosition(), { nodeId: 'keep', tileId: '0,0' });
});
