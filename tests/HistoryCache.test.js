import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveCampaign } from '../src/storage/HistoryLog.js';
import {
  adoptPersisted,
  loadPersistedCampaign,
  persistedSave,
} from '../src/storage/PersistedCampaign.js';
import { buildState, deserialize, serialize, toTileGrid } from '../src/storage/SaveManager.js';
import { loadFromLocalStorage, trySaveToLocalStorage } from '../src/storage/SaveStorage.js';
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

test('adoptPersisted makes the live state the base of the next diff', () => {
  const state = freshState();
  saveCampaign(state);
  // Another tab writes an equal campaign, and this tab adopts it with the
  // objects it already holds.
  const raw = serialize(deserialize(serialize(state)));
  localStorage.setItem('campaign-builder:save', raw);
  localStorage.setItem('campaign-builder:save-mark', 'other-tab');
  assert.deepEqual(adoptPersisted(state), { raw, mark: 'other-tab' });
  assert.equal(loadPersistedCampaign(), state, 'the cache keeps the live objects');
  const edited = { ...state, quests: [{ ...state.quests[0], done: true }] };
  assert.equal(
    parsesOf(raw, () => saveCampaign(edited)),
    0,
    'the save parses nothing',
  );
});

test('adoptPersisted with nothing stored leaves no cache', () => {
  const state = freshState();
  assert.deepEqual(adoptPersisted(state), { raw: null, mark: null });
  assert.equal(loadPersistedCampaign(), null);
});

test('persistedSave names the string and the mark of the cached state', () => {
  adoptPersisted(freshState());
  assert.equal(persistedSave(), null, 'nothing stored leaves nothing cached');
  const saved = saveCampaign(freshState());
  assert.deepEqual(persistedSave(), {
    raw: saved.json,
    mark: localStorage.getItem('campaign-builder:save-mark'),
  });
  // A save that another tab wrote, then read through the cache.
  const other = trySaveToLocalStorage(freshState());
  localStorage.setItem('campaign-builder:save-mark', 'other-tab');
  loadPersistedCampaign();
  assert.deepEqual(persistedSave(), { raw: other.json, mark: 'other-tab' });
});
