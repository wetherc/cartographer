import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENTRANCE_ART,
  entranceArtFor,
  freshNodeId,
  relandedTile,
  tileWithinBounds,
} from '../src/map/NodeEdits.js';
import { coerceNodeKind } from '../src/map/NodeKinds.js';

/** An rng handing back the given values in order, then repeating the last. */
function scriptedRng(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test('a fresh id looks like a node id and is not one the grid holds', () => {
  const id = freshNodeId(() => false, scriptedRng([0.123456789]));
  assert.match(id, /^node-[a-z0-9]{1,6}$/);
});

test('a colliding id is retried rather than handed out', () => {
  const first = freshNodeId(() => false, scriptedRng([0.5]));
  const rng = scriptedRng([0.5, 0.25]);
  const second = freshNodeId((id) => id === first, rng);
  assert.notEqual(second, first);
});

test('a tile still inside the new bounds is left where it is', () => {
  assert.equal(tileWithinBounds('2,3', 6, 6), null);
  assert.equal(tileWithinBounds('5,5', 6, 6), null);
});

test('a tile outside the new bounds is pulled to the nearest one inside', () => {
  assert.equal(tileWithinBounds('9,3', 6, 6), '5,3');
  assert.equal(tileWithinBounds('2,9', 6, 6), '2,5');
  assert.equal(tileWithinBounds('9,9', 6, 6), '5,5');
});

test('a tile id that cannot be read lands on the origin', () => {
  assert.equal(tileWithinBounds('nonsense', 6, 6), '0,0');
  assert.equal(tileWithinBounds('', 6, 6), '0,0');
});

const layout = { width: 8, height: 8, entry: '4,4' };

test('a party outside the regenerated extent re-lands on the entry tile', () => {
  assert.equal(relandedTile({ ...layout, tileId: '9,1', landing: '9,1' }), '4,4');
  assert.equal(relandedTile({ ...layout, tileId: '1,20', landing: '1,20' }), '4,4');
});

test('an unreadable party position counts as outside', () => {
  assert.equal(relandedTile({ ...layout, tileId: 'nonsense', landing: 'nonsense' }), '4,4');
});

test('a party on a tile the layout still accepts stays put', () => {
  assert.equal(relandedTile({ ...layout, tileId: '2,2', landing: '2,2' }), null);
});

test('a party on what became a wall moves to whatever the entry rules resolve', () => {
  assert.equal(relandedTile({ ...layout, tileId: '2,2', landing: '2,3' }), '2,3');
});

test('the three marked archetypes carry entrance art and wilderness carries none', () => {
  assert.deepEqual(entranceArtFor('dungeon'), { marker: 'dungeon', poi: 'dungeon' });
  assert.deepEqual(entranceArtFor('castle'), { marker: 'castle', poi: 'landmark' });
  assert.deepEqual(entranceArtFor('town'), { marker: 'settlement', poi: 'settlement' });
  assert.equal(entranceArtFor('wilderness'), null);
  assert.equal(entranceArtFor(''), null);
});

test('every entrance-art entry names both a marker and a POI type', () => {
  for (const [archetype, art] of Object.entries(ENTRANCE_ART)) {
    assert.ok(art.marker, `${archetype} has a marker`);
    assert.ok(art.poi, `${archetype} has a POI type`);
  }
});

test('a kind the dialog or a save cannot justify falls back', () => {
  assert.equal(coerceNodeKind('region', 'interior'), 'region');
  assert.equal(coerceNodeKind('interior', 'region'), 'interior');
  assert.equal(coerceNodeKind('dungeon', 'region'), 'region');
  assert.equal(coerceNodeKind(undefined, 'interior'), 'interior');
  assert.equal(coerceNodeKind(null, 'region'), 'region');
});
