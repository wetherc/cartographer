import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBlankCampaign,
  buildExampleCampaign,
  campaignFromLiveState,
  isBlankCampaign,
  loadInitialCampaign,
  loadInitialCampaignSafe,
  partyOnGrid,
} from '../src/campaign/Campaigns.js';
import { TilePalette } from '../src/map/TilePalette.js';
import { TileGrid } from '../src/map/TileGrid.js';
import { createCharacter } from '../src/entities/Character.js';
import { installLocalStorage } from './helpers/env.js';
import { gridTiles } from './helpers/grid.js';
import { revealedCount } from '../src/map/FogOfWar.js';

beforeEach(installLocalStorage);

test('loadInitialCampaign boots a blank campaign when nothing is saved', () => {
  const campaign = loadInitialCampaign();
  assert.deepEqual(campaign, buildBlankCampaign());
});

test('loadInitialCampaign restores a save and default-fills fields older saves lack', () => {
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [{ id: 'world', name: 'World', parentId: null, width: 2, height: 2, tiles: [] }],
      party: { nodeId: 'world', tileId: '1,1' },
      characters: [createCharacter('c1', 'Hero')],
      encounters: [],
      // No travelog/quests/clock/npcs/handouts/bestiary: a pre-feature save.
    }),
  );
  const campaign = loadInitialCampaign();
  assert.equal(campaign.grid.getNode('world').name, 'World');
  assert.deepEqual(campaign.party, { nodeId: 'world', tileId: '1,1' });
  assert.equal(campaign.characters[0].name, 'Hero');
  assert.ok(Array.isArray(campaign.characters[0].inventory), 'characters are default-filled');
  assert.deepEqual(campaign.travelog, []);
  assert.deepEqual(campaign.quests, []);
  assert.ok(campaign.clock, 'a missing clock is created, not left null');
  assert.deepEqual(campaign.creatures, []);
  assert.deepEqual(campaign.handouts, []);
  assert.deepEqual(campaign.bestiary, []);
  assert.deepEqual(campaign.entryTiles, {});
  assert.equal(campaign.splitParty, false);
  // No demo character is injected into an authored-empty roster.
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [{ id: 'world', name: 'World', parentId: null, width: 2, height: 2, tiles: [] }],
      party: null,
      characters: [],
      encounters: [],
    }),
  );
  assert.equal(loadInitialCampaign().characters.length, 0);
});

test('loadInitialCampaign passes through every present field of a full save', () => {
  const clock = { day: 3, watch: 4 };
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [{ id: 'world', name: 'World', parentId: null, width: 2, height: 2, tiles: [] }],
      party: { nodeId: 'world', tileId: '0,1' },
      characters: [createCharacter('c1', 'Hero')],
      encounters: [],
      travelog: [{ id: 'e1', text: 'moved', at: 1 }],
      quests: [{ id: 'q1', title: 'Find it', status: 'active', notes: '' }],
      clock,
      npcs: [{ id: 'n1', name: 'Barkeep', location: null, notes: '' }],
      handouts: [{ id: 'h1', title: 'Map', nodeId: null, revealed: false }],
      bestiary: [{ id: 'b1', name: 'Goblin' }],
      splitParty: true,
    }),
  );
  const campaign = loadInitialCampaign();
  assert.deepEqual(campaign.party, { nodeId: 'world', tileId: '0,1' });
  assert.equal(campaign.travelog.length, 1);
  assert.equal(campaign.quests[0].id, 'q1');
  assert.deepEqual(campaign.clock, clock);
  // The pre-merge save's npcs list migrates into the creatures list.
  assert.equal(campaign.creatures[0].name, 'Barkeep');
  assert.equal(campaign.handouts[0].title, 'Map');
  assert.equal(campaign.bestiary[0].id, 'b1');
  assert.equal(campaign.splitParty, true);
});

