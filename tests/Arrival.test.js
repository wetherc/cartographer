import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrivalAlert } from '../src/combat/Arrival.js';

const GM = { gm: true, subject: 'The party', region: 'Northmarch' };

test('an empty tile gets no alert at all', () => {
  assert.equal(arrivalAlert([], GM), null);
});

test('one threat reads its exact hit points for the GM', () => {
  const alert = arrivalAlert([{ name: 'Goblin', currentHP: 5, maxHP: 7 }], GM);
  assert.equal(alert.title, 'Encounter!');
  assert.equal(alert.message, 'The party has come upon Goblin (5/7 HP) here in Northmarch.');
});

test('a player sees the band instead of the numbers', () => {
  const alert = arrivalAlert([{ name: 'Goblin', currentHP: 5, maxHP: 7 }], { ...GM, gm: false });
  assert.equal(alert.message.includes('5/7'), false);
  assert.match(alert.message, /^The party has come upon Goblin \(.+\) here in Northmarch\.$/);
});

test('two threats join with "and", three with commas', () => {
  const two = arrivalAlert(
    [
      { name: 'Goblin', currentHP: 7, maxHP: 7 },
      { name: 'Brigand', currentHP: 8, maxHP: 8 },
    ],
    GM,
  );
  assert.equal(two.title, 'Encounters!');
  assert.equal(
    two.message,
    'The party has come upon Goblin (7/7 HP) and Brigand (8/8 HP) here in Northmarch.',
  );
  const three = arrivalAlert(
    [
      { name: 'A', currentHP: 1, maxHP: 1 },
      { name: 'B', currentHP: 1, maxHP: 1 },
      { name: 'C', currentHP: 1, maxHP: 1 },
    ],
    GM,
  );
  assert.equal(
    three.message,
    'The party has come upon A (1/1 HP), B (1/1 HP) and C (1/1 HP) here in Northmarch.',
  );
});

test('the subject names one character who moved alone', () => {
  const alert = arrivalAlert([{ name: 'Brigand', currentHP: 8, maxHP: 8 }], {
    ...GM,
    subject: 'Mirelle',
  });
  assert.equal(alert.message, 'Mirelle has come upon Brigand (8/8 HP) here in Northmarch.');
});
