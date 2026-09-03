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
  packState,
  serialize,
  trySaveToLocalStorage,
} from '../src/storage/SaveManager.js';
import { saveCampaign, undoCampaign } from '../src/storage/HistoryLog.js';
import { TileGrid, createTile } from '../src/map/TileGrid.js';
import { installLocalStorage } from './helpers/env.js';

const PAYLOAD = 'data:image/png;base64,AAAA';

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
  return buildState({
    grid,
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

test('a sidecar stored as a list reads as no images', () => {
  // The table is a record of keys to payloads. A list has no keys to look a
  // reference up by, so it is unusable rather than merely odd.
  localStorage.setItem(ASSETS_KEY, JSON.stringify([PAYLOAD]));
  assert.deepEqual(loadAssetTable(), {});
  assert.deepEqual(detachAssets({ assets: [PAYLOAD] }).assets, {});
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

/**
 * Persist the images of `state` as a save would, counting sidecar writes and
 * the reads of every other stored string. The footprint ledger is not in
 * play here, so a read means the retention scan ran.
 */
function sidecarTraffic(state) {
  const { state: detached, assets } = detachAssets(packState(state));
  const json = JSON.stringify(detached);
  const fn = () => persistAssets(assets, json, ['campaign-builder:save']);
  const setItem = localStorage.setItem;
  const getItem = localStorage.getItem;
  let writes = 0;
  let reads = 0;
  localStorage.setItem = (key, value) => {
    if (key === ASSETS_KEY) writes += 1;
    setItem(key, value);
  };
  localStorage.getItem = (key) => {
    if (key !== ASSETS_KEY && key !== 'campaign-builder:save') reads += 1;
    return getItem(key);
  };
  try {
    fn();
  } finally {
    localStorage.setItem = setItem;
    localStorage.getItem = getItem;
  }
  return { writes, reads };
}

test('a repeat save with the same images neither scans nor rewrites the sidecar', () => {
  const state = stateWithHandoutImage();
  trySaveToLocalStorage(state);
  localStorage.setItem('campaign-builder:library', '{"spells":[]}');
  const stored = localStorage.getItem(ASSETS_KEY);
  const traffic = sidecarTraffic(state);
  assert.equal(traffic.writes, 0, 'the table is not written again');
  assert.equal(traffic.reads, 0, 'no other stored string is scanned');
  assert.equal(localStorage.getItem(ASSETS_KEY), stored);
});

test('a new history record does not trigger a scan, a dropped one does', () => {
  const state = stateWithHandoutImage();
  localStorage.setItem('campaign-builder:history:d6', '[]');
  trySaveToLocalStorage(state);
  // A record that appears after the scan could only add a reference, and a
  // reference already kept needs no rescan.
  localStorage.setItem('campaign-builder:history:d7', '[]');
  assert.equal(sidecarTraffic(state).reads, 0);
  // A record the scan saw is gone, so a reference it held may be gone too.
  localStorage.removeItem('campaign-builder:history:d6');
  const traffic = sidecarTraffic(state);
  assert.ok(traffic.reads > 0, 'a missing key means a reference may be gone');
  assert.equal(traffic.writes, 0, 'the kept table equals the stored one, so no write');
});

test('a table another tab replaced is scanned and rewritten', () => {
  const state = stateWithHandoutImage();
  trySaveToLocalStorage(state);
  localStorage.setItem(ASSETS_KEY, JSON.stringify({ stale: 'data:image/png;base64,ZZZZ' }));
  const traffic = sidecarTraffic(state);
  assert.equal(traffic.writes, 1);
  assert.deepEqual(Object.values(loadAssetTable()), [PAYLOAD]);
});

test('a save whose key names a different payload rewrites the table', () => {
  const other = 'data:image/png;base64,BBBB';
  const collide = () => 'same';
  const first = hoistAssets({ handouts: [{ id: 'h1', image: PAYLOAD }] }, collide);
  const second = hoistAssets({ handouts: [{ id: 'h1', image: other }] }, collide);
  const json = (s) => JSON.stringify(detachAssets(s).state);
  persistAssets(detachAssets(first).assets, json(first));
  assert.deepEqual(loadAssetTable(), { same: PAYLOAD });
  persistAssets(detachAssets(second).assets, json(second));
  assert.deepEqual(loadAssetTable(), { same: other });
  const stored = localStorage.getItem(ASSETS_KEY);
  persistAssets(detachAssets(second).assets, json(second));
  assert.equal(localStorage.getItem(ASSETS_KEY), stored, 'the same payload again is a no-op');
});

test('a failed sidecar write is retried on the next save', () => {
  const state = stateWithHandoutImage();
  const setItem = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === ASSETS_KEY) throw new Error('QuotaExceededError');
    setItem(key, value);
  };
  assert.equal(trySaveToLocalStorage(state).assetsOk, false);
  localStorage.setItem = setItem;
  assert.equal(trySaveToLocalStorage(state).assetsOk, true);
  assert.deepEqual(Object.values(loadAssetTable()), [PAYLOAD]);
});
