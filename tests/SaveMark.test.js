import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { redoCampaign, saveCampaign, undoCampaign } from '../src/storage/HistoryLog.js';
import { loadPersistedCampaign } from '../src/storage/PersistedCampaign.js';
import {
  SAVE_MARK_KEY,
  STORAGE_KEY,
  buildState,
  readSaveMark,
  serialize,
  writeSaveMark,
} from '../src/storage/SaveManager.js';
import { TileGrid, createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { installLocalStorage } from './helpers/env.js';

beforeEach(installLocalStorage);

/** A one-node state with the given quest title. */
function state(/** @type {string} */ title) {
  const grid = new TileGrid();
  grid.addNode(
    setTile(createMapNode('world', 'World', null, 1, 1), createTile('0,0', 'grass.svg')),
  );
  return buildState({ grid, quests: [{ id: 'q1', title, done: false }] });
}

/**
 * Run `fn` and count the reads of the campaign key.
 * @param {() => void} fn
 */
function saveReads(fn) {
  const getItem = localStorage.getItem;
  let reads = 0;
  localStorage.getItem = (key) => {
    if (key === STORAGE_KEY) reads += 1;
    return getItem(key);
  };
  try {
    fn();
  } finally {
    localStorage.getItem = getItem;
  }
  return reads;
}

test('a save returns the mark it wrote, and the next read skips the save string', () => {
  const saved = state('A');
  const result = saveCampaign(saved);
  assert.equal(result.mark, readSaveMark());
  assert.ok(result.mark);
  assert.equal(
    saveReads(() => assert.equal(loadPersistedCampaign(), saved)),
    0,
  );
});

test('a new mark from another tab makes the next read parse the save', () => {
  saveCampaign(state('A'));
  localStorage.setItem(STORAGE_KEY, serialize(state('B')));
  localStorage.setItem(SAVE_MARK_KEY, 'other-tab');
  const loaded = /** @type {any} */ (loadPersistedCampaign());
  assert.equal(loaded.quests[0].title, 'B');
  assert.equal(
    saveReads(() => loadPersistedCampaign()),
    0,
    'the new mark is cached',
  );
});

test('a missing mark falls back to the save string', () => {
  const saved = state('A');
  saveCampaign(saved);
  localStorage.removeItem(SAVE_MARK_KEY);
  assert.equal(
    saveReads(() => assert.equal(loadPersistedCampaign(), saved)),
    1,
  );
  localStorage.setItem(STORAGE_KEY, serialize(state('B')));
  assert.equal(/** @type {any} */ (loadPersistedCampaign()).quests[0].title, 'B');
});

test('a save removes the mark before it writes the campaign', () => {
  saveCampaign(state('A'));
  /** @type {string[]} */
  const writes = [];
  const { setItem, removeItem } = localStorage;
  localStorage.setItem = (key, value) => {
    writes.push(`set ${key}`);
    setItem(key, value);
  };
  localStorage.removeItem = (key) => {
    writes.push(`remove ${key}`);
    removeItem(key);
  };
  saveCampaign(state('B'));
  Object.assign(localStorage, { setItem, removeItem });
  assert.ok(writes.indexOf(`remove ${SAVE_MARK_KEY}`) < writes.indexOf(`set ${STORAGE_KEY}`));
  assert.equal(writes.at(-1), `set ${SAVE_MARK_KEY}`);
});

test('a mark that cannot be written is removed, and the save reports none', () => {
  saveCampaign(state('A'));
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === SAVE_MARK_KEY) throw new Error('QuotaExceededError');
    setItem(key, value);
  };
  const result = saveCampaign(state('B'));
  assert.equal(result.ok, true);
  assert.equal(result.mark, null);
  assert.equal(writeSaveMark(), null);
  localStorage.setItem = setItem;
  assert.equal(readSaveMark(), null);
});

test('a failed campaign write reports no mark', () => {
  saveCampaign(state('A'));
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === STORAGE_KEY) throw new Error('QuotaExceededError');
    setItem(key, value);
  };
  const result = saveCampaign(state('B'));
  localStorage.setItem = setItem;
  assert.equal(result.ok, false);
  assert.equal(result.mark, null);
});

test('undo and redo cache the mark they write', () => {
  saveCampaign(state('A'));
  saveCampaign(state('B'));
  const undone = undoCampaign();
  assert.equal(
    saveReads(() => assert.equal(loadPersistedCampaign(), undone?.state)),
    0,
  );
  const redone = redoCampaign();
  assert.equal(
    saveReads(() => assert.equal(loadPersistedCampaign(), redone?.state)),
    0,
  );
});
