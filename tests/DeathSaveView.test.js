import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deathSaveReadout, deathSaveStatus } from '../src/view/DeathSaveView.js';

/** @param {Partial<import('../src/types/entities.js').DeathSaveState>} [over] */
function state(over = {}) {
  return { successes: 0, failures: 0, stable: false, ...over };
}

test('a character with no tracker has no status and no readout', () => {
  assert.equal(deathSaveStatus(null), null);
  assert.equal(deathSaveStatus(undefined), null);
  assert.equal(deathSaveReadout(null), null);
});

test('the status separates dying, stable, and dead', () => {
  assert.equal(deathSaveStatus(state()), 'dying');
  assert.equal(deathSaveStatus(state({ successes: 2, failures: 2 })), 'dying');
  assert.equal(deathSaveStatus(state({ stable: true })), 'stable');
  assert.equal(deathSaveStatus(state({ failures: 3 })), 'dead');
  assert.equal(deathSaveStatus(state({ failures: 4 })), 'dead', 'a crit can overshoot');
});

test('a dying readout marks one pip per save rolled and offers both controls', () => {
  const readout = deathSaveReadout(state({ successes: 1, failures: 2 }));
  assert.equal(readout?.status, 'dying');
  assert.equal(readout?.label, 'Death saves');
  assert.deepEqual(readout?.pips, [
    { kind: 'success', filled: true },
    { kind: 'success', filled: false },
    { kind: 'success', filled: false },
    { kind: 'failure', filled: true },
    { kind: 'failure', filled: true },
    { kind: 'failure', filled: false },
  ]);
  assert.equal(readout?.ariaLabel, 'Death saves: 1 of 3 successes, 2 of 3 failures');
  assert.equal(readout?.rollable, true);
  assert.equal(readout?.stabilizable, true);
});

test('a stable readout drops the pips and the controls', () => {
  const readout = deathSaveReadout(state({ stable: true }));
  assert.equal(readout?.label, 'Stable at 0 HP');
  assert.deepEqual(readout?.pips, []);
  assert.equal(readout?.rollable, false);
  assert.equal(readout?.stabilizable, false);
});

test('a dead readout says so and offers nothing', () => {
  const readout = deathSaveReadout(state({ successes: 2, failures: 3 }));
  assert.equal(readout?.status, 'dead');
  assert.equal(readout?.label, 'Dead');
  assert.deepEqual(readout?.pips, []);
  assert.equal(readout?.rollable, false);
  assert.equal(readout?.stabilizable, false);
});

test('dead outranks stable, so a stabilized character that dies reads as dead', () => {
  assert.equal(deathSaveReadout(state({ stable: true, failures: 3 }))?.label, 'Dead');
});
