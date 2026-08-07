import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CR_STEPS,
  coerceCR,
  crLabel,
  crOptions,
  crXP,
  isChallengeRating,
} from '../src/data/challenge.js';
import { crProficiencyBonus } from '../src/entities/Modifiers.js';

test('CR_STEPS runs from 0 through 30 with the three fractions between', () => {
  assert.equal(CR_STEPS.length, 34);
  assert.deepEqual(CR_STEPS.slice(0, 6), [0, 0.125, 0.25, 0.5, 1, 2]);
  assert.equal(CR_STEPS.at(-1), 30);
});

test('crXP matches the SRD table at every band edge', () => {
  assert.equal(crXP(0), 10);
  assert.equal(crXP(0.125), 25);
  assert.equal(crXP(0.25), 50);
  assert.equal(crXP(0.5), 100);
  assert.equal(crXP(1), 200);
  assert.equal(crXP(5), 1800);
  assert.equal(crXP(10), 5900);
  assert.equal(crXP(20), 25000);
  assert.equal(crXP(30), 155000);
});

test('crXP reads a value that is not a rating as worth nothing', () => {
  assert.equal(crXP(1.5), 0);
  assert.equal(crXP(31), 0);
  assert.equal(crXP(NaN), 0);
});

test('crXP covers every step, so no rating is worth nothing by accident', () => {
  for (const cr of CR_STEPS) assert.ok(crXP(cr) > 0, `CR ${cr} has no XP`);
});

test('crProficiencyBonus steps up every four ratings, from +2 to +9', () => {
  assert.equal(crProficiencyBonus(0), 2);
  assert.equal(crProficiencyBonus(0.5), 2);
  assert.equal(crProficiencyBonus(4), 2);
  assert.equal(crProficiencyBonus(5), 3);
  assert.equal(crProficiencyBonus(8), 3);
  assert.equal(crProficiencyBonus(9), 4);
  assert.equal(crProficiencyBonus(13), 5);
  assert.equal(crProficiencyBonus(17), 6);
  assert.equal(crProficiencyBonus(21), 7);
  assert.equal(crProficiencyBonus(25), 8);
  assert.equal(crProficiencyBonus(29), 9);
  assert.equal(crProficiencyBonus(30), 9);
});

test('crLabel writes the three low ratings as fractions', () => {
  assert.equal(crLabel(0), '0');
  assert.equal(crLabel(0.125), '1/8');
  assert.equal(crLabel(0.25), '1/4');
  assert.equal(crLabel(0.5), '1/2');
  assert.equal(crLabel(7), '7');
});

test('crLabel prints nothing for a value that is not a rating', () => {
  assert.equal(crLabel(1.5), '');
  assert.equal(crLabel(undefined), '');
});

test('isChallengeRating accepts a step and rejects everything else', () => {
  assert.equal(isChallengeRating(0), true);
  assert.equal(isChallengeRating(0.25), true);
  assert.equal(isChallengeRating(30), true);
  assert.equal(isChallengeRating(1.5), false);
  assert.equal(isChallengeRating(-1), false);
  assert.equal(isChallengeRating(31), false);
  assert.equal(isChallengeRating('1'), false);
  assert.equal(isChallengeRating(undefined), false);
});

test('coerceCR reads a number, a fraction, and a plain numeric string', () => {
  assert.equal(coerceCR(3), 3);
  assert.equal(coerceCR(0.25), 0.25);
  assert.equal(coerceCR('1/4'), 0.25);
  assert.equal(coerceCR('1 / 8'), 0.125);
  assert.equal(coerceCR('12'), 12);
  assert.equal(coerceCR('0'), 0);
});

test('coerceCR drops a value that names no step instead of snapping it', () => {
  assert.equal(coerceCR('1/3'), undefined);
  assert.equal(coerceCR(1.5), undefined);
  assert.equal(coerceCR(99), undefined);
  assert.equal(coerceCR('1/0'), undefined);
  assert.equal(coerceCR('deadly'), undefined);
  assert.equal(coerceCR(''), undefined);
  assert.equal(coerceCR('   '), undefined);
  assert.equal(coerceCR(null), undefined);
  assert.equal(coerceCR(undefined), undefined);
  assert.equal(coerceCR({}), undefined);
});

test('crOptions leads with the unrated choice and lists every step once', () => {
  const options = crOptions();
  assert.deepEqual(options[0], { value: '', label: 'Unrated' });
  assert.equal(options.length, CR_STEPS.length + 1);
  assert.deepEqual(options[2], { value: '0.125', label: 'CR 1/8' });
  // Every non-blank value reads back as the rating it names.
  for (const option of options.slice(1)) {
    assert.ok(isChallengeRating(coerceCR(option.value)), `bad option ${option.value}`);
  }
});
