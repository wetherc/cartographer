import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trayRollLine, tableRollLine, SECRET_ROLL_LINE } from '../src/log/TrayRollLine.js';
import { createEntry } from '../src/log/Travelogue.js';
import { playerEntry } from '../src/log/LogVisibility.js';

test('a plain tray roll logs one line for every viewer', () => {
  const line = trayRollLine('The GM', 'd20 (4) + 3 = 7', { gm: true });
  assert.deepEqual(line, { message: 'The GM rolls d20 (4) + 3 = 7.' });
});

test('a hidden GM roll is GM-only, and a Player tab reads the secret line', () => {
  const line = trayRollLine('The GM', 'd20 (4) + 3 = 7 vs target 15: failure', {
    hidden: true,
    gm: true,
  });
  assert.equal(line.message, 'The GM rolls in secret: d20 (4) + 3 = 7 vs target 15: failure.');
  const entry = createEntry('e1', 'roll', line.message, 1, line.options);
  assert.equal(entry.gm, true);
  assert.equal(playerEntry(entry)?.message, SECRET_ROLL_LINE);
});

test('a player tab cannot hide a roll', () => {
  const line = trayRollLine('Wren', 'd20 (12) = 12', { hidden: true, gm: false });
  assert.deepEqual(line, { message: 'Wren rolls d20 (12) = 12.' });
});

test('a table roll names the table and closes the row text with one period', () => {
  assert.deepEqual(tableRollLine('The GM', 'Loot', 'A silver locket', { gm: true }), {
    message: 'The GM rolls on Loot: A silver locket.',
  });
  assert.equal(
    tableRollLine('The GM', 'Road', 'All quiet.').message,
    'The GM rolls on Road: All quiet.',
  );
});

test('a hidden GM table roll is GM-only, and a Player tab reads the secret line', () => {
  const line = tableRollLine('The GM', 'Loot', 'A gold ring', { hidden: true, gm: true });
  assert.equal(line.message, 'The GM rolls on Loot in secret: A gold ring.');
  const entry = createEntry('e1', 'roll', line.message, 1, line.options);
  assert.equal(playerEntry(entry)?.message, SECRET_ROLL_LINE);
  assert.equal(tableRollLine('Wren', 'Loot', 'A gold ring', { hidden: true }).options, undefined);
});
