import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_LIST,
  getClass,
  isCasterClass,
  slotsForClass,
  cantripsKnownForClass,
  spellAbilityModifier,
  spellSaveDC,
  spellAttackBonus,
} from '../src/entities/Classes.js';

/** @param {Partial<import('../src/types/entities.js').Character>} over */
function character(over = {}) {
  return /** @type {any} */ ({
    id: 'c',
    name: 'C',
    race: 'human',
    level: 1,
    xp: 0,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    resources: [],
    inventory: [],
    conditions: [],
    ...over,
  });
}

test('getClass resolves ids and rejects unknown/absent', () => {
  assert.equal(getClass('wizard')?.name, 'Wizard');
  assert.equal(getClass('nonesuch'), null);
  assert.equal(getClass(undefined), null);
  assert.equal(getClass(null), null);
  assert.equal(getClass(''), null);
});

test('isCasterClass separates casters from martials', () => {
  assert.equal(isCasterClass('wizard'), true); // full
  assert.equal(isCasterClass('paladin'), true); // half
  assert.equal(isCasterClass('warlock'), true); // pact
  assert.equal(isCasterClass('fighter'), false); // none
  assert.equal(isCasterClass('nonesuch'), false);
});

test('slotsForClass: full caster follows the 9th-slot table', () => {
  assert.deepEqual(slotsForClass('wizard', 1), [2]);
  assert.deepEqual(slotsForClass('wizard', 5), [4, 3, 2]);
  assert.deepEqual(slotsForClass('wizard', 20), [4, 3, 3, 3, 3, 2, 2, 1, 1]);
  // Past level 20 clamps to the level-20 row.
  assert.deepEqual(slotsForClass('wizard', 30), [4, 3, 3, 3, 3, 2, 2, 1, 1]);
});

test('slotsForClass: half caster is empty at 1 and tops out at 5th', () => {
  assert.deepEqual(slotsForClass('paladin', 1), []);
  assert.deepEqual(slotsForClass('paladin', 2), [2]);
  assert.deepEqual(slotsForClass('paladin', 20), [4, 3, 3, 3, 2]);
});

test('slotsForClass: third caster is empty until 3 and tops out at 4th', () => {
  // No third-caster class ships, but the table is reachable via caster type.
  assert.deepEqual(slotsForClass('ranger', 1), []); // ranger is half
  assert.deepEqual(slotsForClass('fighter', 5), []); // none -> no slots
  assert.deepEqual(slotsForClass('nonesuch', 5), []); // unknown -> no slots
});

test('slotsForClass: pact class gets no leveled slots here', () => {
  assert.deepEqual(slotsForClass('warlock', 5), []);
});

test('cantripsKnownForClass reads the class curve and clamps', () => {
  assert.equal(cantripsKnownForClass('wizard', 1), 3);
  assert.equal(cantripsKnownForClass('wizard', 4), 4);
  assert.equal(cantripsKnownForClass('wizard', 10), 5);
  assert.equal(cantripsKnownForClass('wizard', 20), 5); // clamps to last
  assert.equal(cantripsKnownForClass('sorcerer', 1), 4);
  assert.equal(cantripsKnownForClass('paladin', 1), 0); // no cantrips
  assert.equal(cantripsKnownForClass('fighter', 1), 0);
  assert.equal(cantripsKnownForClass('nonesuch', 1), 0);
  assert.equal(cantripsKnownForClass('wizard', 0), 3); // sub-1 clamps up
});

test('spellAbilityModifier reads the class ability score', () => {
  const wiz = character({ class: 'wizard', stats: { INT: 16 } });
  assert.equal(spellAbilityModifier(wiz), 3);
  assert.equal(spellAbilityModifier(character({ class: 'fighter' })), null);
  assert.equal(spellAbilityModifier(character()), null); // no class
  // Missing the ability score reads as null, not NaN.
  assert.equal(spellAbilityModifier(character({ class: 'wizard', stats: {} })), null);
});

test('spellSaveDC and spellAttackBonus fold proficiency and ability', () => {
  const cleric = character({ class: 'cleric', level: 5, stats: { WIS: 18 } });
  // prof +3 at level 5, WIS +4.
  assert.equal(spellSaveDC(cleric), 8 + 3 + 4);
  assert.equal(spellAttackBonus(cleric), 3 + 4);
  assert.equal(spellSaveDC(character({ class: 'fighter' })), null);
  assert.equal(spellAttackBonus(character()), null);
});

test('every class definition is internally consistent', () => {
  for (const def of CLASS_LIST) {
    if (def.casterType === 'none') {
      assert.equal(def.spellAbility, undefined, `${def.id} non-caster has no ability`);
      assert.equal(def.cantripsKnown.length, 0, `${def.id} non-caster knows no cantrips`);
    } else {
      assert.ok(def.spellAbility, `${def.id} caster has a spell ability`);
      assert.ok(def.spellListId, `${def.id} caster has a spell list`);
    }
    assert.ok([6, 8, 10, 12].includes(def.hitDie), `${def.id} hit die is a real die`);
  }
});
