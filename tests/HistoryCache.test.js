import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadPersistedCampaign, saveCampaign } from '../src/storage/HistoryLog.js';
import {
  buildState,
  loadFromLocalStorage,
  toTileGrid,
  trySaveToLocalStorage,
} from '../src/storage/SaveManager.js';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { loadInitialCampaign } from '../src/campaign/Campaigns.js';
import { installLocalStorage } from './helpers/env.js';

beforeEach(installLocalStorage);

let serial = 0;

/** A one-node state with a quest title no other test in this file uses. */
function freshState(title = `quest ${(serial += 1)}`) {
  const grid = new TileGrid();
  let world = createMapNode('world', 'World', null, 2, 1);
  world = setTile(world, createTile('0,0', 'grass.svg'));
  grid.addNode(world);
  return buildState({
    grid,
    party: { nodeId: 'world', tileId: '0,0' },
    quests: [{ id: 'q1', title, done: false }],
  });
}

/**
 * Run `fn` while counting how many times `JSON.parse` sees `text`.
 * @param {string} text
 * @param {() => void} fn
 */
function parsesOf(text, fn) {
  const realParse = JSON.parse;
  let count = 0;
  JSON.parse = (/** @type {string} */ json, /** @type {any} */ reviver) => {
    if (json === text) count += 1;
    return realParse(json, reviver);
  };
  try {
    fn();
  } finally {
    JSON.parse = realParse;
  }
  return count;
}

test('loadPersistedCampaign returns null with nothing stored, else the parsed save', () => {
  assert.equal(loadPersistedCampaign(), null);
  const state = freshState();
  trySaveToLocalStorage(state);
  const loaded = /** @type {any} */ (loadPersistedCampaign());
  assert.deepEqual(loaded.nodes, state.nodes);
  assert.deepEqual(loaded.party, state.party);
  assert.equal(loaded.quests[0].title, state.quests[0].title);
});

test('a repeat load of the same stored string hands back the cached object', () => {
  const stored = trySaveToLocalStorage(freshState()).json;
  const first = loadPersistedCampaign();
  const parses = parsesOf(stored, () => {
    assert.equal(loadPersistedCampaign(), first);
  });
  assert.equal(parses, 0);
});

test('the first save after a load diffs against the loaded state without a re-parse', () => {
  const state = freshState();
  const stored = trySaveToLocalStorage(state).json;
  // A plain read does not seed the cache, so a save after it parses the
  // stored string once more to get its base.
  loadFromLocalStorage();
  const edited = { ...state, quests: [{ id: 'q1', title: 'renamed', done: false }] };
  assert.equal(
    parsesOf(stored, () => saveCampaign(edited)),
    1,
    'a cold history cache re-parses the save',
  );
  // Through the history log, the load itself is the parse, and the save
  // that follows finds its base already in memory.
  const again = freshState();
  const raw = trySaveToLocalStorage(again).json;
  const loaded = /** @type {any} */ (loadPersistedCampaign());
  const next = { ...loaded, quests: [{ id: 'q1', title: 'renamed again', done: false }] };
  assert.equal(
    parsesOf(raw, () => saveCampaign(next)),
    0,
    'a seeded cache needs no parse',
  );
  const reloaded = /** @type {any} */ (loadFromLocalStorage());
  assert.equal(reloaded.quests[0].title, 'renamed again');
});

test('an unreadable save throws from loadPersistedCampaign', () => {
  localStorage.setItem('campaign-builder:save', '{"nodes":[{"id":"w","tiles":5}],"classes":5');
  assert.throws(() => loadPersistedCampaign());
});

test('loadInitialCampaign holds the node objects the history cache holds', () => {
  trySaveToLocalStorage(freshState());
  const campaign = loadInitialCampaign();
  const persisted = /** @type {any} */ (loadPersistedCampaign());
  assert.equal(campaign.grid.getNode('world'), persisted.nodes[0]);
  assert.equal(campaign.characters, persisted.characters);
  assert.deepEqual(toTileGrid(persisted).getNode('world'), campaign.grid.getNode('world'));
});
