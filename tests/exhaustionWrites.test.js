import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setCombatantExhaustion } from '../src/app/exhaustion.js';
import { createCharacter, withHP } from '../src/entities/Character.js';
import { createCreature } from '../src/entities/Creature.js';
import { stubApp } from './helpers/app.js';

/** @param {any[]} characters @param {any[]} [creatures] */
function appWith(characters, creatures = []) {
  return stubApp({ state: { characters, creatures } });
}

/** @param {any} [extra] */
function hero(extra = {}) {
  return /** @type {any} */ ({ ...withHP(createCharacter('hero', 'Hero'), 10), ...extra });
}

/** @param {any} [extra] */
function guard(extra = {}) {
  return /** @type {any} */ ({ ...createCreature('c1', 'Guard', { maxHP: 8 }), ...extra });
}

test('a raised level is stored, logged, and marks the campaign dirty', () => {
  const app = appWith([hero()]);
  assert.equal(setCombatantExhaustion(app, 'hero', 2), true);
  assert.equal(app.state.characters[0].exhaustion, 2);
  assert.equal(app.log[0], 'Hero: Exhaustion 2: -4 to every d20 test, and 10 feet slower.');
  assert.equal(app.dirty, 1);
});

test('a level that does not change writes nothing', () => {
  const app = appWith([hero({ exhaustion: 3 })]);
  assert.equal(setCombatantExhaustion(app, 'hero', 3), false);
  // A negative level clamps onto the stored zero, so it is not a change either.
  const rested = appWith([hero()]);
  assert.equal(setCombatantExhaustion(rested, 'hero', -1), false);
  assert.deepEqual(app.log, []);
  assert.equal(app.dirty, 0);
  assert.equal(rested.dirty, 0);
});

test('an unknown id does nothing', () => {
  const app = appWith([hero()]);
  assert.equal(setCombatantExhaustion(app, 'nobody', 4), false);
  assert.equal(app.dirty, 0);
});

test('the sixth level kills a character through the death-save tracker', () => {
  const app = appWith([hero()]);
  setCombatantExhaustion(app, 'hero', 6);
  const dead = app.state.characters[0];
  assert.deepEqual(dead.deathSaves, { successes: 0, failures: 3, stable: false });
  assert.deepEqual(
    dead.conditions.map((/** @type {any} */ c) => c.name),
    ['Unconscious'],
  );
  assert.deepEqual(app.log, ['Hero: Exhaustion 6: dead.', 'Hero dies of exhaustion.']);
});

test('a character who is already dead is not killed a second time', () => {
  const already = hero({ exhaustion: 5, deathSaves: { successes: 0, failures: 3, stable: false } });
  const app = appWith([already]);
  setCombatantExhaustion(app, 'hero', 6);
  assert.equal(app.state.characters[0].exhaustion, 6);
  assert.deepEqual(app.log, ['Hero: Exhaustion 6: dead.']);
});

test('the sixth level takes a creature to 0 HP and logs the defeat', () => {
  const app = appWith([], [guard()]);
  setCombatantExhaustion(app, 'c1', 6);
  assert.equal(app.state.creatures[0].currentHP, 0);
  assert.equal(app.state.creatures[0].exhaustion, 6);
  assert.deepEqual(app.log, ['Guard: Exhaustion 6: dead.', 'Defeated Guard.']);
  assert.equal(app.dirty, 1, 'the creature store refreshes without marking dirty itself');
});

test('a creature already at 0 HP takes the level without a second defeat line', () => {
  const app = appWith([], [guard({ currentHP: 0, exhaustion: 5 })]);
  setCombatantExhaustion(app, 'c1', 6);
  assert.deepEqual(app.log, ['Guard: Exhaustion 6: dead.']);
});

test('a level below the sixth leaves HP and the tracker alone', () => {
  const app = appWith([hero()], [guard()]);
  setCombatantExhaustion(app, 'hero', 5);
  setCombatantExhaustion(app, 'c1', 5);
  assert.equal(app.state.characters[0].deathSaves ?? null, null);
  assert.equal(app.state.creatures[0].currentHP, 8);
});
