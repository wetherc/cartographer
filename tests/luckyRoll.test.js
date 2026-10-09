import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollD20InTray } from '../src/app/luckyRoll.js';

/** A stub app whose tray hands back the given d20 faces in order.
 * @param {number[]} faces */
function trayApp(faces) {
  const calls = /** @type {any[]} */ ([]);
  const app = /** @type {any} */ ({
    actions: {
      rollDice: (/** @type {any} */ selection, /** @type {any} */ target) => {
        const natural = faces[calls.length];
        calls.push({ selection, target });
        return { result: { total: natural, results: [{ die: 'd20', rolls: [natural] }] } };
      },
    },
  });
  return { app, calls };
}

const halfling = { raceId: 'halfling' };
const selection = { counts: { d20: 1 }, modifier: 0 };

test('a Lucky roller rerolls a natural 1 once and keeps the new roll', () => {
  const { app, calls } = trayApp([1, 1]);
  const { result, lucky } = rollD20InTray(app, halfling, selection, 12);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].target, 12);
  assert.equal(result.total, 1);
  assert.equal(lucky, true);
});

test('a roller without Lucky keeps a natural 1', () => {
  const { app, calls } = trayApp([1, 15]);
  const { result, lucky } = rollD20InTray(app, { raceId: 'elf' }, selection);
  assert.equal(calls.length, 1);
  assert.equal(result.total, 1);
  assert.equal(lucky, false);
});

test('a Lucky roller keeps any face above 1', () => {
  const { app, calls } = trayApp([2, 15]);
  assert.equal(rollD20InTray(app, halfling, selection).lucky, false);
  assert.equal(calls.length, 1);
});

test('a creature with no race keeps a natural 1', () => {
  const { app } = trayApp([1, 15]);
  assert.equal(rollD20InTray(app, null, selection).lucky, false);
});
