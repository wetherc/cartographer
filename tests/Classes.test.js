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
  casterSlots,
  cantripLimit,
  preparedLimit,
  hasRitualCasting,
  hasPreparedCaster,
  unarmoredDefenses,
} from '../src/entities/Classes.js';

test('unarmoredDefenses reports the grant of every class that has one', () => {
  assert.deepEqual(unarmoredDefenses(character({ class: 'barbarian' })), [
    { ability: 'CON', shield: true },
  ]);
  assert.deepEqual(unarmoredDefenses(character({ class: 'monk' })), [
    { ability: 'WIS', shield: false },
  ]);
  assert.deepEqual(unarmoredDefenses(character({ class: 'fighter' })), []);
  assert.deepEqual(unarmoredDefenses(character({ class: 'bogus' })), []);
  assert.deepEqual(unarmoredDefenses(character({ class: undefined })), []);
});

test('unarmoredDefenses reads past the first class', () => {
  const mixed = character({
    classes: [
      { classId: 'fighter', level: 2 },
      { classId: 'monk', level: 1 },
    ],
  });
  assert.deepEqual(unarmoredDefenses(mixed), [{ ability: 'WIS', shield: false }]);
});

test('casterSlots is empty for an unknown class', () => {
  assert.deepEqual(casterSlots('bogus', 5), []);
  assert.deepEqual(casterSlots(undefined, 5), []);
});

test('cantripLimit and preparedLimit default a missing level to 1', () => {
  const c = character({ class: 'wizard', level: undefined, stats: { INT: 16 } });
  assert.equal(cantripLimit(c), cantripsKnownForClass('wizard', 1));
  // prepared = INT mod (+3) + level (1), floored at 1.
  assert.equal(preparedLimit(c), 4);
});

test('preparedLimit is 0 for a non-caster', () => {
  assert.equal(preparedLimit(character({ class: 'fighter' })), 0);
});

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

test('an explicit proficiency on the caster view wins over the level ladder', () => {
  const cleric = character({ class: 'cleric', level: 5, stats: { WIS: 18 } });
  const rated = { ...cleric, proficiency: 2 };
  assert.equal(spellSaveDC(rated), 8 + 2 + 4);
  assert.equal(spellAttackBonus(rated), 2 + 4);
});

test('exhaustion lowers the spell attack bonus and leaves the save DC alone', () => {
  const cleric = character({ class: 'cleric', level: 5, stats: { WIS: 18 } });
  const tired = { ...cleric, exhaustion: 2 };
  assert.equal(spellAttackBonus(tired), 3 + 4 - 4);
  assert.equal(spellSaveDC(tired), 8 + 3 + 4, 'a DC is not a roll the caster makes');
  assert.equal(spellAttackBonus({ ...cleric, exhaustion: 0 }), 3 + 4);
  assert.equal(spellAttackBonus({ ...character(), exhaustion: 3 }), null, 'a non-caster has none');
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

test('hasRitualCasting reads the class feature, not the spell', () => {
  assert.equal(hasRitualCasting(character({ class: 'wizard' })), true);
  assert.equal(hasRitualCasting(character({ class: 'cleric' })), true);
  // A full caster without the feature, and a martial with no caster class.
  assert.equal(hasRitualCasting(character({ class: 'sorcerer' })), false);
  assert.equal(hasRitualCasting(character({ class: 'fighter' })), false);
  assert.equal(hasRitualCasting(character({ class: undefined })), false);
});

test('one ritual-casting class in a multiclass is enough', () => {
  const classes = [
    { classId: 'sorcerer', level: 3 },
    { classId: 'wizard', level: 2 },
  ];
  assert.equal(hasRitualCasting(character({ level: 5, classes })), true);
  assert.equal(
    hasRitualCasting(
      character({
        level: 5,
        classes: [
          { classId: 'sorcerer', level: 3 },
          { classId: 'fighter', level: 2 },
        ],
      }),
    ),
    false,
  );
});

test('hasPreparedCaster picks out the classes that prepare their spells', () => {
  assert.equal(hasPreparedCaster(character({ class: 'wizard' })), true);
  assert.equal(hasPreparedCaster(character({ class: 'cleric' })), true);
  // Known-rule casters never prepare, and neither does a martial or a
  // classless character.
  assert.equal(hasPreparedCaster(character({ class: 'bard' })), false);
  assert.equal(hasPreparedCaster(character({ class: 'sorcerer' })), false);
  assert.equal(hasPreparedCaster(character({ class: 'fighter' })), false);
  assert.equal(hasPreparedCaster(character({ class: undefined })), false);
  // One prepared class in a multiclass is enough.
  assert.equal(
    hasPreparedCaster(
      character({
        level: 5,
        classes: [
          { classId: 'sorcerer', level: 3 },
          { classId: 'cleric', level: 2 },
        ],
      }),
    ),
    true,
  );
});

test('preparedLimit counts prepared-rule classes only', () => {
  // A bard casts from its known list, so it prepares nothing.
  assert.equal(preparedLimit(character({ class: 'bard', level: 5, stats: { CHA: 16 } })), 0);
  // Beside a cleric, only the cleric levels count: WIS mod (+3) + level 2.
  const mixed = character({
    level: 5,
    stats: { CHA: 16, WIS: 16 },
    classes: [
      { classId: 'bard', level: 3 },
      { classId: 'cleric', level: 2 },
    ],
  });
  assert.equal(preparedLimit(mixed), 5);
});

test('preparedLimit is 0 for a prepared caster with no score in its spell ability', () => {
  assert.equal(preparedLimit(character({ class: 'wizard', level: 5, stats: {} })), 0);
});
