import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { MapNavigator } from '../src/map/MapNavigator.js';
import { PartyTracker } from '../src/party/PartyTracker.js';
import { buildBlankCampaign } from '../src/campaign/Campaigns.js';
import { rehydrateCampaign, SYNCED_STATE_KEYS } from '../src/app/rehydrate.js';
import { stubApp } from './helpers/app.js';

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

/** A stub app over the real engine objects, so the swap has a grid to adopt. */
function fakeApp() {
  const campaign = campaignNamed('Before');
  const state = { ...campaign, mode: 'play', role: 'player' };
  delete state.grid;
  delete state.party;
  const app = stubApp({
    grid: campaign.grid,
    navigator: new MapNavigator(campaign.grid, 'world'),
    partyTracker: new PartyTracker(campaign.grid, campaign.party),
    state: /** @type {any} */ (state),
  });
  return app;
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
  const app = fakeApp();
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
  const app = fakeApp();
  app.state.mode = 'play';
  app.state.role = 'player';

  rehydrateCampaign(app, campaignNamed('After'));

  assert.equal(app.state.mode, 'play');
  assert.equal(app.state.role, 'player');
});

test('rehydrate keeps the node this tab is viewing', () => {
  const app = fakeApp();
  const next = campaignNamed('After');
  next.grid.addNode(createMapNode('cave', 'Cave', 'world', 2, 2));
  app.navigator.goTo('world');
  app.grid.addNode(createMapNode('cave', 'Cave', 'world', 2, 2));
  app.navigator.goTo('cave');

  rehydrateCampaign(app, next);

  assert.equal(app.navigator.currentNodeId, 'cave');
});

test('rehydrate follows the party when the viewed node is gone', () => {
  const app = fakeApp();
  app.grid.addNode(createMapNode('cave', 'Cave', 'world', 2, 2));
  app.navigator.goTo('cave');

  // The other tab deleted that node before saving.
  rehydrateCampaign(app, campaignNamed('After'));

  assert.equal(app.navigator.currentNodeId, 'world');
});

test('rehydrate refreshes the map and every campaign-backed panel', () => {
  const app = fakeApp();

  rehydrateCampaign(app, campaignNamed('After'));

  for (const name of [
    'resyncMap',
    'syncEncounterMarkers',
    'syncNPCMarkers',
    'refreshMapDescription',
  ]) {
    assert.ok(app.calls.includes(name), `expected ${name} to be called`);
  }
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
    assert.ok(app.refreshes.includes(name), `expected ${name} to be refreshed`);
  }
});

// A follower tab adopts an autosave every ten idle seconds, and most of those
// carry no edit at all. The entities the save did not change must come back as
// the objects the panels already hold, or every panel rebuilds every row.
// The map caches are keyed on node identity, so a node the save did not
// change must come back as the object the caches already know.
test('rehydrate keeps the live node objects that the adopted save did not change', () => {
  const app = fakeApp();
  const before = app.grid.getNode('world');

  rehydrateCampaign(app, campaignNamed('Before'));

  assert.equal(app.grid.getNode('world'), before);
});

test('rehydrate replaces a node the adopted save changed', () => {
  const app = fakeApp();
  const before = app.grid.getNode('world');

  rehydrateCampaign(app, campaignNamed('After'));

  const after = app.grid.getNode('world');
  assert.notEqual(after, before);
  assert.equal(after?.name, 'After');
});

test('rehydrate keeps the live entities that the adopted save did not change', () => {
  const app = fakeApp();
  app.state.encounters = [
    { id: 'e1', name: 'Goblin Scout', hp: { current: 7, max: 7 } },
    { id: 'e2', name: 'Orc Brute', hp: { current: 15, max: 15 } },
  ];
  const before = app.state.encounters;
  const next = campaignNamed('After');
  next.encounters = JSON.parse(JSON.stringify(before));

  rehydrateCampaign(app, next);

  assert.equal(app.state.encounters, before);
});

test('rehydrate replaces only the entity that changed', () => {
  const app = fakeApp();
  app.state.encounters = [
    { id: 'e1', name: 'Goblin Scout', hp: { current: 7, max: 7 } },
    { id: 'e2', name: 'Orc Brute', hp: { current: 15, max: 15 } },
  ];
  const before = app.state.encounters;
  const next = campaignNamed('After');
  next.encounters = JSON.parse(JSON.stringify(before));
  next.encounters[1].hp.current = 9;

  rehydrateCampaign(app, next);

  assert.notEqual(app.state.encounters, before);
  assert.equal(app.state.encounters[0], before[0]);
  assert.equal(app.state.encounters[1].hp.current, 9);
});

test('rehydrate throws rather than half-applying an unusable party position', () => {
  const app = fakeApp();
  const next = campaignNamed('After');
  next.party = { nodeId: 'nowhere', tileId: '0,0' };

  assert.throws(() => rehydrateCampaign(app, next));
});

test('a revealed tile survives the swap, so fog is not re-fogged by adopting', () => {
  const app = fakeApp();
  const next = campaignNamed('After');
  const node = /** @type {import('../src/types/map.js').MapNode} */ (next.grid.getNode('world'));
  next.grid.updateNode(setTile(node, { ...createTile('3,3', 'grass.png'), revealed: true }));

  rehydrateCampaign(app, next);

  assert.equal(app.grid.getNode('world')?.tiles.find((t) => t.id === '3,3')?.revealed, true);
});
