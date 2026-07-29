import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveBonus, savingThrow, resolveSave } from '../src/entities/Checks.js';
import { createCharacter } from '../src/entities/Character.js';
import { withProficiencies } from '../src/entities/Proficiencies.js';

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
