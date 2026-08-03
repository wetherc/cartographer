import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollCheck } from '../src/app/checkRolls.js';
import { roll } from '../src/dice/DiceRoller.js';
import { createCharacter } from '../src/entities/Character.js';
import { withProficiencies, withExpertise } from '../src/entities/Proficiencies.js';
import { stubApp as baseStubApp } from './helpers/app.js';

/**
 * An rng that hands back the given values in order, then repeats the last one.
 * @param {number[]} values
 */
function scripted(values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** The rng value that makes a d`sides` roll land on `n`. */
const face = (sides, n) => (n - 1) / sides + 1e-9;

/**
 * A stub app whose dice tray rolls the scripted sequence. `rolls` records each
 * selection the roll loaded into the tray, along with the target it rolled
 * against, which for a sheet roll is always absent.
 * @param {{ rng?: () => number, mode?: string }} [opts]
 */
function stubApp({ rng = () => 0.5, mode = undefined } = {}) {
  const app = baseStubApp({
    toasts: { show: (/** @type {string} */ message) => app.toastMessages.push(message) },
    actions: {
      rollDice: (/** @type {any} */ selection, /** @type {number} */ target) => {
        app.rolls.push({ selection, target });
        // The tray owns advantage, so the stub rolls it the way the tray would.
        return { result: roll(mode ? { ...selection, mode } : selection, rng) };
      },
    },
  });
  app.toastMessages = [];
  app.rolls = [];
  return app;
}

/** A level-5 character: DEX 16 (+3), CON 8 (-1). Proficiency bonus is +3. */
function hero(over = {}) {
  const base = createCharacter('c1', 'Rook');
  return /** @type {any} */ ({
    ...base,
    level: 5,
    stats: { ...base.stats, DEX: 16, CON: 8 },
    ...over,
  });
}

/** A Bless-shaped chip: +1d4 to the named rolls. */
function chip(name, rolls) {
  return { name, rider: { rolls, dice: 1, die: 'd4' } };
}

test('a proficient save rolls the ability modifier plus proficiency', () => {
  const character = withProficiencies(hero(), { saves: ['DEX'] });
  const app = stubApp({ rng: scripted([face(20, 11)]) });
  rollCheck(app, character, { kind: 'save', key: 'DEX' }, { rng: () => 0 });
  assert.deepEqual(app.rolls, [
    { selection: { counts: { d20: 1 }, modifier: 6 }, target: undefined },
  ]);
  assert.equal(app.log[0], 'Rook rolls a DEX saving throw (DEX +3, proficiency +3): 17.');
  assert.deepEqual(app.toastMessages, ['Rook rolls 17 on a DEX saving throw.']);
});

test('a save the class does not grant rolls the ability modifier alone', () => {
  const app = stubApp({ rng: scripted([face(20, 10)]) });
  rollCheck(app, hero(), { kind: 'save', key: 'CON' }, { rng: () => 0 });
  assert.equal(app.rolls[0].selection.modifier, -1);
  assert.equal(app.log[0], 'Rook rolls a CON saving throw (CON -1): 9.');
});

test('an expertise check doubles the proficiency bonus and says so', () => {
  const proficient = withProficiencies(hero(), { skills: ['stealth'] });
  const expert = withExpertise(proficient, ['stealth']);
  const app = stubApp({ rng: scripted([face(20, 15)]) });
  rollCheck(app, expert, { kind: 'check', key: 'stealth' }, { rng: () => 0 });
  // DEX +3 and a doubled +3 proficiency come to +9.
  assert.equal(app.rolls[0].selection.modifier, 9);
  assert.equal(app.log[0], 'Rook rolls a Stealth check (DEX +3, expertise +6): 24.');
});

test('a proficient check adds the bonus once', () => {
  const character = withProficiencies(hero(), { skills: ['stealth'] });
  const app = stubApp({ rng: scripted([face(20, 5)]) });
  rollCheck(app, character, { kind: 'check', key: 'stealth' }, { rng: () => 0 });
  assert.equal(app.rolls[0].selection.modifier, 6);
  assert.match(app.log[0], /proficiency \+3/);
});

test('an untrained check rolls the bare ability modifier', () => {
  const app = stubApp({ rng: scripted([face(20, 12)]) });
  rollCheck(app, hero(), { kind: 'check', key: 'acrobatics' }, { rng: () => 0 });
  assert.equal(app.rolls[0].selection.modifier, 3);
  assert.equal(app.log[0], 'Rook rolls an Acrobatics check (DEX +3): 15.');
});

test('a bare ability key rolls that ability and never adds proficiency', () => {
  // 5e attaches proficiency to a skill, not to an ability, so a raw Strength
  // check stays ability-only even for a character proficient in everything.
  const character = withProficiencies(hero(), { skills: ['stealth', 'athletics'] });
  const app = stubApp({ rng: scripted([face(20, 8)]) });
  rollCheck(app, character, { kind: 'check', key: 'DEX' }, { rng: () => 0 });
  assert.equal(app.rolls[0].selection.modifier, 3);
  assert.equal(app.log[0], 'Rook rolls a DEX check (DEX +3): 11.');
});

test('a Guidance chip rides an ability check and not a save', () => {
  const character = hero({ conditions: [chip('Guidance', ['check'])] });
  const app = stubApp({ rng: scripted([face(20, 10)]) });
  rollCheck(app, character, { kind: 'check', key: 'acrobatics' }, { rng: scripted([face(4, 3)]) });
  assert.equal(app.rolls[0].selection.modifier, 6, 'DEX +3 and a rider 3');
  assert.equal(app.log[0], 'Rook rolls an Acrobatics check (DEX +3, Guidance +1d4 [3]): 16.');

  const saveApp = stubApp({ rng: scripted([face(20, 10)]) });
  rollCheck(saveApp, character, { kind: 'save', key: 'DEX' }, { rng: scripted([face(4, 3)]) });
  assert.equal(saveApp.rolls[0].selection.modifier, 3, 'a check rider stays off a save');
  assert.doesNotMatch(saveApp.log[0], /Guidance/);
});

test('a Bless chip rides a save and not an ability check', () => {
  const character = hero({ conditions: [chip('Bless', ['attack', 'save'])] });
  const app = stubApp({ rng: scripted([face(20, 10)]) });
  rollCheck(app, character, { kind: 'save', key: 'CON' }, { rng: scripted([face(4, 2)]) });
  assert.equal(app.rolls[0].selection.modifier, 1, 'CON -1 and a rider 2');
  assert.match(app.log[0], /Bless \+1d4 \[2\]/);

  const checkApp = stubApp({ rng: scripted([face(20, 10)]) });
  rollCheck(
    checkApp,
    character,
    { kind: 'check', key: 'stealth' },
    { rng: scripted([face(4, 2)]) },
  );
  assert.equal(checkApp.rolls[0].selection.modifier, 3);
  assert.doesNotMatch(checkApp.log[0], /Bless/);
});

test('a roll spends no chip and dirties nothing', () => {
  const character = hero({ conditions: [chip('Guidance', ['check'])] });
  const app = stubApp({ rng: scripted([face(20, 10)]) });
  rollCheck(app, character, { kind: 'check', key: 'stealth' }, { rng: scripted([face(4, 1)]) });
  assert.deepEqual(character.conditions, [chip('Guidance', ['check'])], 'the chip is untouched');
  assert.equal(app.dirty, 0);
  assert.equal(app.calls.includes('markDirty'), false);
});

test('an advantage roll names the die it threw away', () => {
  const app = stubApp({ rng: scripted([face(20, 4), face(20, 18)]), mode: 'advantage' });
  rollCheck(app, hero(), { kind: 'check', key: 'stealth' }, { rng: () => 0 });
  assert.match(app.log[0], /at advantage \(dropped 4\)/);
  assert.match(app.log[0], /: 21/, 'the kept 18 plus DEX +3');
});

test('a natural 1 and a natural 20 are named, and nothing between them is', () => {
  const low = stubApp({ rng: scripted([face(20, 1)]) });
  rollCheck(low, hero(), { kind: 'save', key: 'DEX' }, { rng: () => 0 });
  assert.match(low.log[0], /Natural 1\./);

  const high = stubApp({ rng: scripted([face(20, 20)]) });
  rollCheck(high, hero(), { kind: 'save', key: 'DEX' }, { rng: () => 0 });
  assert.match(high.log[0], /Natural 20\./);

  const middle = stubApp({ rng: scripted([face(20, 13)]) });
  rollCheck(middle, hero(), { kind: 'save', key: 'DEX' }, { rng: () => 0 });
  assert.doesNotMatch(middle.log[0], /Natural/);
});

test('a sheet roll carries no DC into the tray', () => {
  const app = stubApp({ rng: scripted([face(20, 10)]) });
  rollCheck(app, hero(), { kind: 'save', key: 'DEX' }, { rng: () => 0 });
  assert.equal(app.rolls[0].target, undefined, 'a sheet roll judges nothing');
  assert.doesNotMatch(app.log[0], /vs|success|fail/i);
});

test('a key that names neither a skill nor an ability rolls a bare d20', () => {
  // No row sends one. This is the shape a hand-edited save or a future row
  // could produce, and it must not throw inside a roll.
  const app = stubApp({ rng: scripted([face(20, 10)]) });
  rollCheck(app, hero(), { kind: 'check', key: 'juggling' }, { rng: () => 0 });
  assert.equal(app.rolls[0].selection.modifier, 0, 'an unknown key reads as a score of 10');
  assert.equal(app.log[0], 'Rook rolls a juggling check (juggling +0): 10.');
});

test('a levelless character rolls at the first-level proficiency bonus', () => {
  const character = withProficiencies(hero({ level: undefined }), { saves: ['DEX'] });
  const app = stubApp({ rng: scripted([face(20, 10)]) });
  rollCheck(app, character, { kind: 'save', key: 'DEX' }, { rng: () => 0 });
  assert.equal(app.rolls[0].selection.modifier, 5, 'DEX +3 and a +2 proficiency bonus');
  assert.match(app.log[0], /proficiency \+2/);
});

test('the rider dice fall back to the real rng when the caller passes none', () => {
  // The sheet's wiring calls the function with no options at all.
  const app = stubApp({ rng: scripted([face(20, 10)]) });
  rollCheck(app, hero({ conditions: [chip('Bless', ['save'])] }), { kind: 'save', key: 'DEX' });
  const rolled = app.rolls[0].selection.modifier - 3;
  assert.ok(rolled >= 1 && rolled <= 4, `a d4 rider landed in range, got ${rolled}`);
});
