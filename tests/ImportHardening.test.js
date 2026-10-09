import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deserialize } from '../src/storage/SaveManager.js';
import { overlayList } from '../src/map/TileGrid.js';
import { imageSrcForRef } from '../src/map/MapRenderer.js';
import { exceedsExportCap } from '../src/map/MapExport.js';
import { isoTimestamp } from '../src/log/Travelogue.js';
import { addXP, MAX_LEVEL } from '../src/entities/Character.js';
import { XP_THRESHOLDS } from '../src/entities/Experience.js';
import { hasWeaponProperty } from '../src/entities/Weapons.js';

/**
 * Each test here feeds one malformed campaign file through `deserialize`,
 * then runs the code that used to throw on the loaded result. An import
 * stores what it reads and reloads it, so a field that survives the load
 * with a bad type becomes the stored save of an app that no longer starts.
 * @param {Record<string, any>} fields
 */
function loadFile(fields) {
  return deserialize(JSON.stringify({ version: 7, ...fields }));
}

/** @param {Record<string, any>} tile */
function loadTile(tile) {
  const state = loadFile({
    nodes: [
      { id: 'n', name: 'Node', parentId: null, width: 2, height: 2, tiles: [tile] },
      { id: 'r', name: 'Linked', parentId: 'n', width: 1, height: 1, tiles: [] },
    ],
  });
  return state.nodes[0].tiles[0];
}

test('a non-string overlay loads as no overlay, so every draw can read its refs', () => {
  for (const overlayRef of [[5], 7, { ref: 'x' }, true, [], [null, 3]]) {
    const tile = loadTile({ id: '0,0', imageRef: 'g.svg', overlayRef });
    assert.equal(tile.overlayRef, null, `${JSON.stringify(overlayRef)} reads as no overlay`);
    assert.deepEqual(overlayList(tile), []);
  }
});

test('an overlay stack keeps only its string members', () => {
  const tile = loadTile({
    id: '0,0',
    imageRef: 'g.svg',
    overlayRef: ['coast.svg', 4, 'river.svg'],
  });
  assert.deepEqual(tile.overlayRef, ['coast.svg', 'river.svg']);
  // The renderer maps every overlay through this, which reads a string.
  assert.deepEqual(overlayList(tile).map(imageSrcForRef), ['/coast.svg', '/river.svg']);
  assert.equal(
    loadTile({ id: '0,0', imageRef: 'g.svg', overlayRef: 'road.svg' }).overlayRef,
    'road.svg',
  );
});

test('a childNodeId that is not a string loads as no link', () => {
  assert.equal(loadTile({ id: '0,0', imageRef: 'g.svg', childNodeId: 12 }).childNodeId, null);
  assert.equal(loadTile({ id: '0,0', imageRef: 'g.svg', childNodeId: ['r'] }).childNodeId, null);
  assert.equal(loadTile({ id: '0,0', imageRef: 'g.svg', childNodeId: 'r' }).childNodeId, 'r');
});

test('a span survives only as a whole cell count above one', () => {
  assert.equal(loadTile({ id: '0,0', imageRef: 'g.svg', span: 3 }).span, 3);
  assert.equal(loadTile({ id: '0,0', imageRef: 'g.svg', span: 2.9 }).span, 2);
  for (const span of ['3', 1, 1.5, 0, -2, Infinity, null, { n: 2 }]) {
    const tile = loadTile({ id: '0,0', imageRef: 'g.svg', span });
    assert.equal('span' in tile, false, `${JSON.stringify(span)} is dropped`);
  }
});

test('metadata fields of the wrong type load as their defaults', () => {
  const tile = loadTile({
    id: '0,0',
    imageRef: 'g.svg',
    metadata: { poiType: 4, discoverable: 'yes', discovered: 1, notes: ['a'] },
  });
  assert.deepEqual(tile.metadata, {
    poiType: null,
    discoverable: false,
    discovered: false,
    notes: '',
  });
  const kept = loadTile({
    id: '0,0',
    imageRef: 'g.svg',
    metadata: { poiType: 'shop', discoverable: true, discovered: true, notes: 'Rope.' },
  });
  assert.deepEqual(kept.metadata, {
    poiType: 'shop',
    discoverable: true,
    discovered: true,
    notes: 'Rope.',
  });
});

