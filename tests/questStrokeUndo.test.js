import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile } from '../src/map/TileGrid.js';
import { fillTiles } from './helpers/grid.js';
import { authoring, INTERIOR } from './helpers/authoring.js';
import { nodeSnapshot } from '../src/map/EditHistory.js';
import { createQuest } from '../src/quest/Quests.js';
import { linksIn, placeLink } from '../src/quest/QuestLinks.js';
import { unlinkRemovedNodes } from '../src/app/questCleanup.js';

/**
 * A keep whose cellar a regeneration removed and replaced with a new level,
 * `deep`. One quest linked the cellar before the edit, and the GM linked the
 * new level after it.
 */
function regenerated() {
  const fixture = authoring();
  const { gestures, grid } = fixture;
  const cellar = createMapNode('cellar', 'Cellar', 'keep', 2, 2, { kind: 'interior' });
  grid.addNode(cellar);
  const keepBefore = fillTiles(grid.getNode('keep'), (id) =>
    createTile(id, `${INTERIOR}-floor-1.svg`, { childNodeId: id === '3,3' ? 'cellar' : null }),
  );
  grid.updateNode(keepBefore);
  fixture.app.state.quests = [
    {
      ...createQuest('q1', 'The Cellar'),
      links: [placeLink('keep'), placeLink('cellar', '1,1')],
    },
  ];
  const doomed = new Set(['cellar']);
  gestures.recordEdit({
    ...nodeSnapshot([keepBefore]),
    created: ['deep'],
    removed: [cellar],
    questLinks: linksIn(fixture.app.state.quests, doomed),
  });
  grid.removeNode('cellar');
  unlinkRemovedNodes(fixture.app, doomed);
  grid.addNode(createMapNode('deep', 'Keep (level 2)', 'keep', 2, 2, { kind: 'interior' }));
  fixture.app.state.quests = [
    { ...fixture.app.state.quests[0], links: [placeLink('keep'), placeLink('deep')] },
  ];
  return fixture;
}

test('undoStroke puts back a quest link the regeneration removed', async () => {
  const { gestures, app } = regenerated();
  await gestures.undoStroke();
  assert.deepEqual(app.state.quests[0].links, [placeLink('keep'), placeLink('cellar', '1,1')]);
  assert.ok(app.refreshes.includes('questPanel'));
});

test('undoStroke removes a quest link to a node the undo takes away', async () => {
  const { gestures, app, grid } = regenerated();
  await gestures.undoStroke();
  assert.equal(grid.getNode('deep'), undefined);
  assert.equal(
    app.state.quests[0].links.some((l) => l.kind === 'place' && l.nodeId === 'deep'),
    false,
  );
});

test('undoStroke of a snapshot with no quest links leaves the quests alone', () => {
  const { gestures, grid, app } = authoring();
  const quests = [{ ...createQuest('q1', 'A'), links: [placeLink('keep')] }];
  app.state.quests = quests;
  gestures.recordEdit(nodeSnapshot([grid.getNode('keep')]));
  gestures.undoStroke();
  assert.equal(app.state.quests, quests);
});
