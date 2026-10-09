import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchAssets,
  missingAssetKeys,
  mirrorActive,
  openAssetMirror,
  pruneMirror,
  stageAssets,
  storedAssetTable,
  useAssetBackend,
  withStoredAssets,
} from '../src/storage/AssetMirror.js';
import { createMemoryBackend } from './helpers/memoryAssets.js';
import { ASSETS_KEY } from '../src/storage/AssetStore.js';
import { installLocalStorage } from './helpers/env.js';

const A = 'data:image/png;base64,AAAA';
const B = 'data:image/png;base64,BBBB';

/** @type {Map<string, string>} */
let store;
beforeEach(() => {
  store = installLocalStorage();
});
afterEach(() => useAssetBackend(null));

/** A memory backend that counts its calls. */
function counted(initial = {}) {
  const backend = createMemoryBackend(initial);
  const calls = { put: 0, del: 0 };
  const { putMany, deleteMany } = backend;
  backend.putMany = (entries) => ((calls.put += 1), putMany(entries));
  backend.deleteMany = (keys) => ((calls.del += 1), deleteMany(keys));
  return { backend, calls };
}

test('with no backend the table is the localStorage one, and staging does nothing', () => {
  store.set(ASSETS_KEY, JSON.stringify({ a: A }));
  assert.equal(mirrorActive(), false);
  assert.deepEqual(storedAssetTable(), { a: A });
  assert.deepEqual(stageAssets({ b: B }), { pending: null, assetsOk: true });
  assert.deepEqual(missingAssetKeys('"asset:b"'), []);
  pruneMirror('{}');
  assert.equal(store.has(ASSETS_KEY), true);
});

test('a committed payload stages at once, and a new one waits for its put', async () => {
  const { backend, calls } = counted({ a: A });
  useAssetBackend(backend, { a: A });
  assert.equal(mirrorActive(), true);
  assert.deepEqual(stageAssets({ a: A }), { pending: null, assetsOk: true });
  const staged = stageAssets({ a: A, b: B });
  assert.ok(staged.pending);
  assert.equal('b' in storedAssetTable(), false, 'not committed yet');
  // A second save while the put runs waits on the same put.
  const again = stageAssets({ b: B });
  assert.equal(await staged.pending, true);
  assert.equal(await again.pending, true);
  assert.equal(calls.put, 1);
  assert.equal(storedAssetTable().b, B);
  assert.equal(backend.store.get('b'), B);
});

test('a payload that differs under a known key is put again', async () => {
  const { backend } = counted({ a: A });
  useAssetBackend(backend, { a: A });
  const staged = stageAssets({ a: B });
  assert.equal(await staged.pending, true);
  assert.equal(storedAssetTable().a, B);
});

test('a refused put lets the next save write without it, and the save after retries', async () => {
  const { backend, calls } = counted();
  backend.putMany = async () => {
    calls.put += 1;
    throw new Error('QuotaExceededError');
  };
  useAssetBackend(backend);
  assert.equal(await stageAssets({ a: A }).pending, false);
  assert.deepEqual(stageAssets({ a: A }), { pending: null, assetsOk: false });
  assert.ok(stageAssets({ a: A }).pending, 'the next save tries the put again');
  assert.equal(calls.put, 2);
});

test('a put that throws before it starts counts as refused', async () => {
  const backend = createMemoryBackend();
  backend.putMany = () => {
    throw new Error('InvalidStateError');
  };
  useAssetBackend(backend);
  assert.equal(await stageAssets({ a: A }).pending, false);
  assert.equal(stageAssets({ a: A }).assetsOk, false);
});

test('a put that settles after the backend changed leaves the new tables alone', async () => {
  const old = createMemoryBackend();
  useAssetBackend(old);
  const staged = stageAssets({ a: A });
  const next = createMemoryBackend();
  useAssetBackend(next);
  assert.equal(await staged.pending, true);
  assert.deepEqual(storedAssetTable(), {});
});

test('pruneMirror removes a payload nothing references, and keeps one another key names', () => {
  const { backend, calls } = counted({ a: A, b: B });
  useAssetBackend(backend, { a: A, b: B });
  store.set('campaign-builder:history:d0', 'delta:[{"t":"asset:b"}]');
  pruneMirror('{"handouts":[]}');
  assert.deepEqual(Object.keys(storedAssetTable()), ['b']);
  assert.equal(calls.del, 1);
  assert.deepEqual([...backend.store.keys()], ['b']);
});

test('pruneMirror skips the scan until a reference or a stored key goes away', () => {
  const { backend } = counted({ b: B });
  useAssetBackend(backend, { b: B });
  store.set('campaign-builder:history:d0', 'delta:[{"t":"asset:b"}]');
  pruneMirror('{}');
  let reads = 0;
  const getItem = localStorage.getItem;
  localStorage.getItem = (key) => ((reads += 1), getItem(key));
  store.set('campaign-builder:history:d1', 'delta:[]');
  pruneMirror('{}');
  assert.equal(reads, 0, 'a new key cannot remove a reference');
  store.delete('campaign-builder:history:d0');
  pruneMirror('{}');
  assert.ok(reads > 0);
  assert.deepEqual(storedAssetTable(), {});
});

