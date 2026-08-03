import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RIDER_ROLLS,
  DEFAULT_RIDER_DIE,
  normalizeRider,
  activeRiders,
  chipRider,
  riderText,
  riderSummary,
  rollRiders,
} from '../src/entities/Riders.js';
import { createCondition } from '../src/entities/Conditions.js';

/** A deterministic RNG replaying a queue of unit values, one per call. */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** rng() value that makes a d`sides` roll come up `face`. */
function face(sides, value) {
  return (value - 1) / sides + 1e-9;
}

/** Bless: +1d4 on attacks and saves. */
const BLESS = { rolls: ['attack', 'save'], dice: 1, die: 'd4' };
/** Bane: the same shape with the sign flipped. */
const BANE = { rolls: ['attack', 'save'], dice: -1, die: 'd4' };

test('the three roll kinds are the ones the model names', () => {
  assert.deepEqual(RIDER_ROLLS, ['attack', 'save', 'check']);
  assert.equal(DEFAULT_RIDER_DIE, 'd4');
});

test('normalizeRider keeps a usable block and drops one that changes nothing', () => {
  assert.deepEqual(normalizeRider({ rolls: ['attack', 'save'], dice: 1, die: 'd4' }), BLESS);
  assert.deepEqual(normalizeRider({ rolls: ['save'], flat: -2 }), { rolls: ['save'], flat: -2 });
  // A rider that touches no roll, or adds nothing, is not a rider.
  assert.equal(normalizeRider({ rolls: [], dice: 1 }), null);
  assert.equal(normalizeRider({ rolls: ['attack'], dice: 0, flat: 0 }), null);
  assert.equal(normalizeRider({ rolls: ['attack'] }), null);
  // A block that names no rolls at all, and one whose rolls are not a list.
  assert.equal(normalizeRider({ dice: 1 }), null);
  assert.equal(normalizeRider({ rolls: 'attack', dice: 1 }), null);
  assert.equal(normalizeRider(null), null);
  assert.equal(normalizeRider('1d4'), null);
});

test('normalizeRider repairs written input instead of rejecting it', () => {
  // Unknown roll names drop out, and the survivors come back in a fixed order.
  assert.deepEqual(normalizeRider({ rolls: ['save', 'wibble', 'attack'], dice: '2' }), {
    rolls: ['attack', 'save'],
    dice: 2,
    die: 'd4',
  });
  // An unreadable die falls back to the d4 every SRD rider uses.
  assert.equal(normalizeRider({ rolls: ['check'], dice: 1, die: 'd7' })?.die, 'd4');
  // A count past the ceiling is held there, sign kept.
  assert.equal(normalizeRider({ rolls: ['attack'], dice: 500 })?.dice, 20);
  assert.equal(normalizeRider({ rolls: ['attack'], dice: -500 })?.dice, -20);
  // Fractions truncate, and an unreadable number counts as none.
  assert.equal(normalizeRider({ rolls: ['attack'], dice: 1.9, flat: 'x' })?.dice, 1);
  assert.equal(normalizeRider({ rolls: ['attack'], dice: 'x', flat: 3 })?.dice, undefined);
});

test('a rider with no dice stores no die, so the block stays the shape it means', () => {
  assert.deepEqual(normalizeRider({ rolls: ['check'], flat: 2, die: 'd12' }), {
    rolls: ['check'],
    flat: 2,
  });
});

test('activeRiders picks only the chips that touch this roll', () => {
  const chips = [
    createCondition('Poisoned', 3),
    createCondition('Bless', 10, { rider: BLESS }),
    createCondition('Guidance', 10, { rider: { rolls: ['check'], dice: 1, die: 'd4' } }),
  ];
  assert.deepEqual(
    activeRiders(chips, 'attack').map((r) => r.condition.name),
    ['Bless'],
  );
  assert.deepEqual(
    activeRiders(chips, 'check').map((r) => r.condition.name),
    ['Guidance'],
  );
  assert.deepEqual(activeRiders([], 'save'), []);
  assert.deepEqual(activeRiders(undefined, 'save'), []);
});

test('a chip whose rider is malformed reads as a chip with no rider', () => {
  // Chips come out of the campaign save unchecked, so a hand-edited or
  // half-written save can hold any of these. None of them may reach a roll.
  const broken = [
    { name: 'No rolls key', rounds: null, rider: { dice: 1, die: 'd4' } },
    { name: 'Rolls not a list', rounds: null, rider: { rolls: 'attack', dice: 1 } },
    { name: 'Unknown roll kind', rounds: null, rider: { rolls: ['damage'], dice: 1 } },
    { name: 'Nothing to add', rounds: null, rider: { rolls: ['attack'] } },
    { name: 'Rider not an object', rounds: null, rider: 'bless' },
  ];
  for (const chip of broken) {
    assert.equal(chipRider(/** @type {any} */ (chip)), null, chip.name);
  }
  for (const kind of /** @type {const} */ (['attack', 'save', 'check'])) {
    assert.deepEqual(activeRiders(/** @type {any} */ (broken), kind), [], kind);
    assert.deepEqual(
      rollRiders(/** @type {any} */ (broken), kind, () => 0.5),
      {
        modifier: 0,
        note: '',
      },
    );
  }
});

