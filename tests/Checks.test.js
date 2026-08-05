import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  saveBonus,
  savingThrow,
  resolveSave,
  checkAbility,
  checkBonus,
  resolveCheck,
  abilityCheck,
  passiveScore,
  passivePerception,
} from '../src/entities/Checks.js';
import { createCharacter } from '../src/entities/Character.js';
import { withProficiencies, withExpertise } from '../src/entities/Proficiencies.js';
import { createCondition } from '../src/entities/Conditions.js';

/**
 * A deterministic RNG replaying a queue of unit values, one per call, matching
 * the dice suites: `roll` computes `floor(rng() * sides) + 1`, so 0 is the
 * minimum face and a value just under 1 the maximum. Past the queue it returns
 * 0.
 * @param {number[]} values
 * @returns {() => number}
 */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** rng() value that makes a d`sides` roll come up `face`. */
function face(sides, value) {
  return (value - 1) / sides + 1e-9;
}

/** A level-5 character with a CON of 16 (+3) and DEX of 12 (+1).
 * @param {Partial<import('../src/types/entities.js').Character>} over */
function hero(over = {}) {
  const base = createCharacter('c1', 'Rook');
  return /** @type {any} */ ({
    ...base,
    level: 5,
    stats: { ...base.stats, CON: 16, DEX: 12, WIS: 8 },
    ...over,
  });
}

test('saveBonus is the ability modifier alone without proficiency', () => {
  assert.equal(saveBonus(hero(), 'CON'), 3);
  assert.equal(saveBonus(hero(), 'DEX'), 1);
  assert.equal(saveBonus(hero(), 'WIS'), -1);
});

test('saveBonus adds the proficiency bonus for a granted save', () => {
  const proficient = withProficiencies(hero(), { saves: ['CON'] });
  // Level 5 is a +3 proficiency bonus, on top of the +3 from a CON of 16.
  assert.equal(saveBonus(proficient, 'CON'), 6);
  assert.equal(saveBonus(proficient, 'DEX'), 1, 'a save not granted stays ability-only');
});

test('saveBonus reads the equipment-adjusted score, and an absent one as 10', () => {
  const belt = {
    id: 'i1',
    name: 'Belt of Health',
    quantity: 1,
    slot: 'accessory',
    statBonuses: { CON: 4 },
  };
  const worn = hero({ inventory: [belt], equipment: { accessory: 'i1' } });
  assert.equal(saveBonus(worn, 'CON'), 5, '16 + 4 = 20, a +5 modifier');
  assert.equal(saveBonus(hero({ stats: {} }), 'STR'), 0, 'no score reads as 10');
});

test('a save succeeds on a tie and fails one under', () => {
  const rng = seq([face(20, 12)]);
  const met = resolveSave(3, 15, { rng });
  assert.equal(met.total, 15);
  assert.equal(met.success, true, 'meeting the DC is a success');
  const under = resolveSave(2, 15, { rng: seq([face(20, 12)]) });
  assert.equal(under.total, 14);
  assert.equal(under.success, false);
});

test('a natural 1 or 20 carries no automatic result on a save', () => {
  // Unlike an attack roll: a nat 20 on a save against a high DC still fails,
  // and a nat 1 with a big bonus still succeeds. Both faces are reported so a
  // log can show them.
  const nat20 = resolveSave(0, 30, { rng: seq([face(20, 20)]) });
  assert.equal(nat20.natural, 20);
  assert.equal(nat20.success, false);
  const nat1 = resolveSave(20, 15, { rng: seq([face(20, 1)]) });
  assert.equal(nat1.natural, 1);
  assert.equal(nat1.success, true);
});

test('advantage keeps the higher die and disadvantage the lower', () => {
  const dice = [face(20, 4), face(20, 17)];
  const adv = resolveSave(0, 15, { mode: 'advantage', rng: seq(dice) });
  assert.equal(adv.natural, 17);
  assert.equal(adv.success, true);
  assert.deepEqual(adv.roll.results[0].dropped, [4], 'the discarded die stays in the result');
  const dis = resolveSave(0, 15, { mode: 'disadvantage', rng: seq(dice) });
  assert.equal(dis.natural, 4);
  assert.equal(dis.success, false);
});

