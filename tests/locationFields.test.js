import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  locationFields,
  locationOptions,
  moveToPartyChange,
  pickOnMapChange,
  placementChange,
  placementWarning,
  readLocation,
} from '../src/app/locationFields.js';
import { createMapNode, createTile, setTile } from '../src/map/TileGrid.js';
import { interiorArt } from '../src/map/TileKinds.js';
import { stubApp, stubGrid } from './helpers/app.js';

const world = createMapNode('world', 'Aldenmoor', null, 8, 8);
const region = createMapNode('vale', 'Green Vale', 'world', 4, 6);
// The fields read the grid alone: the node lookup, and the breadcrumb walk the
// picker labels each map by.
const app = stubApp({
  grid: stubGrid([world, region]),
  navigator: /** @type {any} */ ({ currentNodeId: 'world' }),
});

test('the picker offers the unplaced option first, then every map under its parent', () => {
  const [picker] = locationFields(app, null);
  assert.equal(picker.name, 'nodeId');
  assert.deepEqual(picker.options, [
    { value: '', label: 'Unplaced (appears everywhere)' },
    { value: 'world', label: 'Aldenmoor' },
    { value: 'vale', label: 'Green Vale', group: 'Aldenmoor' },
  ]);
});

test('locationOptions lists top-level maps first, then each parent group depth first', () => {
  const node = (/** @type {string} */ id, /** @type {string | null} */ parentId) =>
    createMapNode(id, id.toUpperCase(), parentId, 2, 2);
  const nodes = [
    node('world', null),
    node('vale', 'world'),
    node('town', 'vale'),
    node('reach', 'world'),
    node('inn', 'town'),
    node('lost', 'gone'),
  ];
  assert.deepEqual(
    locationOptions(nodes, (id) => `path:${id}`),
    [
      { value: 'world', label: 'WORLD' },
      { value: 'lost', label: 'LOST' },
      { value: 'vale', label: 'VALE', group: 'path:world' },
      { value: 'reach', label: 'REACH', group: 'path:world' },
      { value: 'town', label: 'TOWN', group: 'path:vale' },
      { value: 'inn', label: 'INN', group: 'path:town' },
    ],
  );
  assert.deepEqual(
    locationOptions([], (id) => id),
    [],
  );
});

test('the party button is added only on request', () => {
  assert.deepEqual(
    locationFields(app, null).map((f) => f.name),
    ['nodeId', 'tileX', 'tileY'],
  );
  const button = locationFields(app, null, { partyButton: true }).at(-1);
  assert.equal(button?.name, 'toParty');
  assert.equal(button?.type, 'button');
});

/** @param {string} tileId */
function partyForm(tileId) {
  /** @type {Record<string, string | number>} */
  const set = {};
  const form = /** @type {any} */ ({
    set: (/** @type {string} */ k, /** @type {string | number} */ v) => {
      set[k] = v;
    },
  });
  const change = moveToPartyChange(
    /** @type {any} */ ({ partyTracker: { getPosition: () => ({ nodeId: 'vale', tileId }) } }),
  );
  return { set, form, change };
}

test('the party button writes the party map, column, and row, and ignores other fields', () => {
  const { set, form, change } = partyForm('4,2');
  assert.equal(change('name', form), false);
  assert.deepEqual(set, {});
  assert.equal(change('toParty', form), true);
  assert.deepEqual(set, { nodeId: 'vale', tileX: 5, tileY: 3 });
});

test('the party button falls back to the first tile for an unreadable tile id', () => {
  const { set, form, change } = partyForm('bad');
  change('toParty', form);
  assert.deepEqual(set, { nodeId: 'vale', tileX: 1, tileY: 1 });
});

test('the unplaced label can be reworded for a character', () => {
  const [picker] = locationFields(app, null, { unplacedLabel: 'With the party' });
  assert.equal(picker.options?.[0].label, 'With the party');
});

test('an existing location pre-selects its map and shows its column and row from 1', () => {
  const [picker, x, y] = locationFields(app, { nodeId: 'vale', tileId: '2,3' });
  assert.equal(picker.value, 'vale');
  assert.equal(x.label, 'Column');
  assert.equal(y.label, 'Row');
  assert.equal(x.value, 3, 'stored column 2 is the third column a GM sees');
  assert.equal(y.value, 4);
});