test('an oversized node is refused by the PNG export instead of drawn', () => {
  // 512x512 tiles at the smallest readable size fill the canvas budget of the
  // browser exactly. One row more fits no size at all.
  const [largest, huge] = loadFile({
    nodes: [
      { id: 'a', name: 'A', parentId: null, width: 512, height: 512, tiles: [] },
      { id: 'b', name: 'B', parentId: null, width: 513, height: 512, tiles: [] },
    ],
  }).nodes;
  assert.equal(exceedsExportCap(largest), false);
  assert.equal(exceedsExportCap(huge), true);
});

test('a travelog entry with an unreadable timestamp loads with a date the panels can format', () => {
  const [entry] = loadFile({
    travelog: [{ id: 'e1', at: 'bad', kind: 'travel', message: 'Moved north.' }],
  }).travelog;
  assert.equal(entry.at, 0);
  assert.equal(isoTimestamp(entry.at), '1970-01-01T00:00:00.000Z');
  assert.equal(isoTimestamp(Number('bad')), null, 'the raw value gave no date at all');
});

test('travelog entries coerce every field and drop an entry with no id', () => {
  const state = loadFile({
    travelog: [
      { id: 'e1', at: 5, kind: 'weird', message: 42 },
      { id: '', at: 5, kind: 'travel', message: 'nameless' },
      { at: 5, kind: 'travel', message: 'nameless' },
      'text',
      { id: 'e2', at: 9, kind: 'roll', message: 'Rolled a 20.' },
    ],
  });
  assert.deepEqual(state.travelog, [
    { id: 'e1', at: 5, kind: 'note', message: '' },
    { id: 'e2', at: 9, kind: 'roll', message: 'Rolled a 20.' },
  ]);
});

test('quests coerce their text fields, status, and reveal flag, and keep unknown fields', () => {
  const state = loadFile({
    quests: [
      { id: 'q1', title: 7, notes: null, status: 'done', extra: true },
      {
        id: 'q2',
        title: 'Find the key',
        notes: 'Under the mat.',
        status: 'completed',
        revealed: true,
      },
      { id: 'q3', title: 'Rumor', revealed: 'yes' },
      { title: 'no id' },
    ],
  });
  const none = { objectives: [], links: [], unlocks: [] };
  assert.deepEqual(state.quests, [
    { id: 'q1', title: '', notes: '', status: 'active', revealed: false, extra: true, ...none },
    {
      id: 'q2',
      title: 'Find the key',
      notes: 'Under the mat.',
      status: 'completed',
      revealed: true,
      ...none,
    },
    { id: 'q3', title: 'Rumor', notes: '', status: 'active', revealed: false, ...none },
  ]);
});

test('quest objectives coerce their fields and get unique ids', () => {
  const state = loadFile({
    quests: [
      {
        id: 'q1',
        objectives: [
          { id: 'o1', text: 'Find the key', done: true, hidden: true },
          { id: 'o1', text: 7, done: 'yes', hidden: 1 },
          { text: 'No id' },
          'not a record',
        ],
      },
    ],
  });
  assert.deepEqual(state.quests[0].objectives, [
    { id: 'o1', text: 'Find the key', done: true, hidden: true },
    { id: 'o4', text: '', done: false, hidden: false },
    { id: 'o5', text: 'No id', done: false, hidden: false },
  ]);
});

test('quest links keep a readable place or creature and drop the rest', () => {
  const state = loadFile({
    quests: [
      {
        id: 'q1',
        links: [
          { kind: 'place', nodeId: 'world', tileId: '2,3' },
          { kind: 'place', nodeId: 'town', tileId: 5 },
          { kind: 'creature', creatureId: 'bram', extra: true },
          { kind: 'place', nodeId: '' },
          { kind: 'creature' },
          { kind: 'npc', creatureId: 'bram' },
          null,
        ],
      },
    ],
  });
  assert.deepEqual(state.quests[0].links, [
    { kind: 'place', nodeId: 'world', tileId: '2,3' },
    { kind: 'place', nodeId: 'town', tileId: null },
    { kind: 'creature', creatureId: 'bram' },
  ]);
});

