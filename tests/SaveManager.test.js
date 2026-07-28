import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMapNode, createTile, setTile, TileGrid } from '../src/map/TileGrid.js';
import {
  createCharacter,
  addXP,
  withHP,
  getHP,
  withDefaults as withCharacterDefaults,
} from '../src/entities/Character.js';
import {
  createEncounter,
  applyDamage,
  withDefaults as withEncounterDefaults,
} from '../src/entities/Encounter.js';
import { createNPC, withDefaults as withNPCDefaults } from '../src/entities/NPC.js';
import { createHandout, withDefaults as withHandoutDefaults } from '../src/handout/Handouts.js';
import {
  buildState,
  serialize,
  deserialize,
  toTileGrid,
  trySaveToLocalStorage,
  loadFromLocalStorage,
  onExternalSave,
  QUOTA_WARN_BYTES,
} from '../src/storage/SaveManager.js';
import { CURRENT_VERSION } from '../src/storage/Migrations.js';
import { installLocalStorage, installWindow } from './helpers/env.js';

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

  const state = buildState({ grid, party, characters, encounters });
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

  const state = buildState({ grid, party, characters, encounters });
  const restored = deserialize(serialize(state));

  // Loading runs each collection's entity `withDefaults`, so what comes back is
  // the defaulted form of what went in — which is also what packing targets.
  assert.deepEqual(restored, {
    ...state,
    characters: state.characters.map(withCharacterDefaults),
    encounters: state.encounters.map(withEncounterDefaults),
  });
  assert.equal(restored.characters[0].race, 'Dwarf');
  assert.equal(getHP(restored.characters[0])?.max, 12);
});

/** A node holding one of every tile variation the packer has to survive. */
function variedNode() {
  let node = createMapNode('world', 'World', null, 4, 3);
  const tiles = [
    createTile('0,0', 'grass.svg'),
    createTile('1,0', 'grass.svg', { revealed: true }),
    createTile('2,0', 'grass.svg', { overlayRef: 'road-ns.svg' }),
    createTile('3,0', 'grass.svg', { overlayRef: ['coast-n.svg', 'river-ns.svg'] }),
    createTile('0,1', 'water.svg', { overlayRef: [] }),
    createTile('1,1', 'grass.svg', {
      metadata: { poiType: 'shop', discoverable: true, discovered: true, notes: 'Sells rope.' },
    }),
    createTile('2,1', 'grass.svg', {
      metadata: { poiType: 'dungeon', discoverable: false, discovered: false, notes: '' },
    }),
    createTile('3,1', 'grass.svg', { childNodeId: 'region', revealed: true }),
    createTile('0,2', 'keep.svg', { span: 2 }),
    createTile('1,2', 'grass.svg', { span: 1 }),
  ];
  for (const tile of tiles) node = setTile(node, tile);
  return node;
}

test('packing omits default tile fields and the load path restores them', () => {
  const grid = new TileGrid();
  grid.addNode(variedNode());
  const state = buildState({ grid });
  const json = serialize(state);

  // The boilerplate that dominates a real save is gone from the text.
  assert.equal(json.includes('"revealed":false'), false);
  assert.equal(json.includes('"childNodeId":null'), false);
  assert.equal(json.includes('"overlayRef":null'), false);
  assert.equal(json.includes('"discovered":false'), false);
  assert.equal(json.includes('"notes":""'), false);
  assert.equal(json.includes('"metadata":{}'), false);
  assert.equal(json.includes('"span":1'), false, 'an absent span and a span of 1 are the same');

  const restored = deserialize(json).nodes[0];
  const original = state.nodes[0];
  // Every tile round-trips exactly, bar the explicit span of 1 collapsing to
  // absent — the same value per the Tile type, and the one asymmetry.
  const expected = original.tiles.map((tile) =>
    tile.span === 1 ? Object.fromEntries(Object.entries(tile).filter(([k]) => k !== 'span')) : tile,
  );
  assert.deepEqual(restored.tiles, expected);
});

