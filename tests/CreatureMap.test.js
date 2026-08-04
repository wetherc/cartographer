import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCreature, applyDamage } from '../src/entities/Creature.js';
import {
  creaturesAt,
  creaturesNear,
  creaturesOnTile,
  hostileCreaturesOnTile,
  liveCreaturesOnTile,
  knownCreaturesAt,
  discoveredHostiles,
  meetCreatures,
  isOnTile,
  formatLocation,
} from '../src/entities/CreatureMap.js';

const at = (nodeId, tileId) => ({ nodeId, tileId });

/** A creature placed at a spot, with optional overrides. */
const placed = (id, nodeId, tileId, options = {}) =>
  createCreature(id, id, { location: at(nodeId, tileId), ...options });

test('creaturesAt lists the party node plus every unplaced creature', () => {
  const roster = [
    placed('here', 'n1', '0,0'),
    placed('elsewhere', 'n2', '0,0'),
    createCreature('everywhere', 'everywhere'),
  ];
  const names = creaturesAt(roster, at('n1', '3,3')).map((c) => c.id);
  assert.deepEqual(names, ['here', 'everywhere']);
  assert.deepEqual(
    creaturesAt(roster, null).map((c) => c.id),
    ['everywhere'],
  );
});

test('creaturesNear keeps only the node placements within the radius', () => {
  const roster = [
    placed('close', 'n1', '1,1'),
    placed('far', 'n1', '9,9'),
    placed('otherNode', 'n2', '1,1'),
    createCreature('everywhere', 'everywhere'),
  ];
  const names = creaturesNear(roster, at('n1', '0,0'), 3).map((c) => c.id);
  assert.deepEqual(names, ['close', 'everywhere']);
});

test('knownCreaturesAt hides placed unmet creatures and every hostile', () => {
  const met = { ...placed('met', 'n1', '0,0'), met: true };
  const roster = [
    met,
    placed('unmet', 'n1', '1,1'),
    { ...placed('foe', 'n1', '2,2', { disposition: 'hostile' }), met: true },
    createCreature('everywhere', 'everywhere'),
  ];
  const names = knownCreaturesAt(roster, at('n1', '3,3')).map((c) => c.id);
  assert.deepEqual(names, ['met', 'everywhere']);
});

test('discoveredHostiles follows the fog for placed foes and met for unplaced ones', () => {
  const node = {
    tiles: [
      { id: '0,0', revealed: true },
      { id: '5,5', revealed: false },
    ],
  };
  const roster = [
    placed('seen', 'n1', '0,0', { disposition: 'hostile' }),
    placed('fogged', 'n1', '5,5', { disposition: 'hostile' }),
    placed('friendly', 'n1', '0,0'),
    { ...createCreature('roamerMet', 'roamerMet', { disposition: 'hostile' }), met: true },
    createCreature('roamerUnmet', 'roamerUnmet', { disposition: 'hostile' }),
  ];
  const names = discoveredHostiles(roster, at('n1', '1,1'), /** @type {any} */ (node)).map(
    (c) => c.id,
  );
  assert.deepEqual(names, ['seen', 'roamerMet']);
  assert.deepEqual(
    discoveredHostiles(roster, null, null).map((c) => c.id),
    ['roamerMet'],
    'an unplaced met hostile stays discovered without a position',
  );
});

test('creaturesOnTile takes the exact tile only, defeated ones included', () => {
  const roster = [
    placed('onTile', 'n1', '2,2'),
    applyDamage(placed('downed', 'n1', '2,2', { maxHP: 5 }), 5),
    placed('nextTile', 'n1', '2,3'),
    createCreature('everywhere', 'everywhere'),
  ];
  const names = creaturesOnTile(roster, at('n1', '2,2')).map((c) => c.id);
  assert.deepEqual(names, ['onTile', 'downed']);
  assert.deepEqual(creaturesOnTile(roster, null), []);
});

test('hostileCreaturesOnTile drops the defeated and the bystanders', () => {
  const live = placed('live', 'n1', '2,2', { disposition: 'hostile', maxHP: 5 });
  const down = applyDamage(placed('down', 'n1', '2,2', { disposition: 'hostile', maxHP: 5 }), 5);
  const bystander = placed('bystander', 'n1', '2,2');
  const roster = [live, down, bystander];
  assert.deepEqual(
    hostileCreaturesOnTile(roster, at('n1', '2,2')).map((c) => c.id),
    ['live'],
  );
});

test('liveCreaturesOnTile keeps bystanders and drops only the defeated', () => {
  const live = placed('live', 'n1', '2,2', { disposition: 'hostile', maxHP: 5 });
  const down = applyDamage(placed('down', 'n1', '2,2', { disposition: 'hostile', maxHP: 5 }), 5);
  const bystander = placed('bystander', 'n1', '2,2');
  const downedBystander = applyDamage(placed('fallen', 'n1', '2,2', { maxHP: 5 }), 5);
  const elsewhere = placed('elsewhere', 'n1', '3,3');
  const roster = [live, down, bystander, downedBystander, elsewhere];
  assert.deepEqual(
    liveCreaturesOnTile(roster, at('n1', '2,2')).map((c) => c.id),
    ['live', 'bystander'],
  );
  assert.deepEqual(liveCreaturesOnTile(roster, null), []);
});

test('isOnTile is false for an unplaced creature and for a missing position', () => {
  const creature = placed('c1', 'n1', '2,2');
  assert.equal(isOnTile(creature, at('n1', '2,2')), true);
  assert.equal(isOnTile(creature, at('n1', '2,3')), false);
  assert.equal(isOnTile(creature, null), false);
  assert.equal(isOnTile(createCreature('roamer', 'roamer'), at('n1', '2,2')), false);
});

test('meetCreatures marks every creature on the exact tile, hostile included', () => {
  const roster = [
    placed('person', 'n1', '2,2'),
    placed('foe', 'n1', '2,2', { disposition: 'hostile' }),
    placed('nextTile', 'n1', '2,3'),
    createCreature('everywhere', 'everywhere'),
  ];
  const { creatures, met } = meetCreatures(roster, at('n1', '2,2'));
  assert.deepEqual(
    met.map((c) => c.id),
    ['person', 'foe'],
  );
  assert.equal(creatures.find((c) => c.id === 'person').met, true);
  assert.equal(creatures.find((c) => c.id === 'nextTile').met, false);
  assert.equal(creatures.find((c) => c.id === 'everywhere').met, false);
});

test('meetCreatures returns the same roster when nothing changes', () => {
  const already = { ...placed('person', 'n1', '2,2'), met: true };
  const roster = [already, placed('elsewhere', 'n2', '0,0')];
  const unchanged = meetCreatures(roster, at('n1', '2,2'));
  assert.equal(unchanged.creatures, roster, 'no new meeting keeps the array identity');
  assert.deepEqual(unchanged.met, []);
  const noPosition = meetCreatures(roster, null);
  assert.equal(noPosition.creatures, roster);
});

test('formatLocation names the node and the tile, or the fixed everywhere label', () => {
  const getNodeName = (id) => (id === 'n1' ? 'The Vale' : undefined);
  assert.equal(formatLocation(at('n1', '2,3'), getNodeName), 'The Vale (2,3)');
  assert.equal(formatLocation(at('nX', '0,0'), getNodeName), 'nX (0,0)');
  assert.equal(formatLocation(null, getNodeName), 'Everywhere');
});
