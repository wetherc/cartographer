import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import { createCharacter, addXP, withHP, getHP } from '../src/entities/Character.js';
import { createEncounter, applyDamage } from '../src/entities/Encounter.js';
import { buildState, serialize, deserialize, toTileGrid } from '../src/storage/SaveManager.js';

function sampleGrid() {
  const grid = new TileGrid();
  let world = createMapNode('world', 'World', null, 2, 2);
  world = setTile(world, createTile('0,0', 'grass.svg', { childNodeId: 'region', revealed: true }));
  grid.addNode(world);
  grid.addNode(createMapNode('hall', 'Great Hall', 'world', 1, 1, { kind: 'interior', environ: 'castle' }));
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
  });
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
