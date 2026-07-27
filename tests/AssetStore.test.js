import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSETS_KEY,
  detachAssets,
  loadAssetTable,
  persistAssets,
  pruneAssets,
} from '../src/storage/AssetStore.js';
import { hoistAssets, referencedAssetKeys } from '../src/storage/Assets.js';
import {
  buildState,
  deserialize,
  loadFromLocalStorage,
  serialize,
  trySaveToLocalStorage,
} from '../src/storage/SaveManager.js';
import { saveCampaign, undoCampaign } from '../src/storage/HistoryLog.js';
import { TileGrid, createTile } from '../src/map/TileGrid.js';

const PAYLOAD = 'data:image/png;base64,AAAA';

/** Minimal in-memory localStorage so the storage wrappers run under Node. */
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

/** A one-node campaign carrying `image` on a handout. */
function stateWithHandoutImage(image = PAYLOAD) {
  const grid = new TileGrid();
  grid.addNode({
    id: 'world',
    name: 'World',
    parentId: null,
    width: 1,
    height: 1,
    tiles: [createTile('0,0', 'assets/tiles/grass/grass-1.svg')],
  });
  return buildState(grid, null, [], [], [], [], {
    handouts: [{ id: 'h1', title: 'Map', body: '', image, revealed: false }],
  });
}

test('detachAssets splits the table off and leaves the state otherwise intact', () => {
  const hoisted = hoistAssets({ handouts: [{ id: 'h1', image: PAYLOAD }] });
  const { state, assets } = detachAssets(hoisted);
  assert.equal('assets' in state, false);
  assert.deepEqual(Object.values(assets), [PAYLOAD]);
  assert.equal(state.handouts[0].image.startsWith('asset:'), true);
});

test('detachAssets on a save with no table returns it unchanged', () => {
  const state = { nodes: [], handouts: [] };
  const result = detachAssets(state);
  assert.equal(result.state, state, 'the same object, so an image-free save allocates nothing');
  assert.deepEqual(result.assets, {});
});

test('detachAssets drops a stored table whose entries are not payloads', () => {
  const { assets } = detachAssets({ assets: { a: PAYLOAD, b: 7, c: null } });
  assert.deepEqual(assets, { a: PAYLOAD });
});

test('referencedAssetKeys finds a key in an encoded node palette and in a handout', () => {
  const json = JSON.stringify({
    nodes: [{ id: 'n', refs: [['asset:abc', null]], cells: [0] }],
    handouts: [{ id: 'h', image: 'asset:def~1' }],
  });
  assert.deepEqual([...referencedAssetKeys(json)].sort(), ['abc', 'def~1']);
});

test('referencedAssetKeys ignores a built-in ref that merely looks like one', () => {
  assert.deepEqual([...referencedAssetKeys('"assets/tiles/grass/grass-1.svg"')], []);
});

test('pruneAssets keeps only entries some stored string references', () => {
  const table = { aaa: PAYLOAD, bbb: PAYLOAD, ccc: PAYLOAD };
  const kept = pruneAssets(table, ['{"image":"asset:aaa"}', '{"refs":["asset:ccc"]}']);
  assert.deepEqual(Object.keys(kept).sort(), ['aaa', 'ccc']);
});

beforeEach(installLocalStorage);

test('a stored save keeps its payloads out of the campaign key', () => {
  const state = stateWithHandoutImage();
  trySaveToLocalStorage(state);
  const stored = localStorage.getItem('campaign-builder:save') ?? '';
  assert.equal(stored.includes('data:image'), false, 'no payload in the campaign string');
  assert.equal(stored.includes('asset:'), true, 'the reference stays');
  assert.deepEqual(Object.values(loadAssetTable()), [PAYLOAD]);
});

test('a stored save round-trips its images through the sidecar', () => {
  trySaveToLocalStorage(stateWithHandoutImage());
  const loaded = /** @type {any} */ (loadFromLocalStorage());
  assert.equal(loaded.handouts[0].image, PAYLOAD);
});

test('an image-free campaign writes no sidecar key at all', () => {
  trySaveToLocalStorage(stateWithHandoutImage(null));
  assert.equal(localStorage.getItem(ASSETS_KEY), null);
});

test('an exported save stays self-contained and needs no sidecar', () => {
  const state = stateWithHandoutImage();
  const exported = serialize(state);
  assert.equal(exported.includes('data:image'), true);
  assert.equal(deserialize(exported).handouts[0].image, PAYLOAD);
});

test("a save's own table wins over the sidecar", () => {
  const other = 'data:image/png;base64,BBBB';
  localStorage.setItem(ASSETS_KEY, JSON.stringify({ x: other }));
  const state = stateWithHandoutImage();
  // The exported form carries its own table, so supplying a stale sidecar
  // alongside it must not change what loads.
  const loaded = deserialize(serialize(state), loadAssetTable());
  assert.equal(loaded.handouts[0].image, PAYLOAD);
  assert.notEqual(loaded.handouts[0].image, other);
});

test('an undone image travels in the history step, not the payload table', () => {
  saveCampaign(stateWithHandoutImage());
  saveCampaign(stateWithHandoutImage(null));
  // A delta is computed over parsed state, where the payload is still inline, so
  // the step that removed the image carries it as its own before-value. Nothing
  // stored references the table key any more, so it is correctly dropped.
  assert.equal(localStorage.getItem(ASSETS_KEY), null);
  const undone = /** @type {any} */ (undoCampaign());
  assert.equal(undone.state.handouts[0].image, PAYLOAD, 'the undone state has its image back');
  assert.deepEqual(Object.values(loadAssetTable()), [PAYLOAD], 're-hoisted by the write');
});

test('a payload nothing references any more is dropped', () => {
  trySaveToLocalStorage(stateWithHandoutImage());
  // No history push, so nothing references the payload once the campaign key has
  // stopped doing so — and the save being replaced does not count, or a payload
  // would linger a cycle past its last reference.
  trySaveToLocalStorage(stateWithHandoutImage(null));
  assert.equal(localStorage.getItem(ASSETS_KEY), null);
});

test('a full origin can lose the images and still store the campaign', () => {
  const state = stateWithHandoutImage();
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === ASSETS_KEY) throw new Error('QuotaExceededError');
    setItem(key, value);
  };
  const result = trySaveToLocalStorage(state);
  localStorage.setItem = setItem;
  assert.equal(result.ok, true, 'the campaign landed');
  assert.equal(result.assetsOk, false, 'and the failure is reported, not silent');
  const loaded = /** @type {any} */ (loadFromLocalStorage());
  assert.equal(loaded.nodes.length, 1, 'structure survived');
  assert.equal(loaded.handouts[0].image.startsWith('asset:'), true, 'the image did not');
});

test('a corrupt sidecar reads as no images rather than throwing', () => {
  trySaveToLocalStorage(stateWithHandoutImage());
  localStorage.setItem(ASSETS_KEY, 'not json');
  assert.deepEqual(loadAssetTable(), {});
  assert.doesNotThrow(() => loadFromLocalStorage());
});

test('persistAssets leaves an untouched origin alone when there is nothing to store', () => {
  assert.equal(persistAssets({}, '{}'), true);
  assert.equal(localStorage.getItem(ASSETS_KEY), null);
});
