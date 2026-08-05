import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollDeathSaveFor, stabilizeCharacter } from '../src/app/deathSaves.js';
import { roll } from '../src/dice/DiceRoller.js';
import { createCharacter, damageCharacter, getHP, withHP } from '../src/entities/Character.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * An rng that hands back the given values in order, then repeats the last one.
 * @param {number[]} values
 */
function scripted(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** The rng value that makes a d`sides` roll land on `n`.
 * @param {number} sides @param {number} n */
const face = (sides, n) => (n - 1) / sides + 1e-9;

/**
 * A stub app whose dice tray rolls the scripted sequence, matching the
 * checkRolls suite. `rolls` records each selection loaded into the tray.
 * @param {{ characters: any[], rng?: () => number }} opts
 */
function stubApp({ characters, rng = () => 0.5 }) {
  const app = baseStubApp({
    state: { characters },
    toasts: { show: (/** @type {string} */ message) => app.toastMessages.push(message) },
    actions: {
      rollDice: (/** @type {any} */ selection) => {
        app.rolls.push(selection);
        return { result: roll(selection, rng) };
      },
    },
  });
  app.toastMessages = [];
  app.rolls = [];
  return app;
}

/** A character at 0 HP with the tracker in the given position.
 * @param {Partial<import('../src/types/entities.js').DeathSaveState>} [over]
 * @param {any} [extra] */
function dying(over = {}, extra = {}) {
  const hero = withHP(createCharacter('hero', 'Hero'), 10);
  return /** @type {any} */ ({
    ...damageCharacter(hero, 10),
    deathSaves: { successes: 0, failures: 0, stable: false, ...over },
    conditions: [{ name: 'Unconscious', rounds: null }],
    ...extra,
  });
}

/** @param {any} app */
const stored = (app) => app.state.characters[0];

test('a failed roll loads a bare d20 and records the failure', () => {
  const app = stubApp({ characters: [dying()], rng: scripted([face(20, 7)]) });
  rollDeathSaveFor(app, 'hero');
  assert.deepEqual(app.rolls, [{ counts: { d20: 1 }, modifier: 0 }]);
  assert.deepEqual(stored(app).deathSaves, { successes: 0, failures: 1, stable: false });
  assert.equal(app.log[0], 'Hero rolls a death save (7 vs DC 10): Hero slips further.');
  assert.deepEqual(app.toastMessages, ['Hero slips further.']);
  assert.equal(app.dirty, 1);
});

test('a third success stabilizes and says so', () => {
  const app = stubApp({
    characters: [dying({ successes: 2 })],
    rng: scripted([face(20, 15)]),
  });
  rollDeathSaveFor(app, 'hero');
  assert.deepEqual(stored(app).deathSaves, { successes: 0, failures: 0, stable: true });
  assert.equal(app.log[0], 'Hero rolls a death save (15 vs DC 10): Hero is stable at 0 HP.');
});

test('a third failure kills, and the state stays', () => {
  const app = stubApp({ characters: [dying({ failures: 2 })], rng: scripted([face(20, 3)]) });
  rollDeathSaveFor(app, 'hero');
  assert.deepEqual(stored(app).deathSaves, { successes: 0, failures: 3, stable: false });
  assert.equal(app.log[0], 'Hero rolls a death save (3 vs DC 10): Hero dies.');
});

test('a natural 20 wakes the character at 1 HP and clears the chip', () => {
  const app = stubApp({ characters: [dying({ failures: 2 })], rng: scripted([face(20, 20)]) });
  rollDeathSaveFor(app, 'hero');
  const up = stored(app);
  assert.equal(up.deathSaves, null);
  assert.equal(getHP(up).current, 1);
  assert.deepEqual(up.conditions, []);
  assert.equal(
    app.log[0],
    'Hero rolls a death save (20 vs DC 10): Hero wakes at 1 HP. Natural 20.',
  );
});

test('a natural 1 costs two failures and names itself', () => {
  const app = stubApp({ characters: [dying()], rng: scripted([face(20, 1)]) });
  rollDeathSaveFor(app, 'hero');
  assert.equal(stored(app).deathSaves.failures, 2);
  assert.match(app.log[0], /Natural 1\.$/);
});

test('a Bless chip rides the roll and the log names it', () => {
  const blessed = dying(
    {},
    {
      conditions: [
        { name: 'Unconscious', rounds: null },
        { name: 'Blessed', rounds: 10, rider: { rolls: ['save'], dice: 1, die: 'd4' } },
      ],
    },
  );
  const app = stubApp({ characters: [blessed], rng: scripted([face(20, 9)]) });
  // The rider d4 rolls outside the tray, so its rng is separate.
  rollDeathSaveFor(app, 'hero', { rng: () => face(4, 3) });
  assert.deepEqual(app.rolls, [{ counts: { d20: 1 }, modifier: 3 }]);
  assert.equal(stored(app).deathSaves.successes, 1, 'the rider turned a 9 into a success');
  assert.match(app.log[0], /death save \(12, Blessed \+1d4 \[3\] vs DC 10\)/);
});

test('a roll on a stable, dead, standing, or unknown character does nothing', () => {
  for (const character of [
    dying({ stable: true }),
    dying({ failures: 3 }),
    withHP(createCharacter('hero', 'Hero'), 10),
  ]) {
    const app = stubApp({ characters: [character], rng: scripted([face(20, 20)]) });
    rollDeathSaveFor(app, 'hero');
    assert.equal(stored(app), character);
    assert.deepEqual(app.rolls, []);
    assert.equal(app.dirty, 0);
  }
  const app = stubApp({ characters: [dying()] });
  rollDeathSaveFor(app, 'nobody');
  assert.deepEqual(app.rolls, []);
});

test('stabilize resets the counters and logs it', () => {
  const app = stubApp({ characters: [dying({ successes: 1, failures: 2 })] });
  stabilizeCharacter(app, 'hero');
  assert.deepEqual(stored(app).deathSaves, { successes: 0, failures: 0, stable: true });
  assert.equal(app.log[0], 'Hero is stabilized at 0 HP.');
  assert.deepEqual(app.toastMessages, ['Hero is stable.']);
  assert.equal(app.dirty, 1);
});

test('stabilize leaves a dead, a standing, and an unknown character alone', () => {
  for (const character of [dying({ failures: 3 }), withHP(createCharacter('hero', 'Hero'), 10)]) {
    const app = stubApp({ characters: [character] });
    stabilizeCharacter(app, 'hero');
    assert.equal(stored(app), character);
    assert.equal(app.dirty, 0);
  }
  const app = stubApp({ characters: [dying()] });
  stabilizeCharacter(app, 'nobody');
  assert.equal(app.dirty, 0);
});

test('exhaustion joins the modifier the tray rolls with, and the log names it', () => {
  const app = stubApp({
    characters: [dying({}, { exhaustion: 2 })],
    rng: scripted([face(20, 12)]),
  });
  rollDeathSaveFor(app, 'hero');
  assert.deepEqual(app.rolls, [{ counts: { d20: 1 }, modifier: -4 }]);
  assert.deepEqual(stored(app).deathSaves, { successes: 0, failures: 1, stable: false });
  assert.equal(
    app.log[0],
    'Hero rolls a death save (8, exhaustion 2 -4 vs DC 10): Hero slips further.',
  );
});
