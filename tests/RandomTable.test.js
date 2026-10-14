import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_WEIGHT,
  fillTokens,
  normalizeRow,
  normalizeTable,
  pickRowIndex,
  rollTable,
  rowChance,
  tableSummary,
  totalWeight,
} from '../src/dice/RandomTable.js';
import { DEFAULT_TABLES } from '../src/data/tables.js';

const TABLE = {
  name: 'Weather',
  rows: [
    { weight: 1, text: 'Rain' },
    { weight: 3, text: 'Sun' },
  ],
};

/** An RNG that returns the given draws in order. @param {number[]} draws */
const seq = (...draws) => {
  let i = 0;
  return () => draws[i++ % draws.length];
};

test('totalWeight sums the row weights', () => {
  assert.equal(totalWeight(TABLE), 4);
  assert.equal(totalWeight({ rows: [] }), 0);
});

test('pickRowIndex maps a draw onto spans as wide as each weight', () => {
  assert.equal(
    pickRowIndex(TABLE, () => 0),
    0,
  );
  assert.equal(
    pickRowIndex(TABLE, () => 0.24),
    0,
  );
  assert.equal(
    pickRowIndex(TABLE, () => 0.25),
    1,
  );
  assert.equal(
    pickRowIndex(TABLE, () => 0.99),
    1,
  );
});

test('pickRowIndex keeps a draw of 1 on the last row and gives -1 for no rows', () => {
  assert.equal(
    pickRowIndex(TABLE, () => 1),
    1,
  );
  assert.equal(
    pickRowIndex({ rows: [] }, () => 0.5),
    -1,
  );
});

test('rollTable returns the row, its index, and the filled text', () => {
  assert.deepEqual(
    rollTable(TABLE, () => 0.5),
    { index: 1, row: TABLE.rows[1], text: 'Sun' },
  );
  assert.equal(
    rollTable({ name: 'Empty', rows: [] }, () => 0),
    null,
  );
});

test('fillTokens replaces each place token with a generated word', () => {
  const text = fillTokens('{place} and {place}', seq(0.9, 0, 0));
  assert.match(text, /^[A-Z][a-z]+ and [A-Z][a-z]+$/);
  assert.equal(
    fillTokens('No token', () => 0),
    'No token',
  );
});

test('rowChance gives a whole percent, and 0 for a table with no weight', () => {
  assert.equal(rowChance(TABLE, 0), 25);
  assert.equal(rowChance(TABLE, 1), 75);
  assert.equal(rowChance({ rows: [{ weight: 0, text: 'x' }] }, 0), 0);
});

test('normalizeRow trims the text and bounds the weight', () => {
  assert.deepEqual(normalizeRow({ weight: 2, text: ' Fog ' }), { weight: 2, text: 'Fog' });
  assert.deepEqual(normalizeRow({ text: 'Fog' }), { weight: 1, text: 'Fog' });
  assert.deepEqual(normalizeRow({ weight: -4, text: 'Fog' }), { weight: 1, text: 'Fog' });
  assert.deepEqual(normalizeRow({ weight: 'x', text: 'Fog' }), { weight: 1, text: 'Fog' });
  assert.deepEqual(normalizeRow({ weight: 2.7, text: 'Fog' }), { weight: 2, text: 'Fog' });
  assert.deepEqual(normalizeRow({ weight: 1e9, text: 'Fog' }), { weight: MAX_WEIGHT, text: 'Fog' });
});

test('normalizeRow drops a row with no text', () => {
  for (const raw of [null, 'Fog', 7, { weight: 2 }, { text: '  ' }, { text: 3 }]) {
    assert.equal(normalizeRow(raw), null, JSON.stringify(raw));
  }
});

test('normalizeTable keeps the repairable rows and drops the rest', () => {
  assert.deepEqual(normalizeTable({ name: ' Weather ', rows: [{ text: 'Rain' }, { weight: 3 }] }), {
    name: 'Weather',
    rows: [{ weight: 1, text: 'Rain' }],
  });
});

test('normalizeTable refuses a table with no name or no usable row', () => {
  for (const raw of [
    null,
    'Weather',
    { rows: [{ text: 'Rain' }] },
    { name: ' ', rows: [{ text: 'Rain' }] },
    { name: 'Weather' },
    { name: 'Weather', rows: 'Rain' },
    { name: 'Weather', rows: [{ text: '' }] },
  ]) {
    assert.equal(normalizeTable(raw), null, JSON.stringify(raw));
  }
});

test('tableSummary names the row count and the total weight', () => {
  assert.equal(tableSummary(TABLE), '2 rows, weights total 4');
  assert.equal(
    tableSummary({ name: 'One', rows: [{ weight: 5, text: 'x' }] }),
    '1 row, weights total 5',
  );
});

test('every built-in table is already in normal form and frozen', () => {
  assert.ok(DEFAULT_TABLES.length >= 3);
  for (const table of DEFAULT_TABLES) {
    assert.deepEqual(normalizeTable(table), table);
    assert.ok(Object.isFrozen(table.rows[0]));
  }
});
