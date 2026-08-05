import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SPEED,
  armorSpeedPenalty,
  baseSpeed,
  speedNote,
  walkSpeed,
} from '../src/entities/Movement.js';
import { equip } from '../src/entities/Equipment.js';
import { addItem, createCharacter } from '../src/entities/Character.js';
import { item } from './helpers/fixtures.js';

/**
 * A character wearing one piece of body armor.
 * @param {Record<string, unknown>} armor
 * @param {Record<string, number>} [stats]
 * @returns {import('../src/types/entities.js').Character}
 */
function wearing(armor, stats) {
  let hero = createCharacter('c1', 'Hero', stats);
  hero = addItem(hero, item('a', 'Armor', { type: 'armor', armorWeight: 'heavy', ...armor }));
  return equip(hero, 'chest', 'a');
}

test('baseSpeed reads the live race catalog, and defaults for a race with none', () => {
  const hero = createCharacter('c1', 'Hero');
  assert.equal(baseSpeed({ ...hero, raceId: 'dwarf' }), 25);
  assert.equal(baseSpeed({ ...hero, raceId: 'human' }), 30);
  assert.equal(baseSpeed(hero), DEFAULT_SPEED, 'no race walks the default');
  assert.equal(
    baseSpeed({ ...hero, raceId: 'moon-touched' }),
    DEFAULT_SPEED,
    'a hand-typed race has no definition to read a speed from',
  );
});

test('baseSpeed falls back when a snapshot stores an unusable speed', () => {
  const hero = createCharacter('c1', 'Hero');
  const traits = /** @type {any} */ ({ name: 'Wanderer', speed: 'quick', abilityIncreases: {} });
  assert.equal(baseSpeed({ ...hero, raceTraits: traits }), DEFAULT_SPEED);
  assert.equal(baseSpeed({ ...hero, raceTraits: { ...traits, speed: 40 } }), 40);
});

test('armor too heavy for the wearer costs 10 feet', () => {
  assert.equal(armorSpeedPenalty(wearing({ strength: 15 }, { STR: 14 })), 10, 'one short');
  assert.equal(armorSpeedPenalty(wearing({ strength: 15 }, { STR: 15 })), 0, 'exactly met');
  assert.equal(armorSpeedPenalty(wearing({ strength: 15 }, { STR: 18 })), 0);
  assert.equal(armorSpeedPenalty(wearing({}, { STR: 8 })), 0, 'armor with no requirement');
  assert.equal(armorSpeedPenalty(createCharacter('c1', 'Hero')), 0, 'nothing worn');
});

test('a stat buff can carry a wearer over the armor requirement', () => {
  let hero = wearing({ strength: 15 }, { STR: 13 });
  hero = addItem(hero, item('ring', 'Ring', { type: 'ring', statBonuses: { STR: 2 } }));
  assert.equal(armorSpeedPenalty(hero), 10, 'carried, not worn');
  assert.equal(armorSpeedPenalty(equip(hero, 'accessory', 'ring')), 0);
});

test('armorSpeedPenalty defaults a missing STR score to 10', () => {
  const hero = wearing({ strength: 13 }, {});
  assert.equal(armorSpeedPenalty({ ...hero, stats: {} }), 10);
});

test('walkSpeed applies the penalty and never goes negative', () => {
  const dwarf = { ...wearing({ strength: 15 }, { STR: 8 }), raceId: 'dwarf' };
  assert.equal(walkSpeed(dwarf), 15, '25 less 10');
  assert.equal(walkSpeed({ ...dwarf, stats: { STR: 16 } }), 25);
  const traits = /** @type {any} */ ({ name: 'Slug', speed: 5, abilityIncreases: {} });
  assert.equal(walkSpeed({ ...dwarf, raceId: '', raceTraits: traits }), 0, 'floored at 0');
});

test('speedNote names the armor and the score it wanted', () => {
  const hero = wearing({ strength: 15 }, { STR: 8 });
  assert.equal(
    speedNote(hero),
    'Walking speed: 30 feet, less 10 for wearing Armor without STR 15.',
  );
  assert.equal(speedNote({ ...hero, stats: { STR: 16 } }), 'Walking speed: 30 feet.');
});