test('pruneMirror with nothing committed reads nothing', () => {
  useAssetBackend(createMemoryBackend());
  let reads = 0;
  localStorage.getItem = () => ((reads += 1), null);
  pruneMirror('{"image":"asset:a"}');
  assert.equal(reads, 0);
});

test('a delete that fails or throws does not reach the save', async () => {
  const backend = createMemoryBackend({ a: A, b: B });
  backend.deleteMany = async () => {
    throw new Error('refused');
  };
  useAssetBackend(backend, { a: A, b: B });
  assert.doesNotThrow(() => pruneMirror('{"image":"asset:b"}'));
  backend.deleteMany = () => {
    throw new Error('closed');
  };
  assert.doesNotThrow(() => pruneMirror('{}'));
  assert.deepEqual(storedAssetTable(), {});
  await Promise.resolve();
});

test('missingAssetKeys names the referenced keys the copy does not contain', () => {
  useAssetBackend(createMemoryBackend(), { a: A });
  assert.deepEqual(missingAssetKeys(null), []);
  assert.deepEqual(missingAssetKeys('{"image":"assets/tiles/x.svg"}'), []);
  assert.deepEqual(missingAssetKeys('{"a":"asset:a","b":"asset:b"}'), ['b']);
});

test('fetchAssets reads the named keys into the copy and counts the new ones', async () => {
  const backend = createMemoryBackend({ a: A, b: B });
  useAssetBackend(backend, { a: A });
  assert.equal(await fetchAssets([]), 0);
  assert.equal(await fetchAssets(['a']), 0, 'already held');
  assert.equal(await fetchAssets(['b', 'c']), 1);
  assert.equal(storedAssetTable().b, B);
});

test('fetchAssets returns 0 with no backend, a refused read, or a replaced backend', async () => {
  assert.equal(await fetchAssets(['a']), 0);
  const backend = createMemoryBackend({ a: A });
  backend.getMany = async () => {
    throw new Error('refused');
  };
  useAssetBackend(backend);
  assert.equal(await fetchAssets(['a']), 0);
  const slow = createMemoryBackend({ a: A });
  useAssetBackend(slow);
  const read = fetchAssets(['a']);
  useAssetBackend(createMemoryBackend());
  assert.equal(await read, 0);
  assert.deepEqual(storedAssetTable(), {});
});

test('openAssetMirror loads the backend and moves the localStorage table into it', async () => {
  store.set(ASSETS_KEY, JSON.stringify({ a: A, b: 'stale' }));
  const backend = createMemoryBackend({ b: B });
  assert.equal(await openAssetMirror(async () => backend), true);
  assert.equal(mirrorActive(), true);
  assert.equal(store.has(ASSETS_KEY), false, 'the key goes once the put commits');
  assert.deepEqual(Object.fromEntries(backend.store), { a: A, b: B }, 'a stored payload wins');
  assert.deepEqual(storedAssetTable(), { a: A, b: B });
});

test('openAssetMirror with no localStorage table only loads the backend', async () => {
  const { backend, calls } = counted({ a: A });
  assert.equal(await openAssetMirror(async () => backend), true);
  assert.equal(calls.put, 0);
  assert.deepEqual(storedAssetTable(), { a: A });
});

test('openAssetMirror keeps a table that changed while the move ran', async () => {
  store.set(ASSETS_KEY, JSON.stringify({ a: A }));
  const backend = createMemoryBackend();
  const { putMany } = backend;
  backend.putMany = async (entries) => {
    store.set(ASSETS_KEY, JSON.stringify({ a: A, b: B }));
    return putMany(entries);
  };
  assert.equal(await openAssetMirror(async () => backend), true);
  assert.equal(store.has(ASSETS_KEY), true, 'the next boot moves the new payload');
  assert.equal(backend.store.get('a'), A);
});

test('openAssetMirror stays on localStorage when the backend does not open or read', async () => {
  store.set(ASSETS_KEY, JSON.stringify({ a: A }));
  assert.equal(await openAssetMirror(async () => null), false);
  assert.equal(
    await openAssetMirror(async () => {
      throw new Error('blocked');
    }),
    false,
  );
  const refusing = createMemoryBackend();
  refusing.putMany = async () => {
    throw new Error('QuotaExceededError');
  };
  assert.equal(await openAssetMirror(async () => refusing), false);
  assert.equal(mirrorActive(), false);
  assert.equal(store.has(ASSETS_KEY), true, 'the images stay where they are');
});

test('withStoredAssets resolves the keys the copy contains and leaves the rest', () => {
  useAssetBackend(createMemoryBackend(), { a: A });
  const state = {
    handouts: [
      { id: 'h1', image: 'asset:a' },
      { id: 'h2', image: 'asset:b' },
    ],
  };
  const resolved = withStoredAssets(state);
  assert.deepEqual(
    resolved.handouts.map((handout) => handout.image),
    [A, 'asset:b'],
  );
  assert.equal('assets' in resolved, false);
});
