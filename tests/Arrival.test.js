import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arrivalAlert, pluralName } from '../src/combat/Arrival.js';

const GM = { gm: true, subject: 'The party', region: 'Northmarch' };
const PLAYER = { ...GM, gm: false };

test('an empty tile gets no alert at all', () => {
  assert.equal(arrivalAlert([], GM), null);
});

test('one unhurt threat reads its plain name', () => {
  const alert = arrivalAlert([{ name: 'Goblin', currentHP: 7, maxHP: 7 }], GM);
  assert.equal(alert.title, 'Encounter!');
  assert.equal(alert.message, 'The party has come upon Goblin here in Northmarch.');
});

test('one hurt threat reads its exact hit points for the GM', () => {
  const alert = arrivalAlert([{ name: 'Goblin', currentHP: 5, maxHP: 7 }], GM);
  assert.equal(alert.message, 'The party has come upon Goblin (5/7 HP) here in Northmarch.');
});

test('a player sees the band instead of the numbers', () => {
  const alert = arrivalAlert([{ name: 'Goblin', currentHP: 5, maxHP: 7 }], PLAYER);
  assert.equal(alert.message, 'The party has come upon Goblin (Healthy) here in Northmarch.');
});

test('threats that share a name read as one counted group', () => {
  const wolf = { name: 'Gray Wolf', currentHP: 11, maxHP: 11 };
  const dire = { name: 'Dire Wolf', currentHP: 37, maxHP: 37 };
  const alert = arrivalAlert([wolf, wolf, dire, wolf, wolf, dire], GM);
  assert.equal(alert.title, 'Encounters!');
  assert.equal(
    alert.message,
    'The party has come upon 4 Gray Wolves and 2 Dire Wolves here in Northmarch.',
  );
});

test('a group lists the health of its hurt members only', () => {
  const threats = [
    { name: 'Gray Wolf', currentHP: 11, maxHP: 11 },
    { name: 'Gray Wolf', currentHP: 4, maxHP: 11 },
    { name: 'Gray Wolf', currentHP: 9, maxHP: 11 },
  ];
  assert.equal(
    arrivalAlert(threats, GM).message,
    'The party has come upon 3 Gray Wolves (hurt: 4/11 HP, 9/11 HP) here in Northmarch.',
  );
  assert.equal(
    arrivalAlert(threats, PLAYER).message,
    'The party has come upon 3 Gray Wolves (hurt: Bloodied, Healthy) here in Northmarch.',
  );
});

test('two names join with "and", three with commas', () => {
  const one = (name) => ({ name, currentHP: 1, maxHP: 1 });
  assert.equal(
    arrivalAlert([one('Goblin'), one('Brigand')], GM).message,
    'The party has come upon Goblin and Brigand here in Northmarch.',
  );
  assert.equal(
    arrivalAlert([one('A'), one('B'), one('C')], GM).message,
    'The party has come upon A, B and C here in Northmarch.',
  );
});

test('the subject names one character who moved alone', () => {
  const alert = arrivalAlert([{ name: 'Brigand', currentHP: 8, maxHP: 8 }], {
    ...GM,
    subject: 'Mirelle',
  });
  assert.equal(alert.message, 'Mirelle has come upon Brigand here in Northmarch.');
});

test('plural names follow the regular English rules', () => {
  assert.equal(pluralName('Gray Wolf'), 'Gray Wolves');
  assert.equal(pluralName('Duergar Thief'), 'Duergar Thieves');
  assert.equal(pluralName('Harpy'), 'Harpies');
  assert.equal(pluralName('Bandit Captain'), 'Bandit Captains');
  assert.equal(pluralName('Lich'), 'Liches');
  assert.equal(pluralName('Ox'), 'Oxes');
  assert.equal(pluralName('Monkey'), 'Monkeys');
});