test('bestiary templates coerce the fields the spawn dialog reads', () => {
  const state = loadFile({
    bestiary: [
      { id: 't1', name: 3, maxHP: 'lots', stats: 'none', weapon: 'club', armor: 4, level: 2 },
      {
        id: 't2',
        name: 'Goblin',
        maxHP: 7,
        stats: { AC: 13 },
        weapon: null,
        armor: { name: 'Hide' },
      },
      { name: 'no id' },
    ],
  });
  assert.deepEqual(state.bestiary, [
    { id: 't1', name: 'Creature', maxHP: 1, stats: {}, level: 2 },
    {
      id: 't2',
      name: 'Goblin',
      maxHP: 7,
      stats: { AC: 13 },
      weapons: [],
      armor: { name: 'Hide' },
    },
  ]);
  assert.equal('weapon' in state.bestiary[0], false, 'a gear slot of the wrong type is dropped');
  assert.equal('weapons' in state.bestiary[0], false, 'an absent list stays absent');
});

test('a character with a level or XP outside the range loads clamped and levels in one step', () => {
  const hero = (/** @type {Record<string, any>} */ fields) =>
    loadFile({ characters: [{ id: 'c', name: 'Hero', ...fields }] }).characters[0];
  assert.equal(hero({ level: -3e7, xp: 0 }).level, 1);
  assert.equal(hero({ level: -1e15 }).level, 1);
  assert.equal(hero({ level: '7', xp: '50' }).level, 7, 'a numeric string reads as its number');
  assert.equal(
    hero({ level: '7', xp: '50' }).xp,
    23000,
    'a total below the level start rises to it',
  );
  assert.equal(hero({ level: 99 }).level, MAX_LEVEL);
  assert.equal(hero({ xp: -20 }).xp, 0);
  assert.equal(hero({ xp: 1e9 }).xp, XP_THRESHOLDS[MAX_LEVEL - 1]);
  assert.equal(hero({ level: null, xp: 'abc' }).level, 1);
  assert.equal(hero({ level: null, xp: 'abc' }).xp, 0);

  const started = Date.now();
  const awarded = addXP(hero({ level: -1e15, xp: 0 }), 350);
  assert.ok(Date.now() - started < 1000, 'the award returns at once');
  assert.equal(awarded.level, 2);
  assert.equal(awarded.xp, 350);
  const stringLevel = addXP(hero({ level: '7' }), 11000);
  assert.equal(stringLevel.level, 8, 'a level stored as text still adds as a number');
});

test('a weapon with a properties record loads with a list the attack path can read', () => {
  const state = deserialize(
    JSON.stringify({
      version: 6,
      creatures: [
        {
          id: 'g',
          name: 'Goblin',
          disposition: 'hostile',
          maxHP: 7,
          currentHP: 7,
          stats: {},
          weapon: {
            name: 'Scimitar',
            kind: 'melee',
            category: 'martial',
            properties: { a: 1 },
            damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
          },
          armor: null,
        },
      ],
      characters: [
        {
          id: 'c',
          name: 'Hero',
          inventory: [
            { id: 'i', name: 'Club', type: 'weapon', kind: 'melee', properties: 'heavy' },
          ],
        },
      ],
    }),
  );
  const weapon = state.creatures[0].weapons[0];
  assert.ok(weapon);
  assert.deepEqual(weapon.properties, []);
  assert.equal(hasWeaponProperty(weapon, 'finesse'), false);
  const club = state.characters[0].inventory[0];
  assert.deepEqual(club.properties, []);
  assert.equal(hasWeaponProperty(club, 'heavy'), false);
});

