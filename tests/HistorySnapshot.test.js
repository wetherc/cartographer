import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_KEY,
  historyDepth,
  historyPosition,
  planAdoption,
  redoCampaign,
  saveCampaign,
  undoCampaign,
} from '../src/storage/HistoryLog.js';
import { buildState, loadFromLocalStorage } from '../src/storage/SaveManager.js';
import { TileGrid, createTile } from '../src/map/TileGrid.js';
import { installLocalStorage } from './helpers/env.js';

const SAVE_KEY = 'campaign-builder:save';
const PAYLOAD = 'data:image/png;base64,AAAA';

/**
 * A one-node campaign with one handout per title. A campaign built from other
 * titles and another node id shares nothing with it, as an import does.
 * @param {string} nodeId
 * @param {string[]} titles
 * @param {string | null} [image]
 * @returns {any}
 */
function world(nodeId, titles, image = null) {
  const grid = new TileGrid();
  grid.addNode({
    id: nodeId,
    name: nodeId,
    parentId: null,
    width: 2,
    height: 2,
    tiles: ['0,0', '1,0', '0,1', '1,1'].map((id) =>
      createTile(id, 'assets/tiles/grass/grass-1.svg'),
    ),
  });
  const handouts = titles.map((title, i) => ({
    id: `h${i}`,
    title,
    body: 'text '.repeat(40),
    image: i === 0 ? image : null,
    revealed: false,
  }));
  return buildState({ grid, handouts });
}

/** The stored index record. */
function storedIndex() {
  return JSON.parse(/** @type {string} */ (localStorage.getItem(HISTORY_KEY)));
}

/** The raw text of the record at the given position of the index. */
function recordAt(/** @type {number} */ at) {
  return localStorage.getItem(`${HISTORY_KEY}:d${storedIndex().deltas[at]}`) ?? '';
}

/** The handout titles and the first node id of the persisted campaign. */
function persisted() {
  const loaded = /** @type {any} */ (loadFromLocalStorage());
  return {
    node: loaded.nodes[0].id,
    titles: loaded.handouts.map((/** @type {any} */ h) => h.title),
  };
}

/** Saves a first campaign, then replaces it with a second one. */
function replaceOnce() {
  saveCampaign(world('old', ['A', 'B', 'C']));
  const oldRaw = localStorage.getItem(SAVE_KEY);
  const result = saveCampaign(world('new', ['X', 'Y', 'Z']));
  return { oldRaw, result };
}

beforeEach(installLocalStorage);

test('a replacing save records the old save string as a snapshot', () => {
  const { oldRaw, result } = replaceOnce();
  assert.deepEqual(result.history, { ok: true, evictedAll: false });
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 });
  assert.equal(recordAt(0), `snapshot:${oldRaw}`);
});

test('a small edit keeps a delta record', () => {
  saveCampaign(world('old', ['A', 'B', 'C']));
  saveCampaign(world('old', ['A', 'B', 'D']));
  assert.equal(recordAt(0).startsWith('['), true);
});

test('undo and redo swap a snapshot with the current save', () => {
  replaceOnce();
  const newRaw = localStorage.getItem(SAVE_KEY);
  const undone = /** @type {any} */ (undoCampaign());
  assert.equal(undone.save.ok, true);
  assert.deepEqual(persisted(), { node: 'old', titles: ['A', 'B', 'C'] });
  assert.deepEqual(historyDepth(), { undo: 0, redo: 1 });
  assert.equal(recordAt(0), `snapshot:${newRaw}`, 'the record now holds the replacing save');
  redoCampaign();
  assert.deepEqual(persisted(), { node: 'new', titles: ['X', 'Y', 'Z'] });
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 });
  undoCampaign();
  assert.deepEqual(persisted(), { node: 'old', titles: ['A', 'B', 'C'] }, 'and again');
});

test('a swap leaves exactly one record for the step', () => {
  const store = installLocalStorage();
  replaceOnce();
  undoCampaign();
  const records = [...store.keys()].filter((key) => key.startsWith(`${HISTORY_KEY}:d`));
  assert.deepEqual(records, [`${HISTORY_KEY}:d${storedIndex().deltas[0]}`]);
});

test('undo across a replace keeps the images of the replaced campaign', () => {
  saveCampaign(world('old', ['A'], PAYLOAD));
  saveCampaign(world('new', ['X', 'Y', 'Z']));
  // An ordinary save after the replace prunes the payload table again.
  saveCampaign(world('new', ['X', 'Y', 'W']));
  undoCampaign();
  undoCampaign();
  const loaded = /** @type {any} */ (loadFromLocalStorage());
  assert.equal(loaded.handouts[0].image, PAYLOAD);
  // Redo leaves the image-free campaign, and a second undo still finds the image.
  redoCampaign();
  saveCampaign(world('new', ['X', 'Y', 'Z', 'V']));
  undoCampaign();
  undoCampaign();
  assert.equal(/** @type {any} */ (loadFromLocalStorage()).handouts[0].image, PAYLOAD);
});

