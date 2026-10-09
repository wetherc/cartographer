import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, getTile } from '../src/map/TileGrid.js';
import { fillTiles } from './helpers/grid.js';
import { authoring, at, INTERIOR } from './helpers/authoring.js';
import { regenerateSnapshot } from '../src/map/RegenerateNode.js';
import { moveCharacter, placementsIn, recallFrom } from '../src/party/CharacterTokens.js';
import { creaturePlacementsIn, moveCreature } from '../src/entities/CreatureMap.js';
import { bindingsIn, createHandout, unbindFrom } from '../src/handout/Handouts.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';

test('undoStroke puts back the node as it stood before the last stroke', async () => {
  const { gestures, grid, calls, toastMessages } = authoring();
  const before = getTile(grid.getNode('keep'), '0,2')?.imageRef;
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  assert.equal(getTile(grid.getNode('keep'), '0,2')?.imageRef, `${INTERIOR}-door-v.svg`);
  calls.length = 0;

  await gestures.undoStroke();
  assert.equal(getTile(grid.getNode('keep'), '0,2')?.imageRef, before);
  assert.deepEqual(toastMessages, ['Undid the paint stroke on Thornhold Keep.']);
  // The undo re-frames, because the whole node came back.
  assert.ok(calls.includes('setNode'));
  assert.ok(calls.includes('clearSelection'));
  assert.ok(calls.includes('markDirty'));
});

test('undoStroke on an empty ring says so and changes nothing', async () => {
  const { gestures, grid, calls, toastMessages } = authoring();
  const before = grid.getNode('keep');
  await gestures.undoStroke();
  assert.equal(grid.getNode('keep'), before);
  assert.deepEqual(toastMessages, ['Nothing to undo.']);
  assert.deepEqual(calls, []);
});

test('undoStroke drops an entry whose node was deleted since the snapshot was taken', async () => {
  const { gestures, grid, toastMessages } = authoring();
  grid.addNode(createMapNode('cellar', 'Cellar', 'keep', 2, 2, { kind: 'interior' }));
  gestures.snapshotEdit(grid.getNode('cellar'));
  grid.removeNode('cellar');
  await gestures.undoStroke();
  assert.equal(grid.getNode('cellar'), undefined, 'the deleted node stays deleted');
  assert.deepEqual(toastMessages, ['Nothing to undo.']);
});

/**
 * The state after a regeneration of the keep: the cellar its tiles led to is
 * gone, a deeper level is new, the keep's tiles changed, and the party was
 * re-landed in the new level. The snapshot was taken before any of it.
 */