test('a pre-merge save with many colliding ids gives each creature its own id', () => {
  const encounters = Array.from({ length: 300 }, (_, i) => ({
    id: 'goblin',
    name: 'Goblin',
    statBlock: {},
    maxHP: 7,
    currentHP: 7,
    level: 1,
    order: i,
  }));
  const state = deserialize(JSON.stringify({ version: 5, encounters }));
  const ids = state.creatures.map((c) => c.id);
  assert.equal(new Set(ids).size, 300, 'every creature keeps a distinct id');
  assert.equal(ids[0], 'goblin', 'the first holder keeps its id');
  assert.equal(ids[1], 'goblin-2');
  assert.equal(ids[299], 'goblin-300');
});

/**
 * @param {Record<string, any>} fields
 */
function loadHero(fields) {
  return loadFile({ characters: [{ id: 'c', name: 'Hero', ...fields }] }).characters[0];
}

/**
 * @param {Record<string, any>} fields
 */
function loadFoe(fields) {
  return loadFile({ creatures: [{ id: 'w', name: 'Wolf', ...fields }] }).creatures[0];
}

test('a character resource with no string id drops on load', () => {
  for (const id of [null, {}, -1, '', undefined]) {
    const hero = loadHero({ resources: [{ id, current: 1, max: 2 }] });
    assert.ok(
      hero.resources.every((/** @type {any} */ r) => typeof r.id === 'string' && r.id),
      `id ${JSON.stringify(id)} drops`,
    );
  }
  assert.ok(loadHero({ resources: [{}] }));
});

test('a class list that is not a list of records loads as the records it has', () => {
  assert.deepEqual(loadHero({ classes: -1 }).classes, []);
  assert.deepEqual(loadHero({ classes: [null] }).classes, []);
  const mixed = loadHero({ level: 3, classes: [null, 'x', { classId: 'fighter', level: 3 }] });
  assert.deepEqual(
    mixed.classes.map((/** @type {any} */ c) => c.classId),
    ['fighter'],
  );
});

test('ASI choices keep only their record entries', () => {
  assert.deepEqual(loadHero({ asiChoices: [null] }).asiChoices, {});
  assert.deepEqual(loadHero({ asiChoices: 5 }).asiChoices, {});
  assert.deepEqual(loadHero({ asiChoices: { slot: null } }).asiChoices, {});
});

test('a character level that is not a number loads as level 1', () => {
  assert.equal(loadHero({ level: '__proto__' }).level, 1);
  assert.equal(loadHero({ level: {} }).level, 1);
});

test('a creature level or caster level that is not a number loads as absent', () => {
  for (const bad of ['__proto__', {}, [], true, '']) {
    const foe = loadFoe({ class: 'wizard', level: bad, casterLevel: bad });
    assert.equal(foe.level, undefined, `level ${JSON.stringify(bad)}`);
    assert.equal(foe.casterLevel, 1, `caster level ${JSON.stringify(bad)} reads as 1`);
  }
  const numeric = loadFoe({ class: 'wizard', level: '5', casterLevel: 99 });
  assert.equal(numeric.level, 5);
  assert.equal(numeric.casterLevel, 20);
  assert.equal(loadFoe({ class: 'wizard', level: 4 }).casterLevel, 4);
});

test('a creature resource with no string id drops on load', () => {
  const foe = loadFoe({ resources: [{ id: null }, { id: 'rage', current: 1, max: 1 }] });
  assert.deepEqual(
    foe.resources.map((/** @type {any} */ r) => r.id),
    ['rage'],
  );
});

test('a bestiary weapon list keeps its records, and a single weapon reads as a list of one', () => {
  const bite = { name: 'Bite', kind: 'melee', damage: [] };
  const state = loadFile({
    bestiary: [
      { id: 't1', name: 'Wolf', maxHP: 11, stats: {}, weapons: [bite, 'claw', null] },
      { id: 't2', name: 'Dog', maxHP: 5, stats: {}, weapon: bite },
    ],
  });
  assert.deepEqual(state.bestiary[0].weapons, [bite]);
  assert.deepEqual(state.bestiary[1].weapons, [bite]);
  assert.equal('weapon' in state.bestiary[1], false);
});
