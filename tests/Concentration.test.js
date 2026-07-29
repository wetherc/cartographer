import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  begin,
  checkOnDamage,
  concentrationDC,
  drop,
  isConcentrating,
  tick,
} from '../src/entities/Concentration.js';
import { createCharacter } from '../src/entities/Character.js';
import { addCondition, tickConditions } from '../src/entities/Conditions.js';

/**
 * A deterministic RNG replaying a queue of unit values, one per call, matching
 * the dice suites: `roll` computes `floor(rng() * sides) + 1`.
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

/** A level-5 caster with a CON of 16, so a CON save adds +3 without proficiency.
 * @param {Partial<import('../src/types/entities.js').Character>} over */
function caster(over = {}) {
  const base = createCharacter('c1', 'Mirelle');
  return /** @type {any} */ ({
    ...base,
    level: 5,
    stats: { ...base.stats, CON: 16 },
    ...over,
  });
}

/** A concentration spell lasting `rounds` combat rounds.
 * @param {string} id @param {string} name @param {number | null} rounds */
function spell(id, name, rounds) {
  return /** @type {any} */ ({
    id,
    name,
    level: 2,
    concentration: true,
    duration: rounds === null ? { kind: 'until-dispelled' } : { kind: 'rounds', amount: rounds },
  });
}

/** @param {any} character @returns {import('../src/types/entities.js').Condition | undefined} */
function chip(character) {
  return character.conditions.find((/** @type {any} */ c) => c.name === 'Concentrating');
}

test('the DC is 10 until half the damage exceeds it', () => {
  assert.equal(concentrationDC(0), 10);
  assert.equal(concentrationDC(19), 10);
  assert.equal(concentrationDC(20), 10);
  assert.equal(concentrationDC(21), 10);
  assert.equal(concentrationDC(22), 11);
  assert.equal(concentrationDC(45), 22);
});

test('begin records the spell and adds the chip with the duration', () => {
  const { character, dropped } = begin(caster(), spell('s1', 'Hold Person', 10), 3);
  assert.equal(dropped, null);
  assert.deepEqual(character.concentration, {
    spellId: 's1',
    spellName: 'Hold Person',
    slotLevel: 3,
    remaining: 10,
  });
  assert.deepEqual(chip(character), { name: 'Concentrating', rounds: 10 });
  assert.equal(isConcentrating(character), true);
});

test('an open-ended duration concentrates with no round counter', () => {
  const { character } = begin(caster(), spell('s2', 'Detect Magic', null), 1);
  assert.equal(character.concentration?.remaining, null);
  assert.deepEqual(chip(character), { name: 'Concentrating', rounds: null });
});

test('begin replaces a held spell and reports the one it displaced', () => {
  const first = begin(caster(), spell('s1', 'Hold Person', 10), 2).character;
  const second = begin(first, spell('s2', 'Bless', 10), 1);
  assert.equal(second.dropped, 'Hold Person');
  assert.equal(second.character.concentration?.spellId, 's2');
  // One chip, not two: the second cast's chip replaces the first's.
  assert.equal(second.character.conditions.filter((c) => c.name === 'Concentrating').length, 1);
});

test('drop clears the state and the chip, and leaves other conditions alone', () => {
  const held = begin(caster(), spell('s1', 'Hold Person', 10), 2).character;
  const next = drop({ ...held, conditions: addCondition(held.conditions, 'Poisoned', 3) });
  assert.equal(next.concentration, null);
  assert.equal(chip(next), undefined);
  assert.deepEqual(
    next.conditions.map((c) => c.name),
    ['Poisoned'],
  );
});

test('drop leaves a character holding nothing untouched', () => {
  const plain = caster();
  assert.equal(drop(plain), plain);
});

test('a made save holds the spell, a failed one loses it', () => {
  const held = begin(caster(), spell('s1', 'Hold Person', 10), 2).character;
  // 12 damage, so DC 10; a d20 of 7 plus CON +3 is exactly 10 and holds.
  const made = checkOnDamage(held, 12, { rng: seq([face(20, 7)]) });
  assert.equal(made.dropped, false);
  assert.equal(made.save?.dc, 10);
  assert.equal(made.save?.total, 10);
  assert.equal(made.character.concentration?.spellId, 's1');

  const failed = checkOnDamage(held, 12, { rng: seq([face(20, 6)]) });
  assert.equal(failed.dropped, true);
  assert.equal(failed.save?.total, 9);
  assert.equal(failed.character.concentration, null);
  assert.equal(chip(failed.character), undefined);
});

test('the save DC follows half the damage on a big hit', () => {
  const held = begin(caster(), spell('s1', 'Hold Person', 10), 2).character;
  // 30 damage is DC 15; a d20 of 11 plus CON +3 is 14 and fails.
  const result = checkOnDamage(held, 30, { rng: seq([face(20, 11)]) });
  assert.equal(result.save?.dc, 15);
  assert.equal(result.dropped, true);
});

test('advantage on the save rolls both dice and keeps the better', () => {
  const held = begin(caster(), spell('s1', 'Hold Person', 10), 2).character;
  const result = checkOnDamage(held, 12, {
    mode: 'advantage',
    rng: seq([face(20, 4), face(20, 18)]),
  });
  assert.equal(result.save?.total, 21);
  assert.equal(result.dropped, false);
});

test('damage to a character holding nothing calls for no save', () => {
  const plain = caster();
  const result = checkOnDamage(plain, 20, { rng: seq([face(20, 1)]) });
  assert.equal(result.save, null);
  assert.equal(result.dropped, false);
  assert.equal(result.character, plain);
});

test('no damage calls for no save', () => {
  const held = begin(caster(), spell('s1', 'Hold Person', 10), 2).character;
  const result = checkOnDamage(held, 0, { rng: seq([face(20, 1)]) });
  assert.equal(result.save, null);
  assert.equal(result.character, held);
});

test('tick spends a round and expires the spell when it runs out', () => {
  const held = begin(caster(), spell('s1', 'Hold Person', 2), 2).character;
  const first = tick(held);
  assert.equal(first.expired, false);
  assert.equal(first.character.concentration?.remaining, 1);

  const second = tick(first.character);
  assert.equal(second.expired, true);
  assert.equal(second.character.concentration, null);
  assert.equal(chip(second.character), undefined);
});

test('an open-ended spell never expires on a tick', () => {
  const held = begin(caster(), spell('s2', 'Detect Magic', null), 1).character;
  const next = tick(held);
  assert.equal(next.expired, false);
  assert.equal(next.character, held);
});

test('tick on a character holding nothing changes nothing', () => {
  const plain = caster();
  assert.equal(tick(plain).character, plain);
  assert.equal(tick(plain).expired, false);
});

test('the chip stays in step with the duration when the round tick runs first', () => {
  // The round wrap decrements every timed condition, then ticks concentration,
  // which rewrites the chip from the duration it owns. Both counters have to
  // agree afterwards, whichever ran first.
  let held = begin(caster(), spell('s1', 'Hold Person', 3), 2).character;
  for (const expected of [2, 1]) {
    const ticked = tick({ ...held, conditions: tickConditions(held.conditions) });
    held = ticked.character;
    assert.equal(ticked.expired, false);
    assert.equal(held.concentration?.remaining, expected);
    assert.deepEqual(chip(held), { name: 'Concentrating', rounds: expected });
  }
  const last = tick({ ...held, conditions: tickConditions(held.conditions) });
  assert.equal(last.expired, true);
  assert.equal(chip(last.character), undefined);
});