test('a rider that names a die the app does not have rolls the default die', () => {
  // The die reaches the roller off the save, so an unknown one must not turn
  // the modifier into NaN. It reads as the default d4 instead.
  const chips = [
    /** @type {any} */ ({
      name: 'Odd',
      rounds: null,
      rider: { rolls: ['save'], dice: 1, die: 'd7' },
    }),
  ];
  const { modifier } = rollRiders(chips, 'save', () => 0.99);
  assert.equal(modifier, 4);
});

test('riderText and riderSummary read the rider back as signed text', () => {
  assert.equal(riderText(BLESS), '+1d4');
  assert.equal(riderText(BANE), '-1d4');
  assert.equal(riderText({ rolls: ['save'], dice: 2, die: 'd6', flat: -1 }), '+2d6 -1');
  assert.equal(riderText({ rolls: ['save'], flat: 3 }), '+3');
  // An absent die still reads as the default, the same die the roller uses.
  assert.equal(riderText({ rolls: ['save'], dice: 1 }), '+1d4');
  assert.equal(riderSummary(BLESS), '+1d4 to attack rolls and saving throws');
  assert.equal(riderSummary({ rolls: ['check'], dice: 1, die: 'd4' }), '+1d4 to ability checks');
  assert.equal(
    riderSummary({ rolls: ['attack', 'save', 'check'], flat: 1 }),
    '+1 to attack rolls, saving throws and ability checks',
  );
  // The normalizer never stores an empty roll list, so this only guards a
  // hand-built rider from reading as "+1 to undefined".
  assert.equal(riderSummary({ rolls: [], flat: 1 }), '+1 to nothing');
});

test('rollRiders adds a bonus die and subtracts a penalty die', () => {
  const blessed = [createCondition('Bless', 10, { rider: BLESS })];
  const bonus = rollRiders(blessed, 'attack', seq([face(4, 3)]));
  assert.equal(bonus.modifier, 3);
  assert.equal(bonus.note, 'Bless +1d4 [3]');

  const baned = [createCondition('Bane', 10, { rider: BANE })];
  const penalty = rollRiders(baned, 'save', seq([face(4, 3)]));
  assert.equal(penalty.modifier, -3);
  assert.equal(penalty.note, 'Bane -1d4 [3]');
});

test('a bonus and a penalty on the same roll both apply', () => {
  const chips = [
    createCondition('Bless', 10, { rider: BLESS }),
    createCondition('Bane', 10, { rider: BANE }),
  ];
  const { modifier, note } = rollRiders(chips, 'attack', seq([face(4, 4), face(4, 1)]));
  assert.equal(modifier, 3, '+4 from Bless and -1 from Bane');
  assert.equal(note, 'Bless +1d4 [4], Bane -1d4 [1]');
});

test('a flat rider rolls nothing and still reports itself', () => {
  const chips = [createCondition('Guided', null, { rider: { rolls: ['save'], flat: 2 } })];
  const { modifier, note } = rollRiders(chips, 'save', () => assert.fail('no die to roll'));
  assert.equal(modifier, 2);
  assert.equal(note, 'Guided +2');
});

test('several dice each roll their own face', () => {
  const chips = [
    createCondition('Heroism', 10, { rider: { rolls: ['attack'], dice: 2, die: 'd6', flat: 1 } }),
  ];
  const { modifier, note } = rollRiders(chips, 'attack', seq([face(6, 5), face(6, 2)]));
  assert.equal(modifier, 8, '5 + 2 from the dice plus the flat 1');
  assert.equal(note, 'Heroism +2d6 +1 [5,2]');
});

test('a roller with no rider chip costs nothing and says nothing', () => {
  const quiet = rollRiders([createCondition('Prone', null)], 'attack', () =>
    assert.fail('no die to roll'),
  );
  assert.deepEqual(quiet, { modifier: 0, note: '' });
  assert.deepEqual(rollRiders(undefined, 'save'), { modifier: 0, note: '' });
});

test('a rider that names no die rolls the default d4', () => {
  const chips = [createCondition('Blessed', 10, { rider: { rolls: ['save'], dice: 1 } })];
  const { modifier, note } = rollRiders(chips, 'save', seq([face(4, 4)]));
  assert.equal(modifier, 4);
  assert.equal(note, 'Blessed +1d4 [4]');
});
