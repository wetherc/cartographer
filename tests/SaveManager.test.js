import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { createCharacter, addXP, withHP, getHP } from '../src/entities/Character.js';
import { createEncounter, applyDamage } from '../src/entities/Encounter.js';
import {
  buildState,
  serialize,
  deserialize,
  toTileGrid,
  saveToLocalStorage,
  trySaveToLocalStorage,
  loadFromLocalStorage,
  onExternalSave,
} from '../src/storage/SaveManager.js';

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

function sampleGrid() {
  const grid = new TileGrid();
  let world = createMapNode('world', 'World', null, 2, 2);
  world = setTile(world, createTile('0,0', 'grass.svg', { childNodeId: 'region', revealed: true }));
  grid.addNode(world);
  grid.addNode(
    createMapNode('hall', 'Great Hall', 'world', 1, 1, { kind: 'interior', environ: 'castle' }),
  );
  grid.addNode(createMapNode('region', 'Region', 'world', 1, 1));
  return grid;
}

test('buildState collects grid nodes, party, characters, and encounters', () => {
  const grid = sampleGrid();
  const party = { nodeId: 'world', tileId: '0,0' };
  const characters = [createCharacter('c1', 'Hero')];
  const encounters = [createEncounter('e1', 'Goblin', 7)];

  const state = buildState(grid, party, characters, encounters);
  assert.equal(state.nodes.length, 3);
  assert.equal(state.party.nodeId, 'world');
  assert.equal(state.characters.length, 1);
  assert.equal(state.encounters.length, 1);
});

test('serialize/deserialize round-trips a full campaign state', () => {
  const grid = sampleGrid();
  const party = { nodeId: 'world', tileId: '0,0' };
  const characters = [withHP(addXP(createCharacter('c1', 'Hero', { STR: 14 }, 'Dwarf'), 50), 12)];
  const encounters = [applyDamage(createEncounter('e1', 'Goblin', 7), 3)];

  const state = buildState(grid, party, characters, encounters);
  const restored = deserialize(serialize(state));

  assert.deepEqual(restored, state);
  assert.equal(restored.characters[0].race, 'Dwarf');
  assert.equal(getHP(restored.characters[0])?.max, 12);
});

test('deserialize defaults missing fields instead of throwing', () => {
  const restored = deserialize(JSON.stringify({}));
  assert.deepEqual(restored, {
    nodes: [],
    party: null,
    characters: [],
    encounters: [],
    travelog: [],
    quests: [],
    clock: null,
    npcs: [],
    handouts: [],
    bestiary: [],
    splitParty: false,
    combat: null,
  });
});

test('deserialize drops nodes and entities that are not records', () => {
  const restored = deserialize(
    JSON.stringify({
      nodes: [{ id: 'world', tiles: [] }, {}, null, 7, 'world'],
      characters: [null, { id: 'c1', name: 'Hero' }],
      encounters: 'none',
      npcs: 3,
      quests: null,
    }),
  );
  assert.deepEqual(
    restored.nodes.map((n) => n.id),
    ['world'],
    'a node with no id has no place in the grid',
  );
  assert.equal(restored.characters.length, 1);
  assert.deepEqual(restored.encounters, [], 'a non-array collection reads as empty');
  assert.deepEqual(restored.npcs, []);
  assert.deepEqual(restored.quests, []);
});

test('deserialize rejects a party position missing either id', () => {
  assert.equal(deserialize(JSON.stringify({ party: { nodeId: 'world' } })).party, null);
  assert.equal(deserialize(JSON.stringify({ party: 'world' })).party, null);
  assert.deepEqual(deserialize(JSON.stringify({ party: { nodeId: 'w', tileId: '0,0' } })).party, {
    nodeId: 'w',
    tileId: '0,0',
  });
});

test('deserialize repairs a combat missing its order or counters', () => {
  const restored = deserialize(JSON.stringify({ combat: { round: 'two' } }));
  assert.deepEqual(restored.combat, { round: 1, index: 0, order: [] });
  assert.equal(deserialize(JSON.stringify({ combat: [] })).combat, null);
});

test('deserialize reads a save that is not an object at all as an empty campaign', () => {
  assert.deepEqual(deserialize('null'), deserialize('{}'));
  assert.deepEqual(deserialize('[]'), deserialize('{}'));
  assert.deepEqual(deserialize('42'), deserialize('{}'));
});

test('deserialize coerces splitParty to a boolean', () => {
  assert.equal(deserialize(JSON.stringify({ splitParty: 'yes' })).splitParty, false);
  assert.equal(deserialize(JSON.stringify({ splitParty: true })).splitParty, true);
});

test('a malformed save loads as a grid instead of throwing', () => {
  const state = deserialize(
    JSON.stringify({ nodes: [{ id: 'world' }, { id: 'broken', tiles: 'many' }] }),
  );
  const grid = toTileGrid(state);
  assert.deepEqual(grid.getNode('world').tiles, []);
  assert.deepEqual(grid.getNode('broken').tiles, []);
});

test('serialize/deserialize round-trips a running combat', () => {
  const grid = sampleGrid();
  const combat = {
    round: 2,
    index: 1,
    order: [
      { id: 'c1', name: 'Hero', side: 'party', initiative: 17, modifier: 2 },
      { id: 'e1', name: 'Goblin', side: 'foe', initiative: 9, modifier: -1 },
    ],
  };
  const state = buildState(grid, null, [], [], [], [], { combat });
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.combat, combat);
});

test('deserialize defaults a missing combat to null', () => {
  const restored = deserialize(JSON.stringify({ nodes: [] }));
  assert.equal(restored.combat, null);
});