test('packing keeps a tile field it does not know about', () => {
  const grid = new TileGrid();
  let node = createMapNode('world', 'World', null, 1, 1);
  node = setTile(node, { ...createTile('0,0', 'grass.svg'), future: 'kept' });
  grid.addNode(node);
  const restored = deserialize(serialize(buildState({ grid }))).nodes[0];
  assert.equal(restored.tiles[0].future, 'kept', 'a packer that picked named fields would drop it');
});

test('packing shrinks a save dominated by default tiles', () => {
  const grid = new TileGrid();
  let node = createMapNode('world', 'World', null, 20, 20);
  for (let y = 0; y < 20; y += 1)
    for (let x = 0; x < 20; x += 1) node = setTile(node, createTile(`${x},${y}`, 'grass.svg'));
  grid.addNode(node);
  const state = buildState({ grid });
  const packed = serialize(state).length;
  const unpacked = JSON.stringify(state).length;
  assert.ok(packed < unpacked * 0.45, `packed ${packed} vs unpacked ${unpacked}`);
});

test('a save written before tiles were packed still loads whole', () => {
  const grid = new TileGrid();
  grid.addNode(variedNode());
  const state = buildState({ grid });
  // Version 1 wrote every tile field explicitly; the backfill must leave it be.
  const restored = deserialize(JSON.stringify({ ...state, version: 1 })).nodes[0];
  assert.deepEqual(restored.tiles, state.nodes[0].tiles);
});

/** One of every packed entity collection, in a state ready to serialize. */
function populatedState() {
  const grid = new TileGrid();
  grid.addNode(createMapNode('world', 'World', null, 1, 1));
  return buildState({
    grid,
    characters: [createCharacter('c1', 'Hero')],
    encounters: [
      createEncounter('e1', 'Goblin', 7),
      createEncounter('e2', 'Ogre', 40, {}, null, { level: 7, tier: 'boss' }),
    ],
    npcs: [createNPC('n1', 'Alda')],
    handouts: [createHandout('h1', 'Rumor')],
  });
}

test('packing omits default entity fields and loading restores them', () => {
  const json = serialize(populatedState());
  for (const boilerplate of [
    '"conditions":[]',
    '"statMods":[]',
    '"location":null',
    '"expertise":[]',
    '"bonusHP":0',
    '"met":false',
    '"revealed":false',
    '"image":null',
  ]) {
    assert.equal(json.includes(boilerplate), false, `${boilerplate} should not be written`);
  }
  const restored = deserialize(json);
  const state = populatedState();
  assert.deepEqual(restored.characters, state.characters.map(withCharacterDefaults));
  assert.deepEqual(restored.encounters, state.encounters.map(withEncounterDefaults));
  assert.deepEqual(restored.npcs, state.npcs.map(withNPCDefaults));
  assert.deepEqual(restored.handouts, state.handouts.map(withHandoutDefaults));
});

test('packing keeps a level-dependent default a type-wide table would have dropped', () => {
  // The level-7 ogre's gear differs from what a level-1 mob is given, so it has
  // to survive the round trip rather than being resolved again on load.
  const state = populatedState();
  const restored = deserialize(serialize(state));
  const ogre = restored.encounters.find((encounter) => encounter.id === 'e2');
  assert.deepEqual(ogre.weapon, state.encounters[1].weapon);
  assert.deepEqual(ogre.armor, state.encounters[1].armor);
  assert.equal(ogre.level, 7);
});

test('a save written before entities were packed still loads whole', () => {
  const state = populatedState();
  // Version 3 wrote every entity field explicitly; the defaults pass must agree.
  const restored = deserialize(JSON.stringify({ ...state, version: 3 }));
  assert.deepEqual(restored.characters, state.characters.map(withCharacterDefaults));
  assert.deepEqual(restored.encounters, state.encounters.map(withEncounterDefaults));
});