test('no location, or one whose tile id cannot be read, opens at the top-left tile', () => {
  for (const location of [null, { nodeId: 'vale', tileId: 'nonsense' }]) {
    const [, x, y] = locationFields(app, location);
    assert.equal(x.value, 1);
    assert.equal(y.value, 1);
  }
});

test('the coordinate fields refuse numbers below 1', () => {
  const [, x, y] = locationFields(app, null);
  assert.equal(x.min, 1);
  assert.equal(y.min, 1);
});

test('reading back a picked map and 1-based coordinates gives a 0-based tile id', () => {
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '3', tileY: '4' }), {
    nodeId: 'vale',
    tileId: '2,3',
  });
});

test('a position copied from the map description lands on the same tile', () => {
  // The screen reader says "column 1, row 1" for the top-left tile, and the
  // dialog reads those numbers straight back to the stored id "0,0".
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '1', tileY: '1' }), {
    nodeId: 'vale',
    tileId: '0,0',
  });
});

test('coordinates outside the chosen map are clamped to its bounds', () => {
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '99', tileY: '99' }), {
    nodeId: 'vale',
    tileId: '3,5',
  });
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '-4', tileY: '0' }), {
    nodeId: 'vale',
    tileId: '0,0',
  });
});

test('unreadable coordinates land on the top-left tile rather than on NaN', () => {
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '', tileY: 'x' }), {
    nodeId: 'vale',
    tileId: '0,0',
  });
});

test('the unplaced option and a map that is gone both read as no location', () => {
  assert.equal(readLocation(app, { nodeId: '', tileX: '2', tileY: '3' }), null);
  assert.equal(readLocation(app, { nodeId: 'deleted', tileX: '2', tileY: '3' }), null);
});

const painted = [
  createTile('0,0', 'assets/tiles/grass/grass-1.png'),
  createTile('1,0', 'assets/tiles/deep-water/deep-water-1.png'),
  createTile('2,0', interiorArt('wall-h')),
].reduce(setTile, createMapNode('cove', 'Cove', null, 3, 2));

test('placementWarning names a tile outside the map, an empty cell, water, and a wall', () => {
  assert.equal(placementWarning(painted, 1, 1), '');
  assert.equal(placementWarning(undefined, 9, 9), '');
  assert.match(placementWarning(painted, 4, 1), /outside this map, which is 3 by 2 tiles/);
  assert.match(placementWarning(painted, '', 1), /outside/);
  assert.equal(placementWarning(painted, 1, 2), 'That tile has no terrain.');
  assert.equal(placementWarning(painted, 2, 1), 'That tile is deep water.');
  assert.equal(placementWarning(painted, 3, 1), 'That tile is a wall or an obstacle.');
});

test('placementWarning rounds a fraction down to the tile that the save uses', () => {
  assert.equal(placementWarning(painted, 1.5, 1), '');
  assert.equal(placementWarning(painted, 2.9, 1), 'That tile is deep water.');
  assert.match(placementWarning(painted, 3.5, 1), /outside/);
});

test('locationFields adds the warning line only when asked, hidden while empty', () => {
  const coveApp = stubApp({ grid: stubGrid([painted]) });
  assert.ok(!locationFields(coveApp, null).some((f) => f.name === 'placementNote'));
  const note = (/** @type {string} */ tileId) =>
    locationFields(coveApp, { nodeId: 'cove', tileId }, { warn: true }).find(
      (f) => f.name === 'placementNote',
    );
  assert.deepEqual([note('1,0')?.label, note('1,0')?.hidden], ['That tile is deep water.', false]);
  assert.deepEqual([note('0,0')?.label, note('0,0')?.hidden], ['', true]);
  assert.equal(locationFields(coveApp, null, { warn: true }).at(-1)?.label, '');
});

test('placementChange rewrites the warning after a placement edit only', () => {
  const coveApp = stubApp({ grid: stubGrid([painted]) });
  /** @type {Record<string, string>} */
  const values = { nodeId: 'cove', tileX: '2', tileY: '1' };
  /** @type {any[]} */
  const calls = [];
  const form = /** @type {any} */ ({
    get: (/** @type {string} */ n) => values[n],
    setLabel: (/** @type {string} */ n, /** @type {string} */ t) => calls.push(['label', n, t]),
    setHidden: (/** @type {string} */ n, /** @type {boolean} */ h) => calls.push(['hidden', n, h]),
  });
  const change = placementChange(coveApp);
  assert.equal(change('name', form), false);
  assert.deepEqual(calls, []);
  assert.equal(change('tileX', form), false);
  assert.deepEqual(calls, [
    ['label', 'placementNote', 'That tile is deep water.'],
    ['hidden', 'placementNote', false],
  ]);
  values.nodeId = '';
  change('nodeId', form);
  assert.deepEqual(calls.slice(2), [
    ['label', 'placementNote', ''],
    ['hidden', 'placementNote', true],
  ]);
});