test('loadInitialCampaign keeps the entry memory and drops what names a missing node', () => {
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [
        { id: 'world', name: 'World', parentId: null, width: 2, height: 2, tiles: [] },
        { id: 'cave', name: 'Cave', parentId: 'world', width: 2, height: 2, tiles: [] },
      ],
      party: { nodeId: 'world', tileId: '0,0' },
      entryTiles: { party: { cave: '1,1', gone: '0,0' }, 'c:hero': { gone: '0,0' } },
    }),
  );
  assert.deepEqual(loadInitialCampaign().entryTiles, { party: { cave: '1,1' } });
});

test('loadInitialCampaignSafe falls back to a blank campaign when a save is unreadable', () => {
  // Any JSON record parses as a campaign, and one with no nodes has no map.
  localStorage.setItem('campaign-builder:save', JSON.stringify({ hello: 'world' }));
  assert.throws(loadInitialCampaign, 'the strict loader still reports the problem');
  const { campaign, navigator, partyTracker, failed } = loadInitialCampaignSafe();
  assert.equal(failed, true);
  assert.deepEqual(campaign, buildBlankCampaign());
  assert.equal(navigator.getCurrentNode().id, 'world');
  assert.equal(partyTracker.grid, campaign.grid, 'the tracker walks the fallback grid');
  assert.ok(
    localStorage.getItem('campaign-builder:save'),
    'the unreadable save is left alone, so Undo can still reach the one before it',
  );
});

test('loadInitialCampaignSafe reports success for a readable save', () => {
  const { campaign, failed } = loadInitialCampaignSafe();
  assert.equal(failed, false);
  assert.deepEqual(campaign, buildBlankCampaign());
});

test('blank campaign has no demo content', () => {
  const campaign = buildBlankCampaign();
  assert.equal(campaign.characters.length, 0);
  assert.equal(campaign.creatures.length, 0);
  assert.equal(campaign.quests.length, 0);
});

test('campaignFromLiveState wraps live objects without re-parsing or re-defaulting', () => {
  const source = buildExampleCampaign(new TilePalette());
  const nodes = [...source.grid.nodes.values()];
  const campaign = campaignFromLiveState({
    nodes,
    party: source.party,
    characters: source.characters,
    creatures: source.creatures,
    travelog: source.travelog,
    quests: source.quests,
    clock: source.clock,
    handouts: source.handouts,
    bestiary: source.bestiary,
    splitParty: source.splitParty,
    combat: source.combat,
  });
  for (const node of nodes) {
    assert.equal(campaign.grid.getNode(node.id), node, 'every node keeps its identity');
  }
  assert.equal(campaign.characters, source.characters);
  assert.equal(campaign.clock, source.clock);
  const bare = campaignFromLiveState({ nodes: [nodes[0]], party: null, clock: null, combat: null });
  assert.deepEqual(bare.party, { nodeId: nodes[0].id, tileId: '0,0' });
  assert.ok(bare.clock, 'a null clock gets a fresh one');
  assert.equal(bare.combat, null);
});

test('a campaign with one empty node and no characters is blank', () => {
  const grid = { nodes: new Map([['world', {}]]) };
  assert.equal(isBlankCampaign(grid, { tiles: [] }, []), true);
});

test('a painted tile, a second node, or a character makes the campaign not blank', () => {
  const oneNode = { nodes: new Map([['world', {}]]) };
  const twoNodes = {
    nodes: new Map([
      ['world', {}],
      ['town', {}],
    ]),
  };
  assert.equal(isBlankCampaign(oneNode, { tiles: [{}] }, []), false);
  assert.equal(isBlankCampaign(twoNodes, { tiles: [] }, []), false);
  assert.equal(isBlankCampaign(oneNode, { tiles: [] }, [{}]), false);
});

test('the blank campaign builder produces a blank campaign', () => {
  const campaign = buildBlankCampaign();
  const node = campaign.grid.getNode(campaign.party.nodeId);
  assert.ok(node);
  assert.equal(isBlankCampaign(campaign.grid, node, campaign.characters), true);
});