test('serializing hoists image payloads and loading puts them back', () => {
  const art = `data:image/png;base64,${'Qk1'.repeat(2000)}`;
  const grid = new TileGrid();
  const tiles = [];
  for (let i = 0; i < 12; i += 1) tiles.push(createTile(`${i},0`, art));
  grid.addNode({ id: 'world', name: 'World', parentId: null, width: 12, height: 1, tiles });
  const state = buildState({
    grid,
    handouts: [{ id: 'h1', title: 'Scrap', body: '', nodeId: null, revealed: false, image: art }],
  });
  const json = serialize(state);
  assert.equal(json.split(art).length - 1, 1, 'thirteen references, one stored payload');
  const restored = deserialize(json);
  assert.deepEqual(
    restored.nodes[0].tiles.map((tile) => tile.imageRef),
    tiles.map(() => art),
  );
  assert.equal(restored.handouts[0].image, art);
  assert.equal('assets' in restored, false, 'the table is on-disk only, never live state');
});

test('a save written before image payloads were hoisted still loads', () => {
  const art = 'data:image/png;base64,AAAA';
  const grid = new TileGrid();
  grid.addNode({
    id: 'world',
    name: 'World',
    parentId: null,
    width: 1,
    height: 1,
    tiles: [createTile('0,0', art)],
  });
  const state = buildState({ grid });
  // Version 2 wrote the payload inline, with no table to resolve against.
  const json = JSON.stringify({ ...state, version: 2 });
  assert.equal(deserialize(json).nodes[0].tiles[0].imageRef, art);
});

test('serializing encodes a grid node positionally and loading reads it back', () => {
  const grid = new TileGrid();
  grid.addNode(variedNode());
  const state = buildState({ grid });
  const json = serialize(state);

  assert.ok(json.includes('"cells":'), 'the run-length index stream is written');
  assert.equal(json.includes('"id":"1,0"'), false, 'a tile id is implicit in its position');
  // Eight tiles use grass. A palette entry is the (imageRef, overlayRef) pair, so
  // the path is restated once per distinct overlay combination and never per tile.
  assert.equal(json.split('grass.svg').length - 1, 3);

  const restored = deserialize(json).nodes[0];
  // Every tile comes back as it went in, bar the explicit span of 1 collapsing to
  // absent — the same asymmetry the tile packing already has, and the same value.
  const expected = state.nodes[0].tiles.map((tile) =>
    tile.span === 1 ? Object.fromEntries(Object.entries(tile).filter(([k]) => k !== 'span')) : tile,
  );
  const byId = (tiles) => [...tiles].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(restored.tiles), byId(expected));
  for (const field of ['refs', 'cells', 'fog']) {
    assert.equal(field in restored, false, `${field} is on-disk only, never live state`);
  }
});

test('the positional encoding shrinks a save of a fully explored map', () => {
  const grid = new TileGrid();
  let node = createMapNode('world', 'World', null, 40, 40);
  for (let y = 0; y < 40; y += 1)
    for (let x = 0; x < 40; x += 1)
      node = setTile(
        node,
        createTile(`${x},${y}`, 'assets/tiles/grass/grass-1.svg', {
          revealed: true,
        }),
      );
  grid.addNode(node);
  const state = buildState({ grid });
  const encoded = serialize(state).length;
  // The same save one schema version back: tiles packed but written per cell.
  const perTile = JSON.stringify({ ...state, version: 4 }).length;
  assert.ok(encoded < perTile * 0.05, `encoded ${encoded} vs per-tile ${perTile}`);
});

test('a save written before tiles were encoded positionally still loads', () => {
  const grid = new TileGrid();
  grid.addNode(variedNode());
  const state = buildState({ grid });
  // Version 4 carries no `cells`, so the decoder must take the unencoded branch.
  const restored = deserialize(JSON.stringify({ ...state, version: 4 })).nodes[0];
  assert.deepEqual(restored.tiles.length, state.nodes[0].tiles.length);
  assert.equal(restored.tiles.find((tile) => tile.id === '1,1').metadata.poiType, 'shop');
});