test('serialize/deserialize round-trips the quest log', () => {
  const grid = sampleGrid();
  const quests = [
    { id: 'q1', title: 'Find the sword', notes: 'It lies in the Keep.', status: 'active' },
    { id: 'q2', title: 'Slay the dragon', notes: '', status: 'completed' },
  ];
  const state = buildState(grid, null, [], [], [], quests);
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.quests, quests);
});

test('serialize/deserialize round-trips the travelogue', () => {
  const grid = sampleGrid();
  const travelog = [
    { id: 'l1', at: 1000, kind: 'travel', message: 'Entered the Keep.' },
    { id: 'l2', at: 2000, kind: 'combat', message: 'Defeated the Goblin.' },
  ];
  const state = buildState(grid, null, [], [], travelog);
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.travelog, travelog);
});

test('toTileGrid rebuilds a working TileGrid preserving hierarchy', () => {
  const grid = sampleGrid();
  const state = buildState(grid, null, [], []);
  const rebuilt = toTileGrid(deserialize(serialize(state)));

  assert.equal(rebuilt.getNode('world').name, 'World');
  const breadcrumb = rebuilt.getBreadcrumb('region').map((n) => n.id);
  assert.deepEqual(breadcrumb, ['world', 'region']);

  const tile = rebuilt.getNode('world').tiles[0];
  assert.equal(tile.revealed, true);
  const target = rebuilt.getZoomTarget(tile);
  assert.equal(target.id, 'region');
});

test('toTileGrid preserves node kind/environ and backfills older nodes as regions', () => {
  const grid = sampleGrid();
  const rebuilt = toTileGrid(deserialize(serialize(buildState(grid, null, [], []))));
  const hall = rebuilt.getNode('hall');
  assert.equal(hall.kind, 'interior');
  assert.equal(hall.environ, 'castle');

  // A node from a save predating the fields loads as a plain region.
  const legacy = toTileGrid({
    nodes: [{ id: 'old', name: 'Old', parentId: null, width: 1, height: 1, tiles: [] }],
    party: null,
    characters: [],
    encounters: [],
  });
  assert.equal(legacy.getNode('old').kind, 'region');
  assert.equal(legacy.getNode('old').environ, null);
});

test('saveByteSize costs two bytes per UTF-16 code unit', async () => {
  const { saveByteSize } = await import('../src/storage/SaveManager.js');
  assert.equal(saveByteSize('abcd'), 8);
  assert.equal(saveByteSize(''), 0);
});

test('isNearQuota flags sizes at or past the warning threshold', async () => {
  const { isNearQuota, QUOTA_WARN_BYTES } = await import('../src/storage/SaveManager.js');
  assert.equal(isNearQuota(QUOTA_WARN_BYTES - 1), false);
  assert.equal(isNearQuota(QUOTA_WARN_BYTES), true);
  assert.equal(isNearQuota(100, 100), true);
});

test('saveToLocalStorage then loadFromLocalStorage round-trips a campaign', () => {
  assert.equal(loadFromLocalStorage(), null, 'no save stored yet');
  const state = buildState(sampleGrid(), { nodeId: 'world', tileId: '0,0' }, [], []);
  saveToLocalStorage(state);
  assert.deepEqual(loadFromLocalStorage(), state);
});

test('trySaveToLocalStorage reports success, byte cost, and quota headroom', () => {
  const state = buildState(sampleGrid(), null, [], []);
  const result = trySaveToLocalStorage(state);
  assert.deepEqual(result, { ok: true, nearQuota: false, bytes: serialize(state).length * 2 });
  assert.deepEqual(loadFromLocalStorage(), state);
});

test('trySaveToLocalStorage reports a quota failure instead of throwing', () => {
  globalThis.localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  const result = trySaveToLocalStorage(buildState(sampleGrid(), null, [], []));
  assert.equal(result.ok, false);
  assert.equal(result.nearQuota, true);
});

test('trySaveToLocalStorage flags a save approaching the quota even when it lands', () => {
  // ~3.2 MB serialized (UTF-16), past the 3 MB warning threshold.
  const state = buildState(sampleGrid(), null, [], [], [], [], {
    handouts: [{ id: 'h1', title: 'Map', body: 'x'.repeat(1_600_000), revealed: false }],
  });
  const result = trySaveToLocalStorage(state);
  assert.equal(result.ok, true);
  assert.equal(result.nearQuota, true);
});

test('onExternalSave fires only for another tab writing a new save, until unsubscribed', () => {
  /** @type {Map<string, Set<(event: any) => void>>} */
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => listeners.get(type)?.delete(handler),
  };
  const dispatch = (event) => listeners.get('storage')?.forEach((h) => h(event));

  let calls = 0;
  const unsubscribe = onExternalSave(() => calls++);

  dispatch({ key: 'campaign-builder:save', oldValue: null, newValue: '{"a":1}' });
  assert.equal(calls, 1, 'a new save from another tab fires the callback');

  dispatch({ key: 'campaign-builder:history', oldValue: null, newValue: '[]' });
  dispatch({ key: 'campaign-builder:save', oldValue: '{"a":1}', newValue: null });
  dispatch({ key: 'campaign-builder:save', oldValue: '{"a":1}', newValue: '{"a":1}' });
  assert.equal(calls, 1, 'history writes, clears, and no-ops are ignored');

  unsubscribe();
  dispatch({ key: 'campaign-builder:save', oldValue: null, newValue: '{"b":2}' });
  assert.equal(calls, 1, 'unsubscribed listener no longer fires');

  delete globalThis.window;
});
