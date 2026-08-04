import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEATH_SAVE_DC,
  clearDying,
  dropToDying,
  isDead,
  isDying,
  isStable,
  judgeDeathSave,
  recordDamage,
  rollDeathSave,
  stabilize,
} from '../src/entities/DeathSaves.js';
import { createCharacter, withDefaults } from '../src/entities/Character.js';
import { addCondition } from '../src/entities/Conditions.js';
import { packEntity } from '../src/storage/EntityPack.js';

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

/** rng() value that makes a d`sides` roll come up `face`.
 * @param {number} sides @param {number} value */
function face(sides, value) {
  return (value - 1) / sides + 1e-9;
}

/** A character at 0 HP with the tracker in the given position.
 * @param {Partial<import('../src/types/entities.js').DeathSaveState>} [state] */
function dying(state = {}) {
  return /** @type {any} */ ({
    ...createCharacter('hero', 'Hero'),
    deathSaves: { successes: 0, failures: 0, stable: false, ...state },
    conditions: [{ name: 'Unconscious', rounds: null }],
  });
}

test('the predicates separate not dying, dying, stable, and dead', () => {
  const standing = createCharacter('hero', 'Hero');
  assert.equal(isDying(standing), false);
  assert.equal(isStable(standing), false);
  assert.equal(isDead(standing), false);
  assert.equal(isDying(dying()), true);
  const stable = dying({ stable: true });
  assert.equal(isDying(stable), false, 'a stable character rolls no more saves');
  assert.equal(isStable(stable), true);
  const dead = dying({ failures: 3 });
  assert.equal(isDying(dead), false);
  assert.equal(isDead(dead), true);
});

test('dropToDying starts the tracker and adds the chip, and does not restart it', () => {
  const next = dropToDying(createCharacter('hero', 'Hero'));
  assert.deepEqual(next.deathSaves, { successes: 0, failures: 0, stable: false });
  assert.deepEqual(
    next.conditions.map((c) => c.name),
    ['Unconscious'],
  );
  const rolling = dying({ failures: 2 });
  assert.equal(dropToDying(rolling), rolling, 'a second call keeps the failures rolled');
});

test('clearDying removes the tracker and the chip, leaving other chips alone', () => {
  const poisoned = /** @type {any} */ ({
    ...dying({ failures: 2 }),
    conditions: addCondition(dying().conditions, 'Poisoned'),
  });
  const next = clearDying(poisoned);
  assert.equal(next.deathSaves, null);
  assert.deepEqual(
    next.conditions.map((c) => c.name),
    ['Poisoned'],
  );
  const standing = createCharacter('hero', 'Hero');
  assert.equal(clearDying(standing), standing);
});

test('stabilize resets the counters and stays at 0 HP, but cannot revive the dead', () => {
  const next = stabilize(dying({ successes: 2, failures: 2 }));
  assert.deepEqual(next.deathSaves, { successes: 0, failures: 0, stable: true });
  assert.deepEqual(
    next.conditions.map((c) => c.name),
    ['Unconscious'],
    'still unconscious',
  );
  const dead = dying({ failures: 3 });
  assert.equal(stabilize(dead), dead);
  const standing = createCharacter('hero', 'Hero');
  assert.equal(stabilize(standing), standing);
});

test('the judge counts a success, a stabilizing third success, and a failure', () => {
  const start = { successes: 0, failures: 0, stable: false };
  assert.deepEqual(judgeDeathSave(start, { natural: 10, total: 10 }), {
    state: { successes: 1, failures: 0, stable: false },
    outcome: 'success',
  });
  assert.deepEqual(judgeDeathSave(start, { natural: 9, total: 9 }), {
    state: { successes: 0, failures: 1, stable: false },
    outcome: 'failure',
  });
  assert.deepEqual(
    judgeDeathSave({ successes: 2, failures: 1, stable: false }, { natural: 14, total: 14 }),
    {
      state: { successes: 0, failures: 0, stable: true },
      outcome: 'stable',
    },
  );
});

test('the judge kills on the third failure and keeps the state', () => {
  const judged = judgeDeathSave(
    { successes: 1, failures: 2, stable: false },
    { natural: 4, total: 4 },
  );
  assert.deepEqual(judged, {
    state: { successes: 1, failures: 3, stable: false },
    outcome: 'dead',
  });
});

test('a natural 20 revives whatever the counters hold', () => {
  const judged = judgeDeathSave(
    { successes: 0, failures: 2, stable: false },
    { natural: 20, total: 20 },
  );
  assert.deepEqual(judged, { state: null, outcome: 'revive' });
});