test('a node whose tiles are not a canonical grid is stored unencoded', () => {
  const grid = new TileGrid();
  grid.addNode({
    id: 'world',
    name: 'World',
    parentId: null,
    width: 2,
    height: 1,
    tiles: [createTile('spawn', 'grass.svg')],
  });
  const json = serialize(buildState({ grid }));
  assert.equal(json.includes('"cells":'), false, 'a non-grid tile id disqualifies the node');
  assert.equal(deserialize(json).nodes[0].tiles[0].id, 'spawn');
});

test('encoding runs after the asset hoist, so the palette holds references', () => {
  const art = `data:image/png;base64,${'Qk1'.repeat(2000)}`;
  const grid = new TileGrid();
  let node = createMapNode('world', 'World', null, 3, 1);
  for (let x = 0; x < 3; x += 1) node = setTile(node, createTile(`${x},0`, art));
  grid.addNode(node);
  const json = serialize(buildState({ grid }));
  assert.equal(json.split(art).length - 1, 1, 'one stored payload, referenced by the palette');
  const restored = deserialize(json).nodes[0];
  assert.deepEqual(
    restored.tiles.map((tile) => tile.imageRef),
    [art, art, art],
  );
});

test('buildState stamps the current schema version over a stale one', () => {
  // Nothing passes `version` today, and the source type does not accept it, but
  // the stamp is unconditional so a source that still carries one (a state
  // loaded from an older save, re-saved) cannot claim the old format.
  const stale = { grid: sampleGrid(), version: 99 };
  const state = buildState(stale);
  assert.equal(state.version, CURRENT_VERSION);
});

test('buildState fills every omitted field with its empty value', () => {
  const state = buildState({ grid: sampleGrid() });
  assert.deepEqual(
    { ...state, nodes: [], version: 0 },
    {
      nodes: [],
      version: 0,
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
    },
  );
});

test('deserialize loads a versionless save as the current version', () => {
  const restored = deserialize(
    JSON.stringify({ nodes: [{ id: 'world', tiles: [] }], splitParty: true }),
  );
  assert.equal(restored.version, CURRENT_VERSION);
  assert.equal(restored.nodes.length, 1, 'the pre-version payload survives the chain');
  assert.equal(restored.splitParty, true);
});

test('deserialize reads a save newer than the app best-effort', () => {
  const restored = deserialize(
    JSON.stringify({ version: 99, nodes: [{ id: 'world', tiles: [] }] }),
  );
  assert.equal(restored.version, CURRENT_VERSION, 're-stamped to the format this app writes');
  assert.equal(restored.nodes.length, 1);
});

test('deserialize defaults missing fields instead of throwing', () => {
  const restored = deserialize(JSON.stringify({}));
  assert.deepEqual(restored, {
    version: CURRENT_VERSION,
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
      { id: 'c1', initiative: 17, modifier: 2 },
      { id: 'e1', initiative: 9, modifier: -1 },
    ],
  };
  const state = buildState({ grid, combat });
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.combat, combat);
});

test('deserialize strips the name and side an older save froze into the order', () => {
  const grid = sampleGrid();
  const combat = {
    round: 1,
    index: 0,
    order: [
      { id: 'c1', name: 'Hero', side: 'party', initiative: 17, modifier: 2 },
      // No id names nobody, so the entry can only ever render as a blank row.
      { name: 'Ghost', side: 'foe', initiative: 4 },
    ],
  };
  const state = buildState({ grid, combat });
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.combat?.order, [{ id: 'c1', initiative: 17, modifier: 2 }]);
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
  const state = buildState({ grid, quests });
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.quests, quests);
});

test('serialize/deserialize round-trips the travelogue', () => {
  const grid = sampleGrid();
  const travelog = [
    { id: 'l1', at: 1000, kind: 'travel', message: 'Entered the Keep.' },
    { id: 'l2', at: 2000, kind: 'combat', message: 'Defeated the Goblin.' },
  ];
  const state = buildState({ grid, travelog });
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.travelog, travelog);
});