test('a snapshot undo restores a campaign from under an unreadable save', () => {
  replaceOnce();
  localStorage.setItem(SAVE_KEY, 'not json');
  assert.ok(undoCampaign());
  assert.deepEqual(persisted(), { node: 'old', titles: ['A', 'B', 'C'] });
  assert.equal(recordAt(0), 'snapshot:not json', 'redo returns to what was stored');
});

test('a snapshot step with no stored save does nothing', () => {
  replaceOnce();
  localStorage.removeItem(SAVE_KEY);
  assert.equal(undoCampaign(), null);
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 });
});

test('an unreadable snapshot drops the log', () => {
  replaceOnce();
  localStorage.setItem(`${HISTORY_KEY}:d${storedIndex().deltas[0]}`, 'snapshot:not json');
  assert.equal(undoCampaign(), null);
  assert.equal(localStorage.getItem(HISTORY_KEY), null);
  assert.deepEqual(persisted(), { node: 'new', titles: ['X', 'Y', 'Z'] });
});

test('a snapshot undo whose campaign write fails leaves the cursor where it was', () => {
  replaceOnce();
  const realSetItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === SAVE_KEY) throw new Error('QuotaExceededError');
    realSetItem(key, value);
  };
  const undone = /** @type {any} */ (undoCampaign());
  localStorage.setItem = realSetItem;
  assert.equal(undone.save.ok, false);
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 });
  assert.deepEqual(persisted(), { node: 'new', titles: ['X', 'Y', 'Z'] });
});

/**
 * Runs `action` with every write of a new history record refused.
 * @template T
 * @param {() => T} action
 * @returns {T}
 */
function withRecordWritesRefused(action) {
  const known = new Set(storedIndex().deltas);
  const realSetItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    const seq = Number(key.slice(`${HISTORY_KEY}:d`.length));
    if (key.startsWith(`${HISTORY_KEY}:d`) && !known.has(seq))
      throw new Error('QuotaExceededError');
    realSetItem(key, value);
  };
  try {
    return action();
  } finally {
    localStorage.setItem = realSetItem;
  }
}

test('an undo that cannot store the swapped record keeps the older steps only', () => {
  saveCampaign(world('old', ['A', 'B', 'C']));
  saveCampaign(world('old', ['A', 'B', 'D']));
  saveCampaign(world('new', ['X', 'Y', 'Z']));
  saveCampaign(world('new', ['X', 'Y', 'W']));
  undoCampaign();
  assert.deepEqual(historyDepth(), { undo: 2, redo: 1 });
  withRecordWritesRefused(() => undoCampaign());
  assert.deepEqual(persisted(), { node: 'old', titles: ['A', 'B', 'D'] });
  assert.deepEqual(historyDepth(), { undo: 1, redo: 0 }, 'the redo side is gone');
  undoCampaign();
  assert.deepEqual(persisted(), { node: 'old', titles: ['A', 'B', 'C'] });
});

test('a redo that cannot store the swapped record keeps the newer steps only', () => {
  saveCampaign(world('old', ['A', 'B', 'C']));
  saveCampaign(world('new', ['X', 'Y', 'Z']));
  saveCampaign(world('new', ['X', 'Y', 'W']));
  undoCampaign();
  undoCampaign();
  withRecordWritesRefused(() => redoCampaign());
  assert.deepEqual(persisted(), { node: 'new', titles: ['X', 'Y', 'Z'] });
  assert.deepEqual(historyDepth(), { undo: 0, redo: 1 }, 'the undo side is gone');
  redoCampaign();
  assert.deepEqual(persisted(), { node: 'new', titles: ['X', 'Y', 'W'] });
});

test('an index write that fails after a step clears the log', () => {
  for (const setup of [
    replaceOnce,
    () => {
      saveCampaign(world('old', ['A', 'B', 'C']));
      saveCampaign(world('old', ['A', 'B', 'D']));
    },
  ]) {
    installLocalStorage();
    setup();
    const realSetItem = localStorage.setItem;
    localStorage.setItem = (key, value) => {
      if (key === HISTORY_KEY) throw new Error('QuotaExceededError');
      realSetItem(key, value);
    };
    assert.ok(undoCampaign());
    localStorage.setItem = realSetItem;
    assert.equal(localStorage.getItem(HISTORY_KEY), null);
    assert.deepEqual(historyDepth(), { undo: 0, redo: 0 });
  }
});

test('a follower falls back to a full read across a snapshot', () => {
  saveCampaign(world('old', ['A', 'B', 'C']));
  saveCampaign(world('old', ['A', 'B', 'D']));
  const held = historyPosition();
  saveCampaign(world('new', ['X', 'Y', 'Z']));
  assert.deepEqual(planAdoption(held), { kind: 'full' });
});