test('the pick button field comes before the party button', () => {
  const names = locationFields(app, null, { pickButton: true, partyButton: true }).map(
    (f) => f.name,
  );
  assert.deepEqual(names.slice(-2), ['pickOnMap', 'toParty']);
  assert.ok(!locationFields(app, null).some((f) => f.name === 'pickOnMap'));
});

test('the pick button shows only in a mode that shows the map', () => {
  const picks = (/** @type {string} */ mode) =>
    locationFields(stubApp({ grid: app.grid, state: { mode } }), null, {
      pickButton: true,
    }).some((f) => f.name === 'pickOnMap');
  assert.deepEqual(['play', 'build', 'library', 'combat'].map(picks), [true, true, false, false]);
});

/**
 * A form stub whose `suspend` runs the work at once and records the field
 * it refocuses.
 * @param {import('../src/types/entities.js').EncounterLocation | null} picked
 */
async function pickForm(picked) {
  /** @type {Record<string, string>} */
  const values = { nodeId: 'world', tileX: '1', tileY: '1' };
  /** @type {any[]} */
  const calls = [];
  /** @type {Promise<void>[]} */
  const pending = [];
  const form = /** @type {any} */ ({
    get: (/** @type {string} */ n) => values[n],
    set: (/** @type {string} */ n, /** @type {string | number} */ v) => {
      values[n] = String(v);
    },
    setLabel: (/** @type {string} */ n, /** @type {string} */ t) => calls.push(['label', n, t]),
    setHidden: (/** @type {string} */ n, /** @type {boolean} */ h) => calls.push(['hidden', n, h]),
    setOptions: (/** @type {string} */ n, /** @type {any[]} */ o) =>
      calls.push(['options', n, o.map((x) => x.value)]),
    suspend: (/** @type {string} */ n, /** @type {() => Promise<void>} */ work) => {
      calls.push(['suspend', n]);
      pending.push(work());
    },
  });
  const change = pickOnMapChange(app, async () => picked);
  assert.equal(change('tileX', form), false);
  assert.equal(change('pickOnMap', form), true);
  await Promise.all(pending);
  return { values, calls };
}

test('a map pick writes the picked map, column, and row, and updates the warning', async () => {
  const { values, calls } = await pickForm({ nodeId: 'vale', tileId: '2,4' });
  assert.deepEqual(values, { nodeId: 'vale', tileX: '3', tileY: '5' });
  assert.deepEqual(calls, [
    ['suspend', 'pickOnMap'],
    ['options', 'nodeId', ['', 'world', 'vale']],
    ['label', 'placementNote', 'That tile has no terrain.'],
    ['hidden', 'placementNote', false],
  ]);
});

test('a cancelled map pick leaves the fields as they were', async () => {
  const { values, calls } = await pickForm(null);
  assert.deepEqual(values, { nodeId: 'world', tileX: '1', tileY: '1' });
  assert.deepEqual(calls, [['suspend', 'pickOnMap']]);
});

test('a map pick opens the chosen map first when another map is in view', async () => {
  /** @type {string[]} */
  const opened = [];
  const local = stubApp({
    grid: app.grid,
    navigator: /** @type {any} */ ({ currentNodeId: 'world' }),
    actions: { goToNode: (/** @type {string} */ id) => opened.push(id) },
  });
  /** @type {Promise<void>[]} */
  const pending = [];
  for (const nodeId of ['vale', 'world', '', 'gone']) {
    const form = /** @type {any} */ ({
      get: () => nodeId,
      suspend: (/** @type {string} */ _n, /** @type {() => Promise<void>} */ work) =>
        pending.push(work()),
    });
    pickOnMapChange(local, async () => null)('pickOnMap', form);
  }
  await Promise.all(pending);
  assert.deepEqual(opened, ['vale']);
});
