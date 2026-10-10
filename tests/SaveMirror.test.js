import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { storedAssetTable, useAssetBackend } from '../src/storage/AssetMirror.js';
import { createMemoryBackend } from './helpers/memoryAssets.js';
import { ASSETS_KEY } from '../src/storage/AssetStore.js';
import { buildState } from '../src/storage/SaveManager.js';
import {
  SAVE_MARK_KEY,
  STORAGE_KEY,
  loadFromLocalStorage,
  trySaveToLocalStorage,
} from '../src/storage/SaveStorage.js';
import {
  clearHistoryLog,
  replaceIsUndoable,
  saveCampaign,
  undoCampaign,
} from '../src/storage/HistoryLog.js';
import { loadPersistedCampaign } from '../src/storage/PersistedCampaign.js';
import { TileGrid, createTile } from '../src/map/TileGrid.js';
import { installLocalStorage, installQuotaStorage } from './helpers/env.js';

const PHOTO = `data:image/png;base64,${'Q'.repeat(20_000)}`;

/**
 * A one-node campaign with one handout.
 * @param {string | null} image
 * @param {string} [title]
 * @returns {any}
 */
function world(image, title = 'Map') {
  const grid = new TileGrid();
  grid.addNode({
    id: 'n',
    name: 'n',
    parentId: null,
    width: 1,
    height: 1,
    tiles: [createTile('0,0', 'assets/tiles/grass/grass-1.svg')],
  });
  return buildState({ grid, handouts: [{ id: 'h1', title, body: '', image, revealed: false }] });
}

/** @type {ReturnType<typeof createMemoryBackend>} */
let backend;
beforeEach(() => {
  installLocalStorage();
  backend = createMemoryBackend();
  useAssetBackend(backend);
});
afterEach(() => useAssetBackend(null));

/**
 * Save the way the app does: again once a pending put settles.
 * @param {any} state
 */
async function save(state) {
  const first = saveCampaign(state);
  if (!first.pending) return first;
  await first.pending;
  return saveCampaign(state);
}

test('a save that adds an image writes nothing until the put commits', async () => {
  saveCampaign(world(null));
  const mark = localStorage.getItem(SAVE_MARK_KEY);
  const before = localStorage.getItem(STORAGE_KEY);
  const result = saveCampaign(world(PHOTO));
  assert.ok(result.pending);
  assert.equal(result.ok, false);
  assert.equal(localStorage.getItem(STORAGE_KEY), before, 'the campaign stays as it was');
  assert.equal(localStorage.getItem(SAVE_MARK_KEY), mark, 'and so does the save mark');
  assert.equal(await result.pending, true);
  const again = saveCampaign(world(PHOTO));
  assert.equal(again.pending, undefined);
  assert.equal(again.ok, true);
  assert.equal(again.assetsOk, true);
  assert.equal(localStorage.getItem(ASSETS_KEY), null, 'no image in localStorage');
  assert.equal(localStorage.getItem(STORAGE_KEY)?.includes('data:image'), false);
  assert.deepEqual([...backend.store.values()], [PHOTO]);
});

test('a stored campaign loads its images from the copy', async () => {
  await save(world(PHOTO));
  assert.equal(/** @type {any} */ (loadFromLocalStorage()).handouts[0].image, PHOTO);
  assert.equal(/** @type {any} */ (loadPersistedCampaign()).handouts[0].image, PHOTO);
});

test('a refused put still stores the campaign and reports the images', async () => {
  backend.putMany = async () => {
    throw new Error('QuotaExceededError');
  };
  const result = await save(world(PHOTO));
  assert.equal(result.ok, true);
  assert.equal(result.assetsOk, false);
  assert.equal(localStorage.getItem(STORAGE_KEY)?.includes('asset:'), true);
});

test('Undo of an image delete restores it from the copy', async () => {
  await save(world(PHOTO));
  await save(world(null));
  assert.deepEqual(Object.values(storedAssetTable()), [PHOTO], 'the history step keeps it');
  const undone = /** @type {any} */ (undoCampaign());
  assert.equal(undone.save.pending, undefined, 'no put is needed');
  assert.equal(undone.state.handouts[0].image, PHOTO);
});

test('an image that nothing references leaves the copy and the backend', async () => {
  await save(world(PHOTO));
  await save(world(null));
  clearHistoryLog();
  trySaveToLocalStorage(world(null, 'Renamed'));
  assert.deepEqual(storedAssetTable(), {});
  assert.equal(backend.store.size, 0);
});

test('a replace does not count images against localStorage while IndexedDB keeps them', async () => {
  await save(world(null));
  // The photo alone passes the localStorage quota, and it goes to IndexedDB.
  const big = `data:image/png;base64,${'Z'.repeat(2_700_000)}`;
  assert.equal(replaceIsUndoable(world(big)), true);
  useAssetBackend(null);
  assert.equal(replaceIsUndoable(world(big)), false, 'the localStorage path counts it');
});

test('a campaign write that needs room retries without writing images to localStorage', async () => {
  const store = installQuotaStorage(3_000);
  useAssetBackend(backend);
  let freed = false;
  const result = trySaveToLocalStorage(world(null), STORAGE_KEY, {
    makeRoom: () => {
      if (freed) return false;
      freed = true;
      store.delete('filler');
      return true;
    },
  });
  assert.equal(result.ok, true);
  store.set('filler', 'x'.repeat(2_900));
  const failed = trySaveToLocalStorage(world(null, 'Longer title'), STORAGE_KEY, {
    makeRoom: () => false,
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.nearQuota, true);
  assert.equal(store.has(ASSETS_KEY), false);
});
