import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  adjustedXP,
  difficultyLine,
  partyThresholds,
  rateEncounter,
  XP_THRESHOLDS,
} from '../src/entities/EncounterDifficulty.js';
import { createCharacter } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';

/** A party member at one level. @param {string} id @param {number} level */
function hero(id, level) {
  return { ...createCharacter(id, id), level };
}

/** A hostile creature at one rating, or unrated when the rating is undefined.
 * @param {string} id @param {number} [cr] */
function foe(id, cr) {
  return createCreature(id, id, {
    disposition: 'hostile',
    maxHP: 10,
    ...(cr === undefined ? {} : { cr }),
  });
}

/** A crowd of rated foes. @param {number} count @param {number} cr */
function crowd(count, cr) {
  return Array.from({ length: count }, (_, i) => foe(`f${i}`, cr));
}

test('the threshold table covers levels 1 to 20 and rises across each row', () => {
  assert.equal(XP_THRESHOLDS.length, 20);
  for (const [index, row] of XP_THRESHOLDS.entries()) {
    assert.equal(row.length, 4, `level ${index + 1} has four thresholds`);
    for (let i = 1; i < row.length; i += 1) {
      assert.ok(row[i] > row[i - 1], `level ${index + 1} rises from band ${i - 1} to ${i}`);
    }
  }
});

test('party thresholds sum each character’s row for its level', () => {
  assert.deepEqual(partyThresholds([hero('a', 3), hero('b', 3)]), [150, 300, 450, 800]);
  assert.deepEqual(partyThresholds([hero('a', 1), hero('b', 5)]), [275, 550, 825, 1200]);
  assert.deepEqual(partyThresholds([]), [0, 0, 0, 0], 'no party has no budget');
});

test('a level outside the table reads at the nearest level it holds', () => {
  assert.deepEqual(partyThresholds([hero('a', 25)]), XP_THRESHOLDS[19]);
  assert.deepEqual(partyThresholds([hero('a', 0)]), XP_THRESHOLDS[0]);
  assert.deepEqual(
    partyThresholds([{ ...createCharacter('a', 'A'), level: undefined }]),
    XP_THRESHOLDS[0],
    'an absent level reads as 1',
  );
});

test('the count multiplier follows the rules at each rung', () => {
  // 200 XP each at CR 1, against a party of four, which shifts nothing.
  assert.equal(adjustedXP(crowd(1, 1), 4), 200, 'one foe is worth its own value');
  assert.equal(adjustedXP(crowd(2, 1), 4), 600, 'two foes count 1.5 times');
  assert.equal(adjustedXP(crowd(3, 1), 4), 1200, 'three to six count twice');
  assert.equal(adjustedXP(crowd(6, 1), 4), 2400);
  assert.equal(adjustedXP(crowd(7, 1), 4), 3500, 'seven to ten count 2.5 times');
  assert.equal(adjustedXP(crowd(11, 1), 4), 6600, 'eleven to fourteen count three times');
  assert.equal(adjustedXP(crowd(15, 1), 4), 12000, 'fifteen or more count four times');
});

test('a small party steps the multiplier up and a large one steps it down', () => {
  assert.equal(adjustedXP(crowd(1, 1), 2), 300, 'a pair of heroes faces one foe at 1.5 times');
  assert.equal(adjustedXP(crowd(1, 1), 6), 100, 'a party of six halves a lone foe');
  assert.equal(adjustedXP(crowd(3, 1), 6), 900, 'six heroes drop three foes to 1.5 times');
  assert.equal(adjustedXP(crowd(15, 1), 2), 15000, 'a pair against fifteen foes counts five times');
  assert.equal(adjustedXP(crowd(15, 1), 6), 9000, 'six heroes drop the horde to three times');
});

test('an unrated foe adds no XP but still counts toward the multiplier', () => {
  assert.equal(adjustedXP([foe('a')], 4), 0, 'one unrated foe rates nothing at all');
  // One CR 1 foe plus one unrated foe is two foes, so the 1.5 multiplier applies.
  assert.equal(adjustedXP([foe('a', 1), foe('b')], 4), 300);
});

