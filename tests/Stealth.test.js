import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSurprised,
  nameList,
  parleyLine,
  passivePerceptionOf,
  rollStealth,
  sideContests,
  sneakingSides,
  stealthContest,
  stealthLine,
} from '../src/combat/Stealth.js';
import { addItem, createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { equip } from '../src/entities/Equipment.js';
import { withProficiencies } from '../src/entities/Proficiencies.js';
import { item } from './helpers/fixtures.js';

test('isSurprised needs every total to meet the passive score, and no sneaker surprises no one', () => {
  assert.equal(isSurprised([15, 12], 12), true);
  assert.equal(isSurprised([15, 11], 12), false);
  assert.equal(isSurprised([], 5), false);
});

test('stealthContest splits watchers by the lowest total and skips sneakers with no total', () => {
  const result = stealthContest(
    [
      { id: 'a', total: 14 },
      { id: 'b', total: null },
    ],
    [
      { id: 'g1', passive: 10 },
      { id: 'g2', passive: 15 },
      { id: 'g3', passive: 14 },
    ],
  );
  assert.deepEqual(result, { surprised: ['g1', 'g3'], noticed: ['g2'] });
});

test('stealthContest with no totals decides nothing', () => {
  assert.deepEqual(stealthContest([{ id: 'a', total: null }], [{ id: 'g', passive: 1 }]), {
    surprised: [],
    noticed: [],
  });
});

test('nameList joins one, two, and three names', () => {
  assert.equal(nameList(['A']), 'A');
  assert.equal(nameList(['A', 'B']), 'A and B');
  assert.equal(nameList(['A', 'B', 'C']), 'A, B, and C');
});

test('stealthLine names the side, each total, and the surprised watchers', () => {
  assert.equal(
    stealthLine('party', [{ name: 'Ayla', total: 17 }], ['Goblin']),
    'The party sneaks (Stealth Ayla 17). Goblin is surprised.',
  );
  assert.equal(
    stealthLine('foe', [{ name: 'Wolf', total: 9 }], ['Ayla', 'Bren']),
    'The foes sneak (Stealth Wolf 9). Ayla and Bren are surprised.',
  );
  assert.equal(
    stealthLine('foe', [{ name: 'Wolf', total: 3 }], []),
    'The foes sneak (Stealth Wolf 3). No one is surprised.',
  );
});

test('parleyLine names the foes, or none', () => {
  assert.equal(parleyLine([]), 'The party settles the encounter without a fight.');
  assert.equal(
    parleyLine(['Goblin', 'Wolf']),
    'The party settles the encounter without a fight. Goblin and Wolf stand down.',
  );
  assert.equal(
    parleyLine(['Goblin']),
    'The party settles the encounter without a fight. Goblin stands down.',
  );
});

test('rollStealth adds the Stealth bonus, and noisy armor rolls with disadvantage', () => {
  const hero = createCharacter('c1', 'Hero', { DEX: 14 });
  // The rng gives the high face first, then the low one.
  const seq = () => {
    const faces = [0.95, 0];
    return () => faces.shift() ?? 0;
  };
  assert.equal(rollStealth(hero, 'character', seq()).total, 22, 'a straight roll keeps 20 + 2');
  const plated = equip(
    addItem(hero, item('p', 'Plate', { type: 'armor', baseAC: 18, stealthDisadvantage: true })),
    'chest',
    'p',
  );
  assert.equal(rollStealth(plated, 'character', seq()).total, 3, 'disadvantage keeps 1 + 2');
});

test('rollStealth counts a low face as 10 for a rogue 11 proficient in Stealth', () => {
  const rogue = withProficiencies(
    { ...createCharacter('r', 'Rogue', { DEX: 10 }), classes: [{ classId: 'rogue', level: 11 }] },
    { skills: ['stealth'] },
  );
  // Rogue 11 has a +4 proficiency bonus, and the face of 1 counts as 10.
  assert.equal(rollStealth(rogue, 'character', () => 0).total, 14);
});

test('rollStealth and passivePerceptionOf read a creature from its stat block', () => {
  const wolf = createCreature('w', 'Wolf', { stats: { DEX: 16, WIS: 12 } });
  assert.equal(rollStealth(wolf, 'creature', () => 0).total, 4);
  assert.equal(passivePerceptionOf(wolf, 'creature'), 11);
  assert.equal(passivePerceptionOf(createCharacter('c', 'C', { WIS: 8 }), 'character'), 9);
});

test('sneakingSides lists the sides for each picker choice, party first', () => {
  assert.deepEqual(sneakingSides(''), []);
  assert.deepEqual(sneakingSides('party'), ['party']);
  assert.deepEqual(sneakingSides('foe'), ['foe']);
  assert.deepEqual(sneakingSides('both'), ['party', 'foe']);
});

test('sideContests runs one contest per sneaking side, and a sneaker still watches', () => {
  const rows = [
    { id: 'ayla', side: /** @type {const} */ ('party'), total: 16, passive: 12 },
    { id: 'bren', side: /** @type {const} */ ('party'), total: null, passive: 15 },
    { id: 'gob', side: /** @type {const} */ ('foe'), total: 13, passive: 10 },
    { id: 'wolf', side: /** @type {const} */ ('foe'), total: 11, passive: 17 },
  ];
  assert.deepEqual(sideContests(rows, 'both'), [
    { side: 'party', surprised: ['gob'], noticed: ['wolf'], rolled: [{ id: 'ayla', total: 16 }] },
    {
      side: 'foe',
      surprised: [],
      noticed: ['ayla', 'bren'],
      rolled: [
        { id: 'gob', total: 13 },
        { id: 'wolf', total: 11 },
      ],
    },
  ]);
  assert.deepEqual(
    sideContests(rows, 'foe').map((r) => r.side),
    ['foe'],
  );
  assert.deepEqual(sideContests(rows, ''), []);
});

test('sideContests with no totals on a side decides nothing for it', () => {
  const rows = [
    { id: 'a', side: /** @type {const} */ ('party'), total: null, passive: 10 },
    { id: 'g', side: /** @type {const} */ ('foe'), total: 20, passive: 10 },
  ];
  assert.deepEqual(sideContests(rows, 'both'), [
    { side: 'party', surprised: [], noticed: [], rolled: [] },
    { side: 'foe', surprised: ['a'], noticed: [], rolled: [{ id: 'g', total: 20 }] },
  ]);
});

test('rollStealth reports a once rider it used up', () => {
  const guided = {
    ...createCharacter('c1', 'Hero', { DEX: 14 }),
    conditions: [{ name: 'Guidance', rider: { rolls: ['check'], dice: 1, die: 'd4', once: true } }],
  };
  const result = rollStealth(/** @type {any} */ (guided), 'character', () => 0);
  assert.equal(result.total, 4, '1 + 2 + 1 for the d4');
  assert.deepEqual(result.rider?.spent, ['Guidance']);
  assert.equal(rollStealth(createCharacter('c2', 'Plain'), 'character', () => 0).rider, null);
});