function regenerated({ party = at('keep', '0,0') } = {}) {
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
  // A goblin stood in the keep. The regeneration re-lands it on the new
  // layout, the same as generateAction does.
  fixture.app.state.creatures = [
    createCreature('goblin', 'Goblin', { location: at('keep', '3,3') }),
  ];
  const creatures = creaturePlacementsIn(fixture.app.state.creatures, new Set(['keep', 'cellar']));
  // A handout was bound to the cellar. The regeneration removes the cellar,
  // so the handout becomes campaign-wide.
  fixture.app.state.handouts = [createHandout('cellar-note', 'Cellar note', '', 'cellar')];
  const handouts = bindingsIn(fixture.app.state.handouts, new Set(['cellar']));
  // The party had walked into the cellar through the keep's tile 3,3.
  fixture.app.state.entryTiles = { party: { cellar: '3,3' } };
  gestures.recordEdit(
    regenerateSnapshot({
      node: keepBefore,
      parent: null,
      created: ['deep'],
      removed: [cellar],
      party,
      recalled,
      creatures,
      handouts,
      entryTiles: fixture.app.state.entryTiles,
    }),
  );
  fixture.app.state.characters = recallFrom(fixture.app.state.characters, new Set(['cellar']));
  fixture.app.state.creatures = moveCreature(
    fixture.app.state.creatures,
    'goblin',
    at('keep', '1,1'),
  );
  fixture.app.state.handouts = unbindFrom(fixture.app.state.handouts, new Set(['cellar']));
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

test('undoStroke removes what a regeneration created, restores what it removed, and moves the party back', async () => {
  const { gestures, grid, partyTracker, keepBefore, cellar, toastMessages } = regenerated();
  await gestures.undoStroke();
  assert.equal(grid.getNode('deep'), undefined, 'the new level is gone');
  assert.equal(grid.getNode('cellar'), cellar, 'the removed cellar is back');
  assert.equal(grid.getNode('keep'), keepBefore, 'the keep stands as it did');
  assert.deepEqual(partyTracker.getPosition(), { nodeId: 'keep', tileId: '0,0' });
  assert.deepEqual(toastMessages, ['Undid the map generation on Thornhold Keep.']);
});

test('undoStroke puts a character the regeneration recalled back on their own tile', async () => {
  const { gestures, app } = regenerated();
  assert.equal(app.state.characters[0].location, null, 'the recall moved them to the party');
  await gestures.undoStroke();
  assert.deepEqual(app.state.characters[0].location, { nodeId: 'cellar', tileId: '1,0' });
});

test('undoStroke puts a creature the regeneration re-landed back on its own tile', async () => {
  const { gestures, app } = regenerated();
  assert.deepEqual(app.state.creatures[0].location, at('keep', '1,1'), 'the reland moved it');
  await gestures.undoStroke();
  assert.deepEqual(app.state.creatures[0].location, at('keep', '3,3'));
});

test('undoStroke binds a handout the regeneration set loose back to its node', async () => {
  const { gestures, app } = regenerated();
  assert.equal(app.state.handouts[0].nodeId, null, 'the removal made it campaign-wide');
  await gestures.undoStroke();
  assert.equal(app.state.handouts[0].nodeId, 'cellar');
});

test('undoStroke refreshes the panels that filter by location', async () => {
  const { gestures, app } = regenerated();
  app.refreshes.length = 0;
  await gestures.undoStroke();
  for (const view of ['encounterPanel', 'initiativePanel', 'npcPanel', 'handoutPanel']) {
    assert.ok(app.refreshes.includes(view), `${view}: ${app.refreshes.join(',')}`);
  }
});

test('undoStroke brings back the entry memory of a restored level', async () => {
  const { gestures, app } = regenerated();
  await gestures.undoStroke();
  assert.deepEqual(app.state.entryTiles, { party: { cellar: '3,3' } });
});

test('undoStroke leaves the entry memory alone for an edit that never touched it', async () => {
  const { gestures, app, grid } = authoring();
  app.state.entryTiles = { party: { cellar: '3,3' } };
  const memory = app.state.entryTiles;
  gestures.snapshotEdit(grid.getNode('keep'));
  await gestures.undoStroke();
  assert.equal(app.state.entryTiles, memory);
});

test('undoStroke moves a view left inside a removed level to the restored node', async () => {
  const { gestures, navigator, calls } = regenerated();
  navigator.goTo('deep');
  await gestures.undoStroke();
  assert.equal(navigator.currentNodeId, 'keep');
  assert.ok(calls.includes('goToNode'));
  assert.ok(!calls.includes('setNode'), 'goToNode owns the redraw, not a resync');
});

test('undoStroke leaves the party alone when its recorded node no longer exists', async () => {
  const { gestures, partyTracker } = authoring();
  gestures.recordEdit(
    regenerateSnapshot({
      node: createMapNode('keep', 'Keep', 'world', 4, 4),
      parent: null,
      created: [],
      removed: [],
      party: { nodeId: 'nowhere', tileId: '0,0' },
      recalled: [],
      creatures: [],
      handouts: [],
      entryTiles: {},
    }),
  );
  await gestures.undoStroke();
  assert.deepEqual(partyTracker.getPosition(), { nodeId: 'keep', tileId: '0,0' });
});

test('undoStroke keeps fog reveals and notes made after the stroke', async () => {
  const { gestures, grid } = authoring();
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeCell(1, 2, null, false);
  gestures.onStrokeEnd();
  // After the stroke, the party reveals the painted cell and one beside it,
  // and the GM writes a note on the painted cell.
  let keep = grid.getNode('keep');
  for (const id of ['0,2', '3,3']) {
    keep = { ...keep, tiles: keep.tiles.map((t) => (t.id === id ? { ...t, revealed: true } : t)) };
  }
  keep = {
    ...keep,
    tiles: keep.tiles.map((t) =>
      t.id === '1,2' ? { ...t, metadata: { ...t.metadata, notes: 'A draft' } } : t,
    ),
  };
  grid.updateNode(keep);
  await gestures.undoStroke();
  const after = grid.getNode('keep');
  assert.equal(getTile(after, '0,2')?.imageRef, `${INTERIOR}-floor-1.svg`);
  assert.equal(getTile(after, '1,2')?.imageRef, `${INTERIOR}-floor-1.svg`);
  assert.equal(getTile(after, '0,2')?.revealed, true);
  assert.equal(getTile(after, '3,3')?.revealed, true);
  assert.equal(getTile(after, '1,2')?.metadata.notes, 'A draft');
});

test('undoStroke brings back an erased tile', async () => {
  const { gestures, grid, env } = authoring();
  const tile = getTile(grid.getNode('keep'), '1,1');
  env.activeBrush = 'erase';
  gestures.onStrokeCell(1, 1, null, true);
  gestures.onStrokeEnd();
  await gestures.undoStroke();
  assert.equal(getTile(grid.getNode('keep'), '1,1'), tile);
});

test('an erase stroke binds a handout on an erased tile to the whole node, and undo binds it back', async () => {
  const { gestures, env, app } = authoring();
  const onTile = (/** @type {string} */ id, /** @type {string} */ tileId) =>
    createHandout(id, id, '', 'keep', true, null, { tileId });
  app.state.handouts = [onTile('erased', '1,1'), onTile('kept', '2,2')];
  const kept = app.state.handouts[1];
  env.activeBrush = 'erase';
  gestures.onStrokeCell(1, 1, null, true);
  gestures.onStrokeEnd();
  assert.equal(app.state.handouts[0].tileId, null);
  assert.equal(app.state.handouts[0].nodeId, 'keep');
  assert.equal(app.state.handouts[1], kept, 'a handout on a tile still there keeps its identity');
  assert.ok(app.refreshes.includes('handoutPanel'));

  await gestures.undoStroke();
  assert.equal(app.state.handouts[0].tileId, '1,1');
});

test('a paint stroke leaves a tile-bound handout alone', async () => {
  const { gestures, app } = authoring();
  app.state.handouts = [createHandout('h', 'H', '', 'keep', true, null, { tileId: '0,2' })];
  const before = app.state.handouts;
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  assert.equal(app.state.handouts, before);
});

test('undoStroke clears a restored link to a node deleted since the edit', async () => {
  const { gestures, grid, env } = authoring();
  grid.addNode(createMapNode('cellar', 'Cellar', 'keep', 2, 2, { kind: 'interior' }));
  env.selectedTileId = '1,1';
  gestures.linkSelectedTile('cellar');
  // A paint over the linked cell clears the link, then the cellar goes.
  env.activeBrush = 'erase';
  gestures.onStrokeCell(1, 1, null, true);
  gestures.onStrokeEnd();
  grid.removeNode('cellar');
  await gestures.undoStroke();
  const tile = getTile(grid.getNode('keep'), '1,1');
  assert.ok(tile, 'the erased tile is back');
  assert.equal(tile.childNodeId, null);
});

test('a fog stroke after a committed edit leaves that edit as it was', async () => {
  const { gestures, grid, app, env } = authoring();
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  app.state.mode = 'play';
  env.fogTool = 'reveal';
  gestures.onStrokeCell(3, 3, null, true);
  gestures.onStrokeEnd();
  await gestures.undoStroke();
  // The reveal is not part of the paint stroke, so undo keeps it.
  assert.equal(getTile(grid.getNode('keep'), '3,3')?.revealed, true);
  assert.equal(getTile(grid.getNode('keep'), '0,2')?.imageRef, `${INTERIOR}-floor-1.svg`);
});

test('undoStroke of a generation asks first, and a declined question changes nothing', async () => {
  const { gestures, grid, confirms, answer, toastMessages } = regenerated();
  answer.value = false;
  await gestures.undoStroke();
  assert.equal(confirms.length, 1);
  assert.match(confirms[0].message, /removes 1 map/);
  assert.equal(confirms[0].options.title, 'Undo the map generation on Thornhold Keep?');
  assert.ok(grid.getNode('deep'), 'the new level stays');
  assert.deepEqual(toastMessages, []);
  answer.value = true;
  await gestures.undoStroke();
  assert.equal(grid.getNode('deep'), undefined, 'the entry stayed on the ring');
});

test('redoStroke applies an undone generation again', async () => {
  const { gestures, grid, app, partyTracker, toastMessages } = regenerated();
  const deep = grid.getNode('deep');
  const keepAfter = grid.getNode('keep');
  await gestures.undoStroke();
  await gestures.redoStroke();
  assert.equal(grid.getNode('cellar'), undefined, 'the cellar goes again');
  assert.equal(grid.getNode('deep'), deep, 'the new level is back');
  assert.equal(getTile(grid.getNode('keep'), '0,0')?.childNodeId, 'deep');
  assert.equal(grid.getNode('keep').tiles.length, keepAfter.tiles.length);
  assert.deepEqual(partyTracker.getPosition(), at('deep', '1,1'));
  assert.equal(app.state.characters[0].location, null);
  assert.deepEqual(app.state.creatures[0].location, at('keep', '1,1'));
  assert.equal(app.state.handouts[0].nodeId, null);
  assert.deepEqual(app.state.entryTiles, {});
  assert.equal(toastMessages.at(-1), 'Redid the map generation on Thornhold Keep.');
  // A second undo takes it back once more.
  await gestures.undoStroke();
  assert.equal(grid.getNode('deep'), undefined);
  assert.deepEqual(partyTracker.getPosition(), at('keep', '0,0'));
});

test('undoStroke leaves a party that walked on after the edit', async () => {
  const { gestures, partyTracker } = regenerated();
  gestures.finishEdit();
  partyTracker.moveTo('keep', '2,2');
  await gestures.undoStroke();
  assert.deepEqual(partyTracker.getPosition(), at('keep', '2,2'));
});

test('undoStroke lands a party in a removed map beside its block when its old place is gone', async () => {
  const { gestures, partyTracker } = regenerated({ party: at('nowhere', '0,0') });
  await gestures.undoStroke();
  assert.equal(partyTracker.getPosition().nodeId, 'keep');
});

test('undoStroke of an edit on a map out of view asks first', async () => {
  const { gestures, grid, confirms } = authoring();
  grid.addNode(createMapNode('cellar', 'Cellar', 'keep', 2, 2, { kind: 'interior' }));
  gestures.snapshotEdit(grid.getNode('cellar'), 'paint stroke');
  gestures.finishEdit();
  await gestures.undoStroke();
  assert.equal(confirms.length, 1);
  assert.match(confirms[0].message, /on Cellar, not on the map in view/);
  assert.equal(confirms[0].options.variant, 'primary');
});

test('a paint stroke undone and redone paints the cell again', async () => {
  const { gestures, grid, toastMessages, confirms } = authoring();
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  await gestures.undoStroke();
  await gestures.redoStroke();
  assert.equal(getTile(grid.getNode('keep'), '0,2')?.imageRef, `${INTERIOR}-door-v.svg`);
  assert.equal(toastMessages.at(-1), 'Redid the paint stroke on Thornhold Keep.');
  assert.equal(confirms.length, 0, 'a stroke on the map in view asks nothing');
});

test('a new edit empties the redo ring', async () => {
  const { gestures, toastMessages } = authoring();
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  await gestures.undoStroke();
  gestures.onStrokeCell(1, 2, null, true);
  gestures.onStrokeEnd();
  await gestures.redoStroke();
  assert.equal(toastMessages.at(-1), 'Nothing to redo.');
});

test('the stroke history reports the edit each button would change', async () => {
  const { gestures, grid, env } = authoring();
  /** @type {any[]} */
  const seen = [];
  gestures.onStrokeHistoryChange((status) => seen.push(status));
  assert.deepEqual(seen.at(-1), { undo: null, redo: null });
  env.activeBrush = 'erase';
  gestures.onStrokeCell(1, 1, null, true);
  gestures.onStrokeEnd();
  assert.deepEqual(seen.at(-1), { undo: 'erase stroke on Thornhold Keep', redo: null });
  await gestures.undoStroke();
  assert.deepEqual(seen.at(-1), { undo: null, redo: 'erase stroke on Thornhold Keep' });
  env.activeBrush = 'erase-path';
  gestures.onStrokeCell(1, 1, null, true);
  gestures.onStrokeEnd();
  assert.equal(seen.at(-1).undo, 'path erase on Thornhold Keep');
  grid.addNode(createMapNode('cellar', 'Cellar', 'keep', 2, 2, { kind: 'interior' }));
  env.selectedTileId = '2,2';
  gestures.linkSelectedTile('cellar');
  assert.equal(seen.at(-1).undo, 'tile link on Thornhold Keep');
});

test('pruneEdits drops the entries for a deleted map', () => {
  const { gestures, grid } = authoring();
  /** @type {any[]} */
  const seen = [];
  grid.addNode(createMapNode('cellar', 'Cellar', 'keep', 2, 2, { kind: 'interior' }));
  gestures.snapshotEdit(grid.getNode('cellar'));
  gestures.onStrokeHistoryChange((status) => seen.push(status));
  assert.equal(seen.at(-1).undo, 'map edit on Cellar');
  grid.removeNode('cellar');
  gestures.pruneEdits();
  assert.deepEqual(seen.at(-1), { undo: null, redo: null });
  const count = seen.length;
  gestures.pruneEdits();
  assert.equal(seen.length, count, 'nothing to drop, so no change is reported');
});

test('undoStroke refuses when the party stands in a removed map with nowhere to land', async () => {
  const { gestures, grid, partyTracker, toastMessages } = authoring();
  grid.addNode(createMapNode('isle', 'Isle', null, 2, 2));
  gestures.recordEdit({
    ...regenerateSnapshot({
      node: grid.getNode('keep'),
      parent: null,
      created: ['isle'],
      removed: [],
      party: at('nowhere', '0,0'),
      recalled: [],
      creatures: [],
      handouts: [],
      entryTiles: {},
    }),
  });
  partyTracker.moveTo('isle', '0,0');
  await gestures.undoStroke();
  assert.ok(grid.getNode('isle'), 'the map stays');
  assert.match(String(toastMessages.at(-1)), /^Cannot undo this edit while the party stands/);
});

test('undoStroke stops when the ring changes while its question is open', async () => {
  const { gestures, grid, answer, toastMessages } = regenerated();
  answer.during = () => {
    // Another tab's save removes the map the entry rewrote.
    grid.removeNode('keep');
  };
  await gestures.undoStroke();
  assert.ok(grid.getNode('deep') === undefined, 'the removal took the subtree');
  assert.deepEqual(toastMessages, []);
});
