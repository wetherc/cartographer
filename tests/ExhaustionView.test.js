import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exhaustionReadout, nextLevel } from '../src/view/ExhaustionView.js';

test('a rested entity reads as level 0 with an empty badge and summary', () => {
  const readout = exhaustionReadout({});
  assert.equal(readout.level, 0);
  assert.equal(readout.label, 'Exhaustion');
  assert.equal(readout.badge, '', 'a headline has nothing to report at rest');
  assert.equal(readout.summary, '');
  assert.equal(readout.note, 'No exhaustion.');
  assert.equal(readout.ariaLabel, 'Exhaustion 0 of 6');
  assert.equal(readout.fatal, false);
  assert.deepEqual(
    readout.pips.map((p) => p.filled),
    [false, false, false, false, false, false],
  );
});

test('the pips fill up to the level, and the sixth is the fatal one', () => {
  const readout = exhaustionReadout({ exhaustion: 2 });
  assert.deepEqual(
    readout.pips.map((p) => p.filled),
    [true, true, false, false, false, false],
  );
  assert.deepEqual(
    readout.pips.map((p) => p.level),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    readout.pips.map((p) => p.fatal),
    [false, false, false, false, false, true],
  );
});

test('a level names its cost in the badge, the summary, and the note', () => {
  const readout = exhaustionReadout({ exhaustion: 3 });
  assert.equal(readout.badge, 'Exhaustion 3');
  assert.equal(readout.summary, '-6 to d20, -15 ft');
  assert.equal(readout.note, 'Exhaustion 3: -6 to every d20 test, and 15 feet slower.');
  assert.equal(readout.ariaLabel, 'Exhaustion 3 of 6');
  assert.equal(readout.fatal, false);
});

test('the sixth level reads as dead', () => {
  const readout = exhaustionReadout({ exhaustion: 6 });
  assert.equal(readout.fatal, true);
  assert.equal(readout.summary, 'Dead', 'a penalty means nothing to a dead combatant');
  assert.equal(readout.note, 'Exhaustion 6: dead.');
  assert.equal(
    readout.pips.every((p) => p.filled),
    true,
  );
});

test('a nonsense stored level clamps before it is drawn', () => {
  assert.equal(exhaustionReadout({ exhaustion: 99 }).level, 6);
  assert.equal(exhaustionReadout({ exhaustion: -4 }).level, 0);
});

test('a click raises to the pip, and a click on the current level steps down', () => {
  assert.equal(nextLevel(0, 1), 1);
  assert.equal(nextLevel(2, 5), 5);
  assert.equal(nextLevel(4, 2), 2, 'a lower pip drops to it');
  assert.equal(nextLevel(3, 3), 2, 'the pip that matches the level takes it off');
  assert.equal(nextLevel(1, 1), 0, 'the first pip clears the level');
});
