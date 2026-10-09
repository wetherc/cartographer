import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearDying,
  dropToDying,
  isDead,
  isDying,
  judgeDeathSave,
  killOutright,
  recordDamage,
  deathSaveMode,
  stabilize,
} from '../src/entities/DeathSaves.js';
import { createCharacter, withDefaults } from '../src/entities/Character.js';
import { addCondition } from '../src/entities/Conditions.js';
import { packEntity } from '../src/storage/EntityPack.js';

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
  assert.equal(isDead(standing), false);
  assert.equal(isDying(dying()), true);
  const stable = dying({ stable: true });
  assert.equal(isDying(stable), false, 'a stable character rolls no more saves');
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

test('clearDying takes the fatal level of exhaustion off a revived character', () => {
  const next = clearDying(/** @type {any} */ ({ ...dying({ failures: 3 }), exhaustion: 6 }));
  assert.equal(next.deathSaves, null);
  assert.equal(next.exhaustion, 5, 'alive and dead at once is not a state a character can hold');
  const tired = clearDying(/** @type {any} */ ({ ...dying(), exhaustion: 3 }));
  assert.equal(tired.exhaustion, 3, 'a level below the fatal one is left alone');
});

test('killOutright kills with the tracker and leaves HP alone', () => {
  const character = /** @type {any} */ ({ ...createCharacter('hero', 'Hero'), exhaustion: 6 });
  const before = /** @type {any} */ (character).resources;
  const next = killOutright(character);
  assert.deepEqual(next.deathSaves, { successes: 0, failures: 3, stable: false });
  assert.equal(isDead(next), true);
  assert.deepEqual(
    next.conditions.map((c) => c.name),
    ['Unconscious'],
  );
  assert.equal(/** @type {any} */ (next).resources, before, 'exhaustion kills without damage');
  const dead = dying({ failures: 3 });
  assert.equal(killOutright(dead), dead, 'a dead character is not killed twice');
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

test('exhaustion 3 gives a death save the disadvantage mode of a saving throw', () => {
  assert.equal(deathSaveMode(dying()), null, 'a rested character rolls straight');
  assert.equal(deathSaveMode(/** @type {any} */ ({ ...dying(), exhaustion: 2 })), null);
  const tired = /** @type {any} */ ({ ...dying(), exhaustion: 3 });
  assert.equal(deathSaveMode(tired), 'disadvantage');
});