test('a natural 1 counts two failures and beats the total', () => {
  const rich = judgeDeathSave(
    { successes: 0, failures: 0, stable: false },
    { natural: 1, total: 12 },
  );
  assert.deepEqual(rich, {
    state: { successes: 0, failures: 2, stable: false },
    outcome: 'failure',
  });
  const fatal = judgeDeathSave(
    { successes: 0, failures: 2, stable: false },
    { natural: 1, total: 15 },
  );
  assert.equal(fatal.outcome, 'dead');
});

test('rollDeathSave rolls a bare d20 against DC 10 and applies the outcome', () => {
  assert.equal(DEATH_SAVE_DC, 10);
  // A CON of 20 would add +5 to a CON save. A death save adds nothing.
  const strong = /** @type {any} */ ({ ...dying(), stats: { ...dying().stats, CON: 20 } });
  const { character, save, outcome } = rollDeathSave(strong, { rng: seq([face(20, 9)]) });
  assert.equal(save?.total, 9, 'no ability modifier and no proficiency');
  assert.equal(save?.dc, 10);
  assert.equal(outcome, 'failure');
  assert.deepEqual(character.deathSaves, { successes: 0, failures: 1, stable: false });
});

test('rollDeathSave clears the tracker and the chip on a natural 20', () => {
  const { character, outcome } = rollDeathSave(dying({ failures: 2 }), {
    rng: seq([face(20, 20)]),
  });
  assert.equal(outcome, 'revive');
  assert.equal(character.deathSaves, null);
  assert.deepEqual(character.conditions, []);
});

test('a Bless rider turns a 9 into a success', () => {
  const blessed = /** @type {any} */ ({
    ...dying(),
    conditions: [
      ...dying().conditions,
      { name: 'Blessed', rounds: 10, rider: { rolls: ['save'], dice: 1, die: 'd4' } },
    ],
  });
  // Riders draw before the d20 in resolveD20, so the d4 comes first.
  const { save, outcome } = rollDeathSave(blessed, {
    rng: seq([face(4, 3), face(20, 9)]),
  });
  assert.equal(save?.total, 12);
  assert.equal(outcome, 'success');
});

test('an unconscious character still rolls a death save, with no ability auto-fail', () => {
  const { save, outcome } = rollDeathSave(dying(), { rng: seq([face(20, 18)]) });
  assert.equal(save?.roll.results[0].rolls[0], 18, 'the chip does not stop the roll');
  assert.equal(outcome, 'success');
});

test('rollDeathSave is a no-op while stable, while dead, and while standing', () => {
  for (const character of [
    dying({ stable: true }),
    dying({ failures: 3 }),
    createCharacter('h', 'H'),
  ]) {
    const result = rollDeathSave(character, { rng: seq([face(20, 20)]) });
    assert.equal(result.character, character);
    assert.equal(result.save, null);
    assert.equal(result.outcome, null);
  }
});

test('damage while down is an automatic failure, and a crit counts two', () => {
  const one = recordDamage(dying());
  assert.deepEqual(one, {
    character: { ...dying(), deathSaves: { successes: 0, failures: 1, stable: false } },
    failures: 1,
    dead: false,
  });
  const two = recordDamage(dying({ failures: 1 }), { crit: true });
  assert.deepEqual(two.character.deathSaves, { successes: 0, failures: 3, stable: false });
  assert.equal(two.failures, 2);
  assert.equal(two.dead, true);
});

test('damage un-stabilizes a stable character with one failure against it', () => {
  const hit = recordDamage(dying({ stable: true }));
  assert.deepEqual(hit.character.deathSaves, { successes: 0, failures: 1, stable: false });
  assert.equal(hit.dead, false);
});

test('recordDamage ignores a dead character and a standing one', () => {
  const dead = dying({ failures: 3 });
  assert.deepEqual(recordDamage(dead, { crit: true }), {
    character: dead,
    failures: 0,
    dead: false,
  });
  const standing = createCharacter('hero', 'Hero');
  assert.deepEqual(recordDamage(standing), { character: standing, failures: 0, dead: false });
});

test('a character who is not dying packs no deathSaves field', () => {
  const packed = packEntity(createCharacter('hero', 'Hero'), withDefaults);
  assert.ok(!('deathSaves' in packed), 'the load path fills the null back in');
  assert.equal(withDefaults(/** @type {any} */ (packed)).deathSaves, null);
});

test('a dying character keeps its tracker through a pack round trip', () => {
  const packed = packEntity(dying({ successes: 1, failures: 2 }), withDefaults);
  assert.deepEqual(packed.deathSaves, { successes: 1, failures: 2, stable: false });
});