test('toTileGrid rebuilds a working TileGrid preserving hierarchy', () => {
  const grid = sampleGrid();
  const state = buildState({ grid });
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
  const rebuilt = toTileGrid(deserialize(serialize(buildState({ grid }))));
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
  const { isNearQuota } = await import('../src/storage/SaveManager.js');
  assert.equal(isNearQuota(QUOTA_WARN_BYTES - 1), false);
  assert.equal(isNearQuota(QUOTA_WARN_BYTES), true);
  assert.equal(isNearQuota(100, 100), true);
});

test('footprintBytes charges for keys and values, two bytes per code unit', async () => {
  const { footprintBytes } = await import('../src/storage/SaveManager.js');
  assert.equal(footprintBytes([]), 0);
  assert.equal(footprintBytes([['ab', 'cd']]), 8);
  assert.equal(
    footprintBytes([
      ['a', ''],
      ['', 'bc'],
    ]),
    6,
    'an empty key or value still costs its counterpart',
  );
});

test('localStorageFootprint sums every key on the origin, not just the save', async () => {
  const { localStorageFootprint } = await import('../src/storage/SaveManager.js');
  assert.equal(localStorageFootprint(), 0);
  localStorage.setItem('campaign-builder:save', 'x'.repeat(10));
  localStorage.setItem('campaign-builder:library', 'y'.repeat(20));
  assert.equal(
    localStorageFootprint(),
    ('campaign-builder:save'.length + 10) * 2 + ('campaign-builder:library'.length + 20) * 2,
  );
});

test('a stored save then loadFromLocalStorage round-trips a campaign', () => {
  assert.equal(loadFromLocalStorage(), null, 'no save stored yet');
  const state = buildState({ grid: sampleGrid(), party: { nodeId: 'world', tileId: '0,0' } });
  trySaveToLocalStorage(state);
  assert.deepEqual(loadFromLocalStorage(), state);
});

test('trySaveToLocalStorage reports success, byte cost, and quota headroom', async () => {
  const { localStorageFootprint } = await import('../src/storage/SaveManager.js');
  const state = buildState({ grid: sampleGrid() });
  const result = trySaveToLocalStorage(state);
  assert.deepEqual(result, {
    ok: true,
    assetsOk: true,
    nearQuota: false,
    bytes: serialize(state).length * 2,
    footprint: localStorageFootprint(),
    // The string that was written, so the history log can cache the state it
    // just stored against it rather than re-reading and re-parsing the save.
    json: /** @type {string} */ (localStorage.getItem('campaign-builder:save')),
  });
  assert.deepEqual(loadFromLocalStorage(), state);
});

test('trySaveToLocalStorage reports a quota failure instead of throwing', () => {
  globalThis.localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  const result = trySaveToLocalStorage(buildState({ grid: sampleGrid() }));
  assert.equal(result.ok, false);
  assert.equal(result.nearQuota, true);
});

test('trySaveToLocalStorage flags a save approaching the quota even when it lands', () => {
  // ~3.2 MB serialized (UTF-16), past the 3 MB warning threshold.
  const state = buildState({
    grid: sampleGrid(),
    handouts: [{ id: 'h1', title: 'Map', body: 'x'.repeat(1_600_000), revealed: false }],
  });
  const result = trySaveToLocalStorage(state);
  assert.equal(result.ok, true);
  assert.equal(result.nearQuota, true);
});

test('a small save still warns when the rest of the origin fills the quota', () => {
  // The case a per-save metric cannot see: the campaign is tiny and the undo
  // ring is what spends the quota.
  for (let seq = 0; seq < 10; seq += 1) {
    localStorage.setItem(`campaign-builder:history:${seq}`, 'x'.repeat(170_000));
  }
  const result = trySaveToLocalStorage(buildState({ grid: sampleGrid() }));
  assert.equal(result.ok, true);
  assert.ok(result.bytes < QUOTA_WARN_BYTES, 'the save on its own is nowhere near the limit');
  assert.equal(result.nearQuota, true);
});

test('onExternalSave fires only for another tab writing a new save, until unsubscribed', () => {
  const fire = installWindow();
  const dispatch = (event) => fire('storage', event);

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
