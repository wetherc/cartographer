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
  createCreature,
  applyDamage,
  withDefaults as withCreatureDefaults,
} from '../src/entities/Creature.js';
import { withProficiencies } from '../src/entities/Proficiencies.js';
import { createHandout, withDefaults as withHandoutDefaults } from '../src/handout/Handouts.js';
import {
  buildState,
  packState,
  serialize,
  deserialize,
  toTileGrid,
  trySaveToLocalStorage,
  loadFromLocalStorage,
  onExternalSave,
  QUOTA_WARN_BYTES,
} from '../src/storage/SaveManager.js';
import { CURRENT_VERSION } from '../src/storage/Migrations.js';
import { freshBudget } from '../src/combat/ActionBudget.js';
import { installLocalStorage, installWindow } from './helpers/env.js';
import { fillTiles } from './helpers/grid.js';

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

/** A hostile creature the fixtures share.
 * @param {string} id @param {string} name @param {number} maxHP
 * @param {Record<string, any>} [extra] */
const foe = (id, name, maxHP, extra = {}) =>
  createCreature(id, name, { disposition: 'hostile', maxHP, level: 1, ...extra });

test('buildState collects grid nodes, party, characters, and creatures', () => {
  const grid = sampleGrid();
  const party = { nodeId: 'world', tileId: '0,0' };
  const characters = [createCharacter('c1', 'Hero')];
  const creatures = [foe('e1', 'Goblin', 7)];

  const state = buildState({ grid, party, characters, creatures });
  assert.equal(state.nodes.length, 3);
  assert.equal(state.party.nodeId, 'world');
  assert.equal(state.characters.length, 1);
  assert.equal(state.creatures.length, 1);
});

test('serialize/deserialize round-trips a full campaign state', () => {
  const grid = sampleGrid();
  const party = { nodeId: 'world', tileId: '0,0' };
  const characters = [withHP(addXP(createCharacter('c1', 'Hero', { STR: 14 }, 'Dwarf'), 50), 12)];
  const creatures = [applyDamage(foe('e1', 'Goblin', 7), 3)];

  const state = buildState({ grid, party, characters, creatures });
  const restored = deserialize(serialize(state));

  // Loading runs each collection's entity `withDefaults`, so what comes back is
  // the defaulted form of what went in — which is also what packing targets.
  assert.deepEqual(restored, {
    ...state,
    characters: state.characters.map(withCharacterDefaults),
    creatures: state.creatures.map(withCreatureDefaults),
  });
  assert.equal(restored.characters[0].race, 'Dwarf');
  assert.equal(getHP(restored.characters[0])?.max, 12);
});

test('packing returns the cached encode for an unchanged node', () => {
  const grid = sampleGrid();
  const state = buildState({ grid });
  const first = packState(state);
  const second = packState(buildState({ grid }));
  const packedNode = (packed, id) => packed.nodes.find((n) => n.id === id);
  assert.equal(
    packedNode(second, 'world'),
    packedNode(first, 'world'),
    'the same node object encodes to the same object',
  );

  const edited = {
    ...state,
    nodes: state.nodes.map((n) => (n.id === 'world' ? setTile(n, createTile('1,1', 'w.svg')) : n)),
  };
  const third = packState(edited);
  assert.notEqual(
    packedNode(third, 'world'),
    packedNode(first, 'world'),
    'a changed node re-encodes',
  );
  assert.equal(
    packedNode(third, 'region'),
    packedNode(first, 'region'),
    'the untouched node stays cached',
  );
});

test('a node holding an inline payload re-encodes and rebuilds the asset table each time', () => {
  const payload = `data:image/svg+xml;base64,${'B'.repeat(64)}`;
  const grid = sampleGrid();
  grid.addNode(setTile(grid.getNode('region'), createTile('0,0', payload)));
  const state = buildState({ grid });
  const first = packState(state);
  const second = packState(state);
  assert.deepEqual(second, first);
  assert.ok(first.assets && Object.keys(first.assets).length, 'the table is present');
  assert.equal(serialize(state), serialize(state), 're-serializing is deterministic');
});

test('a challenge rating survives packing and reload, and absence stays absence', () => {
  const state = buildState({
    grid: sampleGrid(),
    party: { nodeId: 'world', tileId: '0,0' },
    creatures: [foe('e1', 'Goblin', 7, { cr: 0.25 }), foe('e2', 'Thug', 11)],
  });
  const restored = deserialize(serialize(state));
  assert.equal(restored.creatures[0].cr, 0.25, 'the packer must not drop the rating');
  assert.equal('cr' in restored.creatures[1], false, 'an unrated foe gains no rating');
});