test('loadInitialCampaign moves a party on a missing node to the first root node', () => {
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [
        { id: 'cave', name: 'Cave', parentId: 'vale', width: 2, height: 2, tiles: [] },
        { id: 'vale', name: 'Vale', parentId: null, width: 2, height: 2, tiles: [] },
      ],
      party: { nodeId: 'world', tileId: '1,1' },
    }),
  );
  assert.deepEqual(loadInitialCampaign().party, { nodeId: 'vale', tileId: '0,0' });
  const { failed, navigator } = loadInitialCampaignSafe();
  assert.equal(failed, false);
  assert.equal(navigator.getCurrentNode().id, 'vale');
});

test('partyOnGrid keeps a party on a known node and throws on an empty grid', () => {
  const { grid } = buildBlankCampaign();
  const party = { nodeId: 'world', tileId: '2,1' };
  assert.equal(partyOnGrid(party, grid), party);
  assert.throws(() => partyOnGrid(null, new TileGrid()), /no map nodes/);
});

test('loadInitialCampaign boots a save with a parent loop and a malformed spellbook', () => {
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [
        { id: 'a', name: 'A', parentId: 'b', width: 2, height: 2, tiles: [] },
        { id: 'b', name: 'B', parentId: 'a', width: 2, height: 2, tiles: [] },
      ],
      party: { nodeId: 'a', tileId: '0,0' },
      characters: [{ id: 'c1', name: 'Hero', spellbook: 5 }],
    }),
  );
  const { campaign, navigator, failed } = loadInitialCampaignSafe();
  assert.equal(failed, false);
  assert.deepEqual(
    navigator.getBreadcrumb().map((n) => n.id),
    ['b', 'a'],
  );
  assert.deepEqual(campaign.characters[0].spellbook, { cantrips: [], known: [], prepared: [] });
});

test('loadInitialCampaignSafe gives the tracker the sight radius of the hour', () => {
  // A 7x7 region at Night (watch 5): sight 1 reveals the party tile and its
  // four neighbours. The fixed radius of 2 would reveal 13. The boot itself
  // reveals nothing, so the first reveal comes from the next move.
  const tiles = gridTiles(7, 7).map((t) => ({ ...t, revealed: false }));
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [
        { id: 'world', name: 'World', parentId: null, width: 2, height: 2, tiles: [] },
        { id: 'moor', name: 'Moor', parentId: 'world', width: 7, height: 7, tiles },
      ],
      party: { nodeId: 'moor', tileId: '3,3' },
      clock: { day: 1, watch: 5 },
    }),
  );
  const { campaign, partyTracker } = loadInitialCampaignSafe();
  assert.equal(revealedCount(/** @type {any} */ (campaign.grid.getNode('moor'))), 0);
  partyTracker.moveTo('moor', '3,3');
  assert.equal(revealedCount(/** @type {any} */ (campaign.grid.getNode('moor'))), 5);
});

test('loadInitialCampaignSafe places the party without clearing fog the GM hid', () => {
  const tile = (id, revealed) => ({
    id,
    imageRef: 'assets/tiles/grass/grass-1.svg',
    overlayRef: null,
    metadata: {},
    revealed,
    childNodeId: null,
  });
  localStorage.setItem(
    'campaign-builder:save',
    JSON.stringify({
      nodes: [
        {
          id: 'world',
          name: 'World',
          parentId: null,
          width: 4,
          height: 4,
          tiles: [tile('2,2', true), tile('2,3', false)],
        },
      ],
      party: { nodeId: 'world', tileId: '2,2' },
    }),
  );
  const { campaign, partyTracker, failed } = loadInitialCampaignSafe();
  assert.equal(failed, false);
  assert.deepEqual(partyTracker.getPosition(), { nodeId: 'world', tileId: '2,2' });
  assert.equal(revealedCount(/** @type {any} */ (campaign.grid.getNode('world'))), 1);
});

test('the example campaign starts with the fog cleared around the party', () => {
  const campaign = buildExampleCampaign(new TilePalette());
  const node = campaign.grid.getNode(campaign.party.nodeId);
  assert.equal(node?.tiles.find((t) => t.id === campaign.party.tileId)?.revealed, true);
});
