import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { MapNavigator } from '../src/map/MapNavigator.js';
import { PartyTracker } from '../src/party/PartyTracker.js';
import { buildBlankCampaign } from '../src/campaign/Campaigns.js';
import { rehydrateCampaign, SYNCED_STATE_KEYS } from '../src/app/rehydrate.js';

/**
 * A campaign with one grid node, distinguishable from the blank one by name so a
 * test can tell which world the app ended up holding.
 * @param {string} name
 */
function campaignNamed(name) {
  const campaign = buildBlankCampaign();
  const node = /** @type {import('../src/types/map.js').MapNode} */ (
    campaign.grid.getNode('world')
  );
  campaign.grid.updateNode({ ...node, name });
  return campaign;
}

/** A stand-in AppContext: the real engine objects, counting stubs for the DOM. */
function fakeApp() {
  const campaign = campaignNamed('Before');
  /** @type {string[]} */
  const called = [];
  /** @param {string} name */
  const stub = (name) => () => void called.push(name);
  const views = {};
  for (const name of [
    'partyPanels',
    'encounterPanel',
    'buildEncounters',
    'buildNPCs',
    'initiativePanel',
    'combatScreen',
    'npcPanel',
    'questPanel',
    'handoutPanel',
    'travelogPanel',
  ]) {
    views[name] = { update: stub(name) };
  }
  const app = {
    grid: campaign.grid,
    navigator: new MapNavigator(campaign.grid, 'world'),
    partyTracker: new PartyTracker(campaign.grid, campaign.party),
    state: { ...campaign, grid: undefined, party: undefined, mode: 'play', role: 'player' },
    views,
    actions: {
      resyncMap: stub('resyncMap'),
      syncEncounterMarkers: stub('syncEncounterMarkers'),
      syncNPCMarkers: stub('syncNPCMarkers'),
      refreshMapDescription: stub('refreshMapDescription'),
    },
  };
  delete app.state.grid;
  delete app.state.party;
  return { app: /** @type {any} */ (app), called };
}

test('replaceNodes swaps a grid contents without replacing the grid object', () => {
  const grid = new TileGrid();
  grid.addNode(createMapNode('old', 'Old', null, 2, 2));
  const navigator = new MapNavigator(grid, 'old');

  grid.replaceNodes([createMapNode('fresh', 'Fresh', null, 3, 3)]);

  assert.equal(grid.getNode('old'), undefined);
  assert.equal(grid.getNode('fresh')?.name, 'Fresh');
  // The navigator was constructed against this grid and still reads through it.
  assert.equal(navigator.grid.getNode('fresh')?.name, 'Fresh');
});

test('the synced field list matches the campaign shape exactly', () => {
  const campaignFields = Object.keys(buildBlankCampaign())
    .filter((key) => key !== 'grid' && key !== 'party')
    .sort();
  assert.deepEqual([...SYNCED_STATE_KEYS].sort(), campaignFields);
});

test('rehydrate adopts another tab world, party, and collections', () => {
  const { app } = fakeApp();
  const next = campaignNamed('After');
  next.party = { nodeId: 'world', tileId: '1,1' };
  next.quests = [{ id: 'q1', title: 'Find the seal', notes: '', status: 'active' }];
  next.splitParty = true;

  rehydrateCampaign(app, next);

  assert.equal(app.grid.getNode('world')?.name, 'After');
  assert.deepEqual(app.partyTracker.getPosition(), { nodeId: 'world', tileId: '1,1' });
  assert.equal(app.state.quests[0].title, 'Find the seal');
  assert.equal(app.state.splitParty, true);
});

test('rehydrate leaves this tab own mode and role alone', () => {
  const { app } = fakeApp();
  app.state.mode = 'play';
  app.state.role = 'player';

  rehydrateCampaign(app, campaignNamed('After'));

  assert.equal(app.state.mode, 'play');
  assert.equal(app.state.role, 'player');
});

test('rehydrate keeps the node this tab is viewing', () => {
  const { app } = fakeApp();
  const next = campaignNamed('After');
  next.grid.addNode(createMapNode('cave', 'Cave', 'world', 2, 2));
  app.navigator.goTo('world');
  app.grid.addNode(createMapNode('cave', 'Cave', 'world', 2, 2));
  app.navigator.goTo('cave');

  rehydrateCampaign(app, next);

  assert.equal(app.navigator.currentNodeId, 'cave');
});

test('rehydrate follows the party when the viewed node is gone', () => {
  const { app } = fakeApp();
  app.grid.addNode(createMapNode('cave', 'Cave', 'world', 2, 2));
  app.navigator.goTo('cave');

  // The other tab deleted that node before saving.
  rehydrateCampaign(app, campaignNamed('After'));

  assert.equal(app.navigator.currentNodeId, 'world');
});

test('rehydrate refreshes the map and every campaign-backed panel', () => {
  const { app, called } = fakeApp();

  rehydrateCampaign(app, campaignNamed('After'));

  for (const name of [
    'resyncMap',
    'syncEncounterMarkers',
    'syncNPCMarkers',
    'refreshMapDescription',
    'partyPanels',
    'encounterPanel',
    'buildEncounters',
    'buildNPCs',
    'initiativePanel',
    'combatScreen',
    'npcPanel',
    'questPanel',
    'handoutPanel',
    'travelogPanel',
  ]) {
    assert.ok(called.includes(name), `expected ${name} to be refreshed`);
  }
});

test('rehydrate throws rather than half-applying an unusable party position', () => {
  const { app } = fakeApp();
  const next = campaignNamed('After');
  next.party = { nodeId: 'nowhere', tileId: '0,0' };

  assert.throws(() => rehydrateCampaign(app, next));
});

test('a revealed tile survives the swap, so fog is not re-fogged by adopting', () => {
  const { app } = fakeApp();
  const next = campaignNamed('After');
  const node = /** @type {import('../src/types/map.js').MapNode} */ (next.grid.getNode('world'));
  next.grid.updateNode(setTile(node, { ...createTile('3,3', 'grass.png'), revealed: true }));

  rehydrateCampaign(app, next);

  assert.equal(app.grid.getNode('world')?.tiles.find((t) => t.id === '3,3')?.revealed, true);
});
