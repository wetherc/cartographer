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
      party: { nodeId: 'keep', tileId: '0,0' },
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

test('undoStroke puts a creature the regeneration re-landed back on its own tile', () => {
  const { gestures, app } = regenerated();
  assert.deepEqual(app.state.creatures[0].location, at('keep', '1,1'), 'the reland moved it');
  gestures.undoStroke();
  assert.deepEqual(app.state.creatures[0].location, at('keep', '3,3'));
});

test('undoStroke binds a handout the regeneration set loose back to its node', () => {
  const { gestures, app } = regenerated();
  assert.equal(app.state.handouts[0].nodeId, null, 'the removal made it campaign-wide');
  gestures.undoStroke();
  assert.equal(app.state.handouts[0].nodeId, 'cellar');
});

test('undoStroke refreshes the panels that filter by location', () => {
  const { gestures, app } = regenerated();
  app.refreshes.length = 0;
  gestures.undoStroke();
  for (const view of ['encounterPanel', 'initiativePanel', 'npcPanel', 'handoutPanel']) {
    assert.ok(app.refreshes.includes(view), `${view}: ${app.refreshes.join(',')}`);
  }
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
      creatures: [],
      handouts: [],
      entryTiles: {},
    }),
  );
  gestures.undoStroke();
  assert.deepEqual(partyTracker.getPosition(), { nodeId: 'keep', tileId: '0,0' });
});

test('undoStroke keeps fog reveals and notes made after the stroke', () => {
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
  gestures.undoStroke();
  const after = grid.getNode('keep');
  assert.equal(getTile(after, '0,2')?.imageRef, `${INTERIOR}-floor-1.svg`);
  assert.equal(getTile(after, '1,2')?.imageRef, `${INTERIOR}-floor-1.svg`);
  assert.equal(getTile(after, '0,2')?.revealed, true);
  assert.equal(getTile(after, '3,3')?.revealed, true);
  assert.equal(getTile(after, '1,2')?.metadata.notes, 'A draft');
});

test('undoStroke brings back an erased tile', () => {
  const { gestures, grid, env } = authoring();
  const tile = getTile(grid.getNode('keep'), '1,1');
  env.activeBrush = 'erase';
  gestures.onStrokeCell(1, 1, null, true);
  gestures.onStrokeEnd();
  gestures.undoStroke();
  assert.equal(getTile(grid.getNode('keep'), '1,1'), tile);
});

test('undoStroke clears a restored link to a node deleted since the edit', () => {
  const { gestures, grid, env } = authoring();
  grid.addNode(createMapNode('cellar', 'Cellar', 'keep', 2, 2, { kind: 'interior' }));
  env.selectedTileId = '1,1';
  gestures.linkSelectedTile('cellar');
  // A paint over the linked cell clears the link, then the cellar goes.
  env.activeBrush = 'erase';
  gestures.onStrokeCell(1, 1, null, true);
  gestures.onStrokeEnd();
  grid.removeNode('cellar');
  gestures.undoStroke();
  const tile = getTile(grid.getNode('keep'), '1,1');
  assert.ok(tile, 'the erased tile is back');
  assert.equal(tile.childNodeId, null);
});

test('a fog stroke after a committed edit leaves that edit as it was', () => {
  const { gestures, grid, app, env } = authoring();
  gestures.onStrokeCell(0, 2, null, true);
  gestures.onStrokeEnd();
  app.state.mode = 'play';
  env.fogTool = 'reveal';
  gestures.onStrokeCell(3, 3, null, true);
  gestures.onStrokeEnd();
  gestures.undoStroke();
  // The reveal is not part of the paint stroke, so undo keeps it.
  assert.equal(getTile(grid.getNode('keep'), '3,3')?.revealed, true);
  assert.equal(getTile(grid.getNode('keep'), '0,2')?.imageRef, `${INTERIOR}-floor-1.svg`);
});
