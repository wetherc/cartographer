import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creatureSummary, spellSummary } from '../src/app/librarySummaries.js';

const bite = { name: 'Bite', damage: [{ count: 2, sides: 4, damageType: 'piercing' }] };

test('creatureSummary leads a rated foe with its challenge rating', () => {
  const wolf = {
    name: 'Wolf',
    disposition: 'hostile',
    maxHP: 11,
    level: 1,
    tier: 'mob',
    cr: 0.25,
    weapons: [bite],
  };
  assert.equal(creatureSummary(/** @type {any} */ (wolf)), 'CR 1/4, 11 HP | Bite 2d4 piercing');
});

test('creatureSummary shows tier and level for an unrated foe, and HP alone otherwise', () => {
  const ogre = { name: 'Ogre', disposition: 'hostile', maxHP: 59, level: 5, tier: 'legend' };
  assert.equal(creatureSummary(/** @type {any} */ (ogre)), 'Legend, level 5, 59 HP');
  const wolf = { name: 'Wolf', disposition: 'hostile', maxHP: 11, level: 1, tier: 'mob' };
  assert.equal(creatureSummary(/** @type {any} */ (wolf)), 'Mob, level 1, 11 HP');
  const ooze = { name: 'Ooze', disposition: 'hostile', maxHP: 20 };
  assert.equal(creatureSummary(/** @type {any} */ (ooze)), '20 HP');
});

test('creatureSummary names who a friendly creature is', () => {
  const smith = { name: 'Smith', disposition: 'friendly', role: 'blacksmith', maxHP: 4 };
  assert.equal(creatureSummary(/** @type {any} */ (smith)), 'blacksmith | friendly');
});

test('spellSummary capitalizes the school', () => {
  const spell = { level: 0, school: 'evocation', effect: { kind: 'attack' }, concentration: false };
  assert.equal(spellSummary(/** @type {any} */ (spell)), 'Cantrip Evocation | attack');
});
