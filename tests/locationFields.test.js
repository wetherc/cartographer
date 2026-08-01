import { test } from 'node:test';
import assert from 'node:assert/strict';

import { locationFields, readLocation } from '../src/app/locationFields.js';
import { createMapNode } from '../src/map/TileGrid.js';
import { stubApp, stubGrid } from './helpers/app.js';

const world = createMapNode('world', 'Aldenmoor', null, 8, 8);
const region = createMapNode('vale', 'Green Vale', 'world', 4, 6);
// The fields read the grid alone: the node lookup, and the breadcrumb walk the
// picker labels each map by.
const app = stubApp({ grid: stubGrid([world, region]) });

test('the picker offers the unplaced option first, then every map by its path', () => {
  const [picker] = locationFields(app, null);
  assert.equal(picker.name, 'nodeId');
  assert.deepEqual(picker.options, [
    { value: '', label: 'Unplaced (appears everywhere)' },
    { value: 'world', label: 'Aldenmoor' },
    { value: 'vale', label: 'Aldenmoor / Green Vale' },
  ]);
});

test('the unplaced label can be reworded for a character', () => {
  const [picker] = locationFields(app, null, { unplacedLabel: 'With the party' });
  assert.equal(picker.options?.[0].label, 'With the party');
});

test('an existing location pre-selects its map and coordinates', () => {
  const [picker, x, y] = locationFields(app, { nodeId: 'vale', tileId: '2,3' });
  assert.equal(picker.value, 'vale');
  assert.equal(x.value, 2);
  assert.equal(y.value, 3);
});

test('no location, or one whose tile id cannot be read, opens at the origin', () => {
  for (const location of [null, { nodeId: 'vale', tileId: 'nonsense' }]) {
    const [, x, y] = locationFields(app, location);
    assert.equal(x.value, 0);
    assert.equal(y.value, 0);
  }
});

test('the coordinate fields refuse negative numbers', () => {
  const [, x, y] = locationFields(app, null);
  assert.equal(x.min, 0);
  assert.equal(y.min, 0);
});

test('reading back a picked map and coordinates gives a location', () => {
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '2', tileY: '3' }), {
    nodeId: 'vale',
    tileId: '2,3',
  });
});

test('coordinates outside the chosen map are clamped to its bounds', () => {
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '99', tileY: '99' }), {
    nodeId: 'vale',
    tileId: '3,5',
  });
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '-4', tileY: '-1' }), {
    nodeId: 'vale',
    tileId: '0,0',
  });
});

test('unreadable coordinates land on the origin rather than on NaN', () => {
  assert.deepEqual(readLocation(app, { nodeId: 'vale', tileX: '', tileY: 'x' }), {
    nodeId: 'vale',
    tileId: '0,0',
  });
});

test('the unplaced option and a map that is gone both read as no location', () => {
  assert.equal(readLocation(app, { nodeId: '', tileX: '2', tileY: '3' }), null);
  assert.equal(readLocation(app, { nodeId: 'deleted', tileX: '2', tileY: '3' }), null);
});