test('savingThrow rolls a character’s own bonus and says whether it was proficient', () => {
  const proficient = withProficiencies(hero(), { saves: ['CON'] });
  const made = savingThrow(proficient, 'CON', 15, { rng: seq([face(20, 10)]) });
  assert.equal(made.total, 16, '10 + 3 CON + 3 proficiency');
  assert.equal(made.dc, 15);
  assert.equal(made.success, true);
  assert.equal(made.proficient, true);
  const other = savingThrow(proficient, 'DEX', 15, { rng: seq([face(20, 10)]) });
  assert.equal(other.total, 11);
  assert.equal(other.proficient, false);
});

test('resolveSave defaults to a normal roll with a live RNG', () => {
  // No mode and no rng: the roll still resolves, and stays inside the d20 range.
  const result = resolveSave(0, 10);
  assert.ok(result.natural >= 1 && result.natural <= 20);
  assert.equal(result.roll.selection.mode, 'normal');
  assert.equal(result.total, result.natural);
});

test('a rider on the roller joins the save and reports what it added', () => {
  const blessed = [
    createCondition('Bless', 10, { rider: { rolls: ['attack', 'save'], dice: 1, die: 'd4' } }),
  ];
  // The rider die draws first, then the d20.
  const made = resolveSave(2, 15, {
    conditions: blessed,
    rng: seq([face(4, 4), face(20, 10)]),
  });
  assert.equal(made.total, 16, '10 on the d20, +2 bonus, +4 from Bless');
  assert.equal(made.success, true);
  assert.deepEqual(made.rider, { modifier: 4, note: 'Bless +1d4 [4]' });
  // The natural stays the raw d20, so a readout can still name the die.
  assert.equal(made.natural, 10);
});

test('a save with no rider chip reports none and rolls the same as before', () => {
  const plain = resolveSave(2, 15, { rng: seq([face(20, 10)]) });
  assert.equal(plain.total, 12);
  assert.equal(plain.rider, null);
  const irrelevant = resolveSave(2, 15, {
    conditions: [createCondition('Guidance', 10, { rider: { rolls: ['check'], dice: 1 } })],
    rng: seq([face(20, 10)]),
  });
  assert.equal(irrelevant.total, 12, 'a check rider does not touch a save');
  assert.equal(irrelevant.rider, null);
});

test('savingThrow reads the character’s own chips without being asked', () => {
  const baned = {
    ...hero(),
    conditions: [
      createCondition('Bane', 10, { rider: { rolls: ['attack', 'save'], dice: -1, die: 'd4' } }),
    ],
  };
  const rolled = savingThrow(baned, 'CON', 15, { rng: seq([face(4, 3), face(20, 10)]) });
  assert.equal(rolled.total, 10, '10 + 3 CON - 3 from Bane');
  assert.equal(rolled.success, false);
  assert.equal(rolled.rider?.note, 'Bane -1d4 [3]');
});

test('a character with no conditions field rolls a plain save', () => {
  const bare = /** @type {any} */ ({ ...hero(), conditions: undefined });
  const rolled = savingThrow(bare, 'CON', 15, { rng: seq([face(20, 10)]) });
  assert.equal(rolled.total, 13, '10 + 3 CON, with nothing to ride it');
  assert.equal(rolled.rider, null);
});

/** The hero, proficient in Stealth and Perception, with expertise in Stealth. */
function expert() {
  const proficient = withProficiencies(hero(), { skills: ['stealth', 'perception'] });
  return withExpertise(proficient, ['stealth']);
}

test('checkAbility resolves a skill, an ability, and nothing else', () => {
  assert.equal(checkAbility('stealth'), 'DEX');
  assert.equal(checkAbility('animal-handling'), 'WIS');
  assert.equal(checkAbility('STR'), 'STR', 'an ability key stands for itself');
  assert.equal(checkAbility('juggling'), null);
  assert.equal(checkAbility('toString'), null, 'an inherited property name is not a skill');
});

test('checkBonus is the ability modifier alone without proficiency', () => {
  assert.equal(checkBonus(hero(), 'stealth'), 1, 'DEX 12');
  assert.equal(checkBonus(hero(), 'insight'), -1, 'WIS 8');
  assert.equal(checkBonus(hero(), 'DEX'), 1, 'a bare ability check');
});

