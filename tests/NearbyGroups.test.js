import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFEATED_KEY, distanceText, distanceTo, groupNearby } from '../src/view/NearbyGroups.js';

const here = { nodeId: 'r', tileId: '5,5' };

/** @returns {any} */
function foe(id, name, tileId, hp = 7, max = 7, nodeId = 'r') {
  return { id, name, currentHP: hp, maxHP: max, location: tileId ? { nodeId, tileId } : null };
}

test('distanceTo rounds the straight-line distance to whole tiles', () => {
  assert.equal(distanceTo(foe('a', 'Wolf', '8,9'), here), 5);
  assert.equal(distanceTo(foe('a', 'Wolf', '6,6'), here), 1);
});

test('distanceTo gives null off the map, unplaced, or with a bad id', () => {
  assert.equal(distanceTo(foe('a', 'Wolf', null), here), null);
  assert.equal(distanceTo(foe('a', 'Wolf', '1,1', 7, 7, 'other'), here), null);
  assert.equal(distanceTo(foe('a', 'Wolf', '1,1'), null), null);
  assert.equal(distanceTo(foe('a', 'Wolf', 'x'), here), null);
});

test('distanceText names tiles in the singular and plural', () => {
  assert.equal(distanceText(1), '1 tile away');
  assert.equal(distanceText(4), '4 tiles away');
  assert.equal(distanceText(null), 'Not on this map');
  assert.equal(distanceText(null, false), 'Not on this map');
  assert.equal(distanceText(null, true), '', 'an unplaced foe shows on every map');
  assert.equal(distanceText(3, true), '3 tiles away');
  assert.equal(distanceText(0), 'Here', 'a foe on the tile of the party');
});

test('groupNearby marks a group with an unplaced member', () => {
  const groups = groupNearby(
    [foe('a', 'Ghost', null), foe('b', 'Wolf', '1,1', 7, 7, 'other'), foe('c', 'Imp', '6,5')],
    here,
  );
  assert.deepEqual(
    groups.map((g) => [g.title, g.distance, g.unplaced]),
    [
      ['Imp', 1, false],
      ['Ghost', null, true],
      ['Wolf', null, false],
    ],
  );
});

test('groupNearby groups copies by name and adds up their HP', () => {
  const groups = groupNearby(
    [foe('a', 'Wolf', '7,5', 5), foe('b', 'Wolf', '9,5', 7), foe('c', 'Bandit', '6,5', 11, 11)],
    here,
  );
  assert.deepEqual(
    groups.map((g) => [g.key, g.title, g.distance, g.current, g.max, g.members.length]),
    [
      ['name:Bandit', 'Bandit', 1, 11, 11, 1],
      ['name:Wolf', 'Wolf x2', 2, 12, 14, 2],
    ],
  );
});

test('groupNearby sorts by name on a tie and puts unplaced groups after placed ones', () => {
  const groups = groupNearby(
    [foe('a', 'Ghost', null), foe('b', 'Wolf', '7,5'), foe('c', 'Bandit', '3,5')],
    here,
  );
  assert.deepEqual(
    groups.map((g) => g.title),
    ['Bandit', 'Wolf', 'Ghost'],
  );
  assert.equal(groups[2].distance, null);
  assert.equal(groupNearby([foe('a', 'Imp', null), foe('b', 'Hag', null)], here)[0].title, 'Hag');
});

test('groupNearby folds every defeated foe into one last group', () => {
  const groups = groupNearby(
    [foe('a', 'Wolf', '7,5', 0), foe('b', 'Bandit', '6,5', -3, 11), foe('c', 'Wolf', '8,5')],
    here,
  );
  assert.deepEqual(
    groups.map((g) => [g.key, g.title, g.current]),
    [
      ['name:Wolf', 'Wolf', 7],
      [DEFEATED_KEY, 'Defeated (2)', 0],
    ],
  );
  assert.deepEqual(groupNearby([], here), []);
});