test('a creature proficiency list survives packing and reload', () => {
  const state = buildState({
    grid: sampleGrid(),
    party: { nodeId: 'world', tileId: '0,0' },
    creatures: [
      foe('e1', 'Goblin', 7, { proficiencies: { saves: ['DEX'], skills: ['stealth'] } }),
      foe('e2', 'Thug', 11),
    ],
  });
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.creatures[0].proficiencies, { saves: ['DEX'], skills: ['stealth'] });
  assert.equal('proficiencies' in restored.creatures[1], false, 'absence stays absence');
});

test('the spellcasting-focus flag survives packing and reload', () => {
  const hero = createCharacter('c1', 'Hero');
  hero.inventory = [
    /** @type {any} */ ({
      id: 'pouch',
      name: 'Component Pouch',
      quantity: 1,
      notes: '',
      type: 'gear',
      spellFocus: true,
    }),
  ];
  const state = buildState({
    grid: sampleGrid(),
    party: { nodeId: 'world', tileId: '0,0' },
    characters: [hero],
    encounters: [],
  });
  const restored = deserialize(serialize(state));
  assert.equal(
    restored.characters[0].inventory[0].spellFocus,
    true,
    'the packer must not drop the flag as if it were a default',
  );
});

test('a condition chip keeps its rider across packing and reload', () => {
  const hero = createCharacter('c1', 'Hero');
  hero.conditions = [
    /** @type {any} */ ({
      name: 'Bless',
      rounds: 10,
      source: { spellId: 'bless', spellName: 'Bless', casterId: 'c2' },
      rider: { rolls: ['attack', 'save'], dice: 1, die: 'd4' },
    }),
  ];
  const state = buildState({
    grid: sampleGrid(),
    party: { nodeId: 'world', tileId: '0,0' },
    characters: [hero],
    encounters: [],
  });
  const restored = deserialize(serialize(state));
  assert.deepEqual(
    restored.characters[0].conditions[0].rider,
    { rolls: ['attack', 'save'], dice: 1, die: 'd4' },
    'a chip that loses its rider stops changing the rolls it was written to change',
  );
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

/**
 * A tile as the load path hands it back. An explicit span of 1 comes back
 * absent, and an empty overlay stack comes back as null. Both pairs mean the
 * same thing per the Tile type, and these are the only two asymmetries of
 * the round trip.
 * @param {Record<string, any>} tile
 */
function loadedForm(tile) {
  const { span, ...rest } = tile;
  return {
    ...rest,
    ...(span > 1 ? { span } : {}),
    overlayRef: Array.isArray(tile.overlayRef) && !tile.overlayRef.length ? null : tile.overlayRef,
  };
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
  assert.deepEqual(restored.tiles, state.nodes[0].tiles.map(loadedForm));
});

test('packing keeps a tile field it does not know about', () => {
  const grid = new TileGrid();
  let node = createMapNode('world', 'World', null, 1, 1);
  node = setTile(node, { ...createTile('0,0', 'grass.svg'), future: 'kept' });
  grid.addNode(node);
  const restored = deserialize(serialize(buildState({ grid }))).nodes[0];
  assert.equal(restored.tiles[0].future, 'kept', 'a packer that picked named fields would drop it');
});

test('packing drops a metadata block that is not a record, and the load path refills it', () => {
  const grid = new TileGrid();
  let node = createMapNode('world', 'World', null, 1, 1);
  // A hand-edited save can carry this. Nothing downstream checks for the block
  // before reading through it, so it must not survive the round trip.
  node = setTile(node, { ...createTile('0,0', 'grass.svg'), metadata: null });
  grid.addNode(node);
  const json = serialize(buildState({ grid }));
  assert.equal(json.includes('metadata'), false);
  const restored = deserialize(json).nodes[0];
  assert.deepEqual(restored.tiles[0].metadata, createTile('0,0', 'grass.svg').metadata);
});

test('packing shrinks a save dominated by default tiles', () => {
  const grid = new TileGrid();
  grid.addNode(fillTiles(createMapNode('world', 'World', null, 20, 20)));
  const state = buildState({ grid });
  const packed = serialize(state).length;
  const unpacked = JSON.stringify(state).length;
  assert.ok(packed < unpacked * 0.45, `packed ${packed} vs unpacked ${unpacked}`);
});

test('a save written before tiles were packed still loads whole', () => {
  const grid = new TileGrid();
  grid.addNode(variedNode());
  const state = buildState({ grid });
  // Version 1 wrote every tile field explicitly. The backfill only checks
  // each field, so the tiles come back in their loaded form.
  const restored = deserialize(JSON.stringify({ ...state, version: 1 })).nodes[0];
  assert.deepEqual(restored.tiles, state.nodes[0].tiles.map(loadedForm));
});

/** One of every packed entity collection, in a state ready to serialize. */
function populatedState() {
  const grid = new TileGrid();
  grid.addNode(createMapNode('world', 'World', null, 1, 1));
  return buildState({
    grid,
    // The skill keeps `proficiencies` in the save, so the boilerplate check
    // below sees the empty lists nested inside it, not just top-level ones.
    characters: [withProficiencies(createCharacter('c1', 'Hero'), { skills: ['stealth'] })],
    creatures: [
      foe('e1', 'Goblin', 7),
      foe('e2', 'Ogre', 40, { level: 7, tier: 'legend' }),
      createCreature('n1', 'Alda'),
    ],
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
    '"saves":[]',
    '"languages":[]',
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
  assert.deepEqual(restored.creatures, state.creatures.map(withCreatureDefaults));
  assert.deepEqual(restored.handouts, state.handouts.map(withHandoutDefaults));
});

test('packing keeps a level-dependent default a type-wide table would have dropped', () => {
  // The level-7 legend's gear differs from what a level-1 mob is given, so it
  // has to survive the round trip rather than being resolved again on load.
  const state = populatedState();
  const restored = deserialize(serialize(state));
  const ogre = restored.creatures.find((creature) => creature.id === 'e2');
  assert.deepEqual(ogre.weapon, state.creatures[1].weapon);
  assert.deepEqual(ogre.armor, state.creatures[1].armor);
  assert.equal(ogre.level, 7);
});

test('a save written before entities were packed still loads whole', () => {
  const state = populatedState();
  // Version 3 wrote every entity field explicitly, under the old collection
  // keys. The migration chain merges them, and the defaults pass must agree.
  const { creatures, ...old } = state;
  const restored = deserialize(
    JSON.stringify({
      ...old,
      version: 3,
      encounters: creatures
        .filter((c) => c.disposition === 'hostile')
        .map(({ disposition: _d, stats, met: _m, ...rest }) => ({ ...rest, statBlock: stats })),
      npcs: creatures.filter((c) => c.disposition !== 'hostile'),
    }),
  );
  assert.deepEqual(restored.characters, state.characters.map(withCharacterDefaults));
  assert.deepEqual(restored.creatures, state.creatures.map(withCreatureDefaults));
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
  const expected = state.nodes[0].tiles.map(loadedForm);
  const byId = (tiles) => [...tiles].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(restored.tiles), byId(expected));
  for (const field of ['refs', 'cells', 'fog']) {
    assert.equal(field in restored, false, `${field} is on-disk only, never live state`);
  }
});

test('the positional encoding shrinks a save of a fully explored map', () => {
  const grid = new TileGrid();
  const node = fillTiles(createMapNode('world', 'World', null, 40, 40), (id) =>
    createTile(id, 'assets/tiles/grass/grass-1.svg', { revealed: true }),
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
      creatures: [],
      travelog: [],
      quests: [],
      clock: null,
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

test('deserialize drops a bundled library field from the state', () => {
  // A campaign export can carry the custom library beside the save. The
  // state is rebuilt field by field, so the library never reaches
  // localStorage through persistState; CampaignFile.js lifts it separately.
  const restored = deserialize(
    JSON.stringify({
      version: CURRENT_VERSION,
      nodes: [{ id: 'world', tiles: [] }],
      library: { spells: [{ name: 'Zap' }] },
    }),
  );
  assert.equal('library' in restored, false);
});

test('deserialize defaults missing fields instead of throwing', () => {
  const restored = deserialize(JSON.stringify({}));
  assert.deepEqual(restored, {
    version: CURRENT_VERSION,
    nodes: [],
    party: null,
    characters: [],
    creatures: [],
    travelog: [],
    quests: [],
    clock: null,
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
      creatures: 'none',
      quests: null,
    }),
  );
  assert.deepEqual(
    restored.nodes.map((n) => n.id),
    ['world'],
    'a node with no id has no place in the grid',
  );
  assert.equal(restored.characters.length, 1);
  assert.deepEqual(restored.creatures, [], 'a non-array collection reads as empty');
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
  assert.deepEqual(restored.combat, { round: 1, index: 0, order: [], startedAt: 0 });
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
      {
        id: 'c1',
        initiative: 17,
        modifier: 2,
        used: { ...freshBudget(), action: true, bonus: true },
      },
      { id: 'e1', initiative: 9, modifier: -1, used: freshBudget() },
    ],
    startedAt: 1700000000000,
  };
  const state = buildState({ grid, combat });
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored.combat, combat, 'a fight resumes with what each turn already spent');
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
  // A save this old carries no action budget either, which reads as a fresh turn.
  assert.deepEqual(restored.combat?.order, [
    { id: 'c1', initiative: 17, modifier: 2, used: freshBudget() },
  ]);
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
    creatures: [],
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