test('checkBonus adds the proficiency bonus once, and twice with expertise', () => {
  // Level 5 is a +3 proficiency bonus. Stealth reads DEX 12 (+1).
  assert.equal(checkBonus(expert(), 'perception'), 2, '-1 WIS, +3 proficiency');
  assert.equal(checkBonus(expert(), 'stealth'), 7, '+1 DEX, +3 twice for expertise');
  assert.equal(checkBonus(expert(), 'arcana'), 0, 'a skill not granted stays ability-only');
});

test('checkBonus never adds proficiency to a bare ability or an unknown key', () => {
  // A skills list is not validated against the skill table, so a stored 'DEX'
  // must not turn every Dexterity check proficient.
  const odd = withProficiencies(hero(), { skills: ['DEX', 'juggling'] });
  assert.equal(checkBonus(odd, 'DEX'), 1, 'the ability modifier alone');
  assert.equal(checkBonus(odd, 'juggling'), 0, 'an unknown key reads as a score of 10');
});

test('a character with no level counts as level 1 for both bonuses', () => {
  const unleveled = /** @type {any} */ ({ ...expert(), level: undefined });
  assert.equal(checkBonus(unleveled, 'stealth'), 5, '+1 DEX, +2 twice for expertise');
  const saves = withProficiencies(unleveled, { saves: ['CON'] });
  assert.equal(saveBonus(saves, 'CON'), 5, '+3 CON, +2 proficiency');
});

test('checkBonus reads the equipment-adjusted score', () => {
  const gloves = {
    id: 'i1',
    name: 'Gloves of Thieving',
    quantity: 1,
    slot: 'accessory',
    statBonuses: { DEX: 6 },
  };
  const worn = /** @type {any} */ ({
    ...expert(),
    inventory: [gloves],
    equipment: { accessory: 'i1' },
  });
  assert.equal(checkBonus(worn, 'stealth'), 10, '12 + 6 = 18 (+4), plus 3 twice');
});

test('a check beats the DC on a tie and reports the ability it used', () => {
  const made = abilityCheck(expert(), 'stealth', 17, { rng: seq([face(20, 10)]) });
  assert.equal(made.total, 17, '10 on the d20, +7 for Stealth');
  assert.equal(made.success, true);
  assert.equal(made.ability, 'DEX');
  assert.equal(made.proficient, true);
  assert.equal(made.expert, true);
  const missed = abilityCheck(expert(), 'perception', 17, { rng: seq([face(20, 10)]) });
  assert.equal(missed.success, false, '12 is one under');
  assert.equal(missed.expert, false);
});

test('a check with no DC rolls and judges nothing', () => {
  const open = abilityCheck(expert(), 'stealth', null, { rng: seq([face(20, 15)]) });
  assert.equal(open.total, 22);
  assert.equal(open.dc, null);
  assert.equal(open.success, null);
  const bare = abilityCheck(expert(), 'stealth', undefined, { rng: seq([face(20, 15)]) });
  assert.equal(bare.success, null, 'an absent DC is the same as none');
});

test('advantage keeps the higher die on a check', () => {
  const up = resolveCheck(0, null, {
    mode: 'advantage',
    rng: seq([face(20, 4), face(20, 18)]),
  });
  assert.equal(up.total, 18);
  assert.equal(up.natural, 18, 'the natural is the die that was kept');
  const down = resolveCheck(0, 10, {
    mode: 'disadvantage',
    rng: seq([face(20, 4), face(20, 18)]),
  });
  assert.equal(down.total, 4);
  assert.equal(down.success, false);
});

test('resolveCheck defaults to a normal roll with a live RNG', () => {
  const result = resolveCheck(0, null);
  assert.ok(result.natural >= 1 && result.natural <= 20);
  assert.equal(result.roll.selection.mode, 'normal');
  assert.equal(result.total, result.natural);
});

