import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasRaceTrait, isLucky, raceSaveSlant, spellRaceSave } from '../src/entities/RaceTraits.js';
import { withRace, resolveRace } from '../src/entities/Races.js';
import { createCharacter } from '../src/entities/Character.js';
import { savingThrow, abilityCheck } from '../src/entities/Checks.js';
import { targetSave } from '../src/entities/CastRolls.js';
import { defensesOf } from '../src/entities/DamageDefenses.js';

/** @param {string} raceId */
const of = (raceId) => withRace(createCharacter('c1', 'Pip'), raceId);

/** An rng that returns the given values in turn, then 0.5. @param {number[]} values */
function seq(values) {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.5);
}

test('hasRaceTrait reads the race trait names; a creature or custom race has none', () => {
  assert.equal(hasRaceTrait(of('halfling'), 'Lucky'), true);
  assert.equal(hasRaceTrait(of('dwarf'), 'Lucky'), false);
  assert.equal(hasRaceTrait(createCharacter('c2', 'X'), 'Lucky'), false);
  assert.equal(hasRaceTrait(null, 'Lucky'), false);
  assert.equal(isLucky(of('halfling')), true);
});

test('raceSaveSlant gives advantage for Brave, Fey Ancestry, Dwarven Resilience, Gnome Cunning', () => {
  assert.equal(
    raceSaveSlant(of('halfling'), { ability: 'WIS', condition: 'Frightened' }),
    'advantage',
  );
  assert.equal(raceSaveSlant(of('halfling'), { ability: 'WIS', condition: 'Charmed' }), null);
  assert.equal(raceSaveSlant(of('elf'), { ability: 'WIS', condition: ' charmed' }), 'advantage');
  assert.equal(
    raceSaveSlant(of('half-elf'), { ability: 'WIS', condition: 'Charmed' }),
    'advantage',
  );
  assert.equal(raceSaveSlant(of('dwarf'), { ability: 'CON', condition: 'Poisoned' }), 'advantage');
  assert.equal(
    raceSaveSlant(of('dwarf'), { ability: 'CON', damageTypes: ['poison'] }),
    'advantage',
  );
  assert.equal(raceSaveSlant(of('dwarf'), { ability: 'CON', damageTypes: ['fire'] }), null);
  assert.equal(raceSaveSlant(of('gnome'), { ability: 'wis', magic: true }), 'advantage');
  assert.equal(raceSaveSlant(of('gnome'), { ability: 'DEX', magic: true }), null);
  assert.equal(raceSaveSlant(of('gnome'), { ability: 'WIS' }), null);
  assert.equal(raceSaveSlant(null, { ability: 'WIS', condition: 'Frightened' }), null);
});

test('spellRaceSave reads the condition and damage types of a spell effect', () => {
  const save = /** @type {any} */ ({
    kind: 'save',
    saveAbility: 'CON',
    damage: [{ count: 1, sides: 6, damageType: 'poison' }],
    halfOnSave: false,
    condition: 'Poisoned',
  });
  assert.deepEqual(spellRaceSave(save, 'CON'), {
    ability: 'CON',
    condition: 'Poisoned',
    damageTypes: ['poison'],
    magic: true,
  });
  const attack = /** @type {any} */ ({ kind: 'attack', onHit: { condition: 'Frightened' } });
  assert.equal(spellRaceSave(attack, 'WIS').condition, 'Frightened');
  assert.equal(spellRaceSave(/** @type {any} */ ({ kind: 'utility' }), 'WIS').condition, undefined);
});

test('Lucky rolls a natural 1 again on a save, a check, and a spell target save', () => {
  // 0 is a natural 1, and 0.5 is an 11.
  const lucky = of('halfling');
  assert.equal(savingThrow(lucky, 'DEX', 10, { rng: seq([0]) }).natural, 11);
  assert.equal(abilityCheck(lucky, 'stealth', 10, { rng: seq([0]) }).natural, 11);
  assert.equal(savingThrow(of('dwarf'), 'DEX', 10, { rng: seq([0]) }).natural, 1);
  assert.equal(targetSave({ lucky: true }, 10, null, seq([0])).roll?.results[0].rolls[0], 11);
  assert.equal(targetSave({}, 10, null, seq([0])).roll?.results[0].rolls[0], 1);
});

test('a Dragonborn ancestry pick adds one resistance that defensesOf reads', () => {
  const base = createCharacter('c1', 'Kava');
  const red = withRace(base, 'dragonborn', { resistance: 'fire' });
  assert.deepEqual(red.raceTraits?.resistances, ['fire']);
  assert.equal(red.raceTraits?.chosenResistance, 'fire');
  assert.deepEqual(resolveRace(red)?.resistances, ['fire']);
  assert.deepEqual(defensesOf(/** @type {any} */ (red)).resist, ['fire']);
  assert.deepEqual(
    withRace(base, 'dragonborn', { resistance: 'thunder' }).raceTraits?.resistances,
    [],
  );
  assert.deepEqual(withRace(base, 'dwarf', { resistance: 'fire' }).raceTraits?.resistances, [
    'poison',
  ]);
});
