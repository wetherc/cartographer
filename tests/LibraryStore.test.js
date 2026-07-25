import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIBRARY_KEY,
  loadCustomLibrary,
  saveCustomLibrary,
  clearCustomLibrary,
  fetchLibraryFile,
} from '../src/storage/LibraryStore.js';
import { emptyLibrary } from '../src/library/Library.js';

/** Minimal in-memory localStorage so the storage wrappers run under Node. */
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

beforeEach(installLocalStorage);

const sample = () => ({
  ...emptyLibrary(),
  equipment: [{ name: 'Rope (50 ft)', type: 'gear' }],
});

test('loadCustomLibrary returns null when nothing is stored', () => {
  assert.equal(loadCustomLibrary(), null);
});

test('loadCustomLibrary treats a corrupt entry as absent', () => {
  localStorage.setItem(LIBRARY_KEY, 'not json');
  assert.equal(loadCustomLibrary(), null);
});

test('saveCustomLibrary then loadCustomLibrary round-trips, normalized', () => {
  assert.equal(saveCustomLibrary(sample()), true);
  assert.deepEqual(loadCustomLibrary(), sample());
});

test('loadCustomLibrary normalizes a hand-edited entry instead of trusting it', () => {
  // Untrimmed name survives trimmed; an invalid equipment type drops the entry.
  localStorage.setItem(
    LIBRARY_KEY,
    JSON.stringify({
      equipment: [
        { name: '  Rope  ', type: 'gear' },
        { name: 'Bogus', type: 'not-a-type' },
      ],
    }),
  );
  const library = loadCustomLibrary();
  assert.deepEqual(library.equipment, [{ name: 'Rope', type: 'gear' }]);
  assert.deepEqual(library.bestiary, []);
  assert.deepEqual(library.npcs, []);
});

test('saveCustomLibrary reports a failed write instead of throwing', () => {
  globalThis.localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.equal(saveCustomLibrary(sample()), false);
});

test('clearCustomLibrary drops the stored library', () => {
  saveCustomLibrary(sample());
  clearCustomLibrary();
  assert.equal(loadCustomLibrary(), null);
});

test('fetchLibraryFile returns the normalized library on a good response', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ equipment: [{ name: ' Rope ', type: 'gear' }] }),
  });
  assert.deepEqual(await fetchLibraryFile(), {
    equipment: [{ name: 'Rope', type: 'gear' }],
    bestiary: [],
    npcs: [],
    spells: [],
  });
});

test('fetchLibraryFile returns null on a missing file, bad JSON, or network error', async () => {
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(await fetchLibraryFile(), null);

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError('bad json');
    },
  });
  assert.equal(await fetchLibraryFile(), null);

  globalThis.fetch = async () => {
    throw new TypeError('network down');
  };
  assert.equal(await fetchLibraryFile(), null);
});