test('a check rider joins the check, and a save rider does not', () => {
  const guided = [createCondition('Guidance', 10, { rider: { rolls: ['check'], dice: 1 } })];
  const helped = resolveCheck(2, 15, { conditions: guided, rng: seq([face(4, 4), face(20, 10)]) });
  assert.equal(helped.total, 16, '10 on the d20, +2 bonus, +4 from Guidance');
  assert.deepEqual(helped.rider, { modifier: 4, note: 'Guidance +1d4 [4]' });

  const saveOnly = resolveCheck(2, 15, {
    conditions: [createCondition('Bless', 10, { rider: { rolls: ['save'], dice: 1 } })],
    rng: seq([face(20, 10)]),
  });
  assert.equal(saveOnly.total, 12);
  assert.equal(saveOnly.rider, null);
});

test('abilityCheck reads the character’s own chips without being asked', () => {
  const guided = {
    ...expert(),
    conditions: [createCondition('Guidance', 10, { rider: { rolls: ['check'], dice: 1 } })],
  };
  const rolled = abilityCheck(guided, 'stealth', null, { rng: seq([face(4, 2), face(20, 10)]) });
  assert.equal(rolled.total, 19, '10 + 7 for Stealth + 2 from Guidance');
  assert.equal(rolled.rider?.note, 'Guidance +1d4 [2]');

  const bare = /** @type {any} */ ({ ...expert(), conditions: undefined });
  assert.equal(abilityCheck(bare, 'stealth', null, { rng: seq([face(20, 10)]) }).rider, null);
});

test('a passive score is 10 plus the bonus, moved 5 by advantage', () => {
  assert.equal(passiveScore(3), 13);
  assert.equal(passiveScore(-1), 9);
  assert.equal(passiveScore(3, 'normal'), 13);
  assert.equal(passiveScore(3, 'advantage'), 18);
  assert.equal(passiveScore(3, 'disadvantage'), 8);
});

test('passive perception reads the character’s own Perception bonus', () => {
  assert.equal(passivePerception(hero()), 9, 'WIS 8 is -1, and nothing is proficient');
  assert.equal(passivePerception(expert()), 12, '-1 WIS, +3 proficiency');
  assert.equal(passivePerception(expert(), 'advantage'), 17);
});

test('exhaustion takes 2 a level off a save, whether or not it is proficient', () => {
  assert.equal(saveBonus(hero({ exhaustion: 1 }), 'CON'), 1, '+3 CON less 2');
  assert.equal(saveBonus(hero({ exhaustion: 3 }), 'CON'), -3, '+3 CON less 6');
  const proficient = withProficiencies(hero(), { saves: ['CON'] });
  assert.equal(saveBonus({ ...proficient, exhaustion: 2 }, 'CON'), 2, '+3 and +3 less 4');
  assert.equal(saveBonus(hero({ exhaustion: 0 }), 'CON'), 3, 'a rested character is unchanged');
});

test('exhaustion takes 2 a level off a check, an expertise one, and a bare ability', () => {
  assert.equal(checkBonus(hero({ exhaustion: 1 }), 'stealth'), -1, '+1 DEX less 2');
  assert.equal(checkBonus(hero({ exhaustion: 1 }), 'DEX'), -1, 'a bare ability too');
  assert.equal(checkBonus({ ...expert(), exhaustion: 2 }, 'stealth'), 3, '+1 DEX, +6, less 4');
  assert.equal(checkBonus({ ...expert(), exhaustion: 2 }, 'perception'), -2, '-1, +3, less 4');
  const proficient = withProficiencies(hero(), { skills: ['stealth'] });
  assert.equal(checkBonus({ ...proficient, exhaustion: 4 }, 'stealth'), -4, '+1, +3, less 8');
});

test('exhaustion reaches a passive score through the check bonus', () => {
  assert.equal(passivePerception(hero({ exhaustion: 2 })), 5, '9 less 4');
  assert.equal(passivePerception(hero({ exhaustion: 2 }), 'advantage'), 10);
});

test('a rolled save and check carry the exhaustion penalty in the total', () => {
  const tired = hero({ exhaustion: 3 });
  const save = savingThrow(tired, 'CON', 10, { rng: seq([face(20, 10)]) });
  assert.equal(save.total, 7, '10 on the die, +3 CON, less 6');
  assert.equal(save.rider, null, 'the penalty is in the bonus, not a rider');
  const check = abilityCheck(tired, 'DEX', 10, { rng: seq([face(20, 10)]) });
  assert.equal(check.total, 5, '10 on the die, +1 DEX, less 6');
});