test('rateEncounter names the band the total reaches, and meets a threshold on the nose', () => {
  const party = [hero('a', 3), hero('b', 3), hero('c', 3), hero('d', 3)];
  // Thresholds for four level-3 characters: 300 easy, 600 medium, 900 hard, 1600 deadly.
  assert.equal(rateEncounter(party, crowd(1, 1)).label, 'Trivial', '200 XP is under easy');
  assert.equal(rateEncounter(party, crowd(1, 2)).label, 'Easy', '450 XP clears easy alone');
  assert.equal(rateEncounter(party, crowd(2, 1)).label, 'Medium', '600 XP sits on the medium line');
  assert.equal(rateEncounter(party, crowd(3, 1)).label, 'Hard', '1200 XP');
  assert.equal(rateEncounter(party, [foe('a', 2), foe('b', 1)]).label, 'Hard', '975 XP');
  assert.equal(rateEncounter(party, crowd(4, 1)).label, 'Deadly', '1600 XP on the deadly line');
  const onTheLine = rateEncounter([hero('a', 1)], crowd(1, 0.5));
  assert.equal(onTheLine.adjustedXP, 150, '100 XP at 1.5 times for a party of one');
  assert.equal(onTheLine.label, 'Deadly', 'a total on the threshold counts as met');
});

test('rateEncounter counts hostiles only, and reports how many are unrated', () => {
  const party = [hero('a', 3), hero('b', 3), hero('c', 3)];
  const mixed = [
    foe('goblin', 0.25),
    foe('unrated'),
    createCreature('bram', 'Bram', { disposition: 'friendly' }),
    createCreature('watch', 'Watch', { disposition: 'neutral', cr: 5 }),
  ];
  const rating = rateEncounter(party, mixed);
  assert.equal(rating.hostiles, 2, 'the bystanders are no part of the fight');
  assert.equal(rating.unrated, 1);
  assert.equal(rating.adjustedXP, 75, '50 XP at the two-foe multiplier');
  assert.deepEqual(rating.thresholds, [225, 450, 675, 1200]);
});

test('a party with nothing to fight rates as trivial and prints no line', () => {
  const party = [hero('a', 3)];
  const bystander = createCreature('bram', 'Bram', { disposition: 'friendly' });
  assert.equal(rateEncounter(party, []).label, 'Trivial');
  assert.equal(rateEncounter(party, []).hostiles, 0);
  assert.equal(difficultyLine(party, []), '');
  assert.equal(difficultyLine(party, [bystander]), '', 'a friendly creature is no fight');
});

test('a party of nobody rates a fight as trivial rather than dividing by zero', () => {
  const rating = rateEncounter([], crowd(3, 5));
  assert.equal(rating.label, 'Trivial', 'no thresholds means no band to reach');
  assert.equal(rating.adjustedXP, 10800, 'the foes are still worth what they are worth');
  assert.equal(rating.party, 0);
  assert.equal(difficultyLine([], crowd(3, 5)), '', 'no living character means no budget line');
});

test('a dead character buys no budget and does not count toward the party size', () => {
  const dead = { ...hero('d', 3), deathSaves: { failures: 3, successes: 0, stable: false } };
  const dying = { ...hero('e', 3), deathSaves: { failures: 1, successes: 0, stable: false } };
  const rating = rateEncounter([hero('a', 3), hero('b', 3), dead], crowd(1, 1));
  assert.deepEqual(rating.thresholds, [150, 300, 450, 800], 'two living rows, not three');
  assert.equal(rating.party, 2);
  assert.equal(rating.adjustedXP, 300, 'two living heroes step a lone foe up to 1.5 times');
  assert.equal(difficultyLine([dead], crowd(1, 1)), '', 'a wholly dead party rates nothing');
  const withDying = rateEncounter([hero('a', 3), hero('b', 3), dying], crowd(1, 1));
  assert.equal(withDying.party, 3, 'a dying character still counts');
  assert.equal(withDying.adjustedXP, 200);
});

test('the line names the band, the total, and the four thresholds', () => {
  const party = [hero('a', 3), hero('b', 3), hero('c', 3), hero('d', 3)];
  assert.equal(difficultyLine(party, crowd(1, 2)), 'Easy: 450 XP against party 300/600/900/1600');
});

test('the line says how many foes count for nothing, in the right number', () => {
  const party = [hero('a', 3), hero('b', 3), hero('c', 3)];
  const one = difficultyLine(party, [foe('a', 1), foe('b')]);
  assert.match(one, /1 unrated foe counts for no XP$/);
  const two = difficultyLine(party, [foe('a', 1), foe('b'), foe('c')]);
  assert.match(two, /2 unrated foes count for no XP$/);
});
