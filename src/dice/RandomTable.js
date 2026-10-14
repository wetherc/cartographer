import { clampInt } from '../util/num.js';
import { placeWord } from '../map/GeneratorNames.js';

/** @typedef {import('../types/table.js').RandomTable} RandomTable */
/** @typedef {import('../types/table.js').TableRow} TableRow */
/** @typedef {import('../types/table.js').TableRoll} TableRoll */

/**
 * The pure model of a random table: weighted rows, a roll with an injected
 * RNG, and the coercion of a table read from a library file. A row text can
 * hold the token `{place}`, which a roll replaces with a generated place
 * word such as "Ashford", so a name table needs no list of every name.
 */

/** The highest weight one row can have. */
export const MAX_WEIGHT = 1000;

/** The token that a roll replaces with a generated place word. */
const PLACE_TOKEN = /\{place\}/g;

/**
 * The sum of the row weights.
 * @param {Pick<RandomTable, 'rows'>} table
 * @returns {number}
 */
export function totalWeight(table) {
  return table.rows.reduce((sum, row) => sum + row.weight, 0);
}

/**
 * The index of the row that one RNG draw picks. The draw falls in [0, 1)
 * and maps onto the total weight, so each row covers a span as wide as its
 * weight. A table with no rows gives -1.
 * @param {Pick<RandomTable, 'rows'>} table
 * @param {() => number} rng
 * @returns {number}
 */
export function pickRowIndex(table, rng) {
  const total = totalWeight(table);
  if (total <= 0) return -1;
  let point = rng() * total;
  for (let i = 0; i < table.rows.length; i++) {
    point -= table.rows[i].weight;
    if (point < 0) return i;
  }
  // A draw of exactly 1 from a faulty RNG lands past the end.
  return table.rows.length - 1;
}

/**
 * Fill each `{place}` token of a row text with a generated place word.
 * @param {string} text
 * @param {() => number} rng
 * @returns {string}
 */
export function fillTokens(text, rng) {
  return text.replace(PLACE_TOKEN, () => placeWord(rng));
}

/**
 * Roll once on a table. The result is null for a table with no rows.
 * @param {RandomTable} table
 * @param {() => number} rng
 * @returns {TableRoll | null}
 */
export function rollTable(table, rng) {
  const index = pickRowIndex(table, rng);
  if (index < 0) return null;
  const row = table.rows[index];
  return { index, row, text: fillTokens(row.text, rng) };
}

/**
 * The chance of one row, as a whole percent, for the row list of the form.
 * @param {Pick<RandomTable, 'rows'>} table
 * @param {number} index
 * @returns {number}
 */
export function rowChance(table, index) {
  const total = totalWeight(table);
  return total > 0 ? Math.round((table.rows[index].weight / total) * 100) : 0;
}

/**
 * A clean row from any value, or null when the row has no text. A weight
 * that is missing, not a number, or below 1 reads as 1, and a weight above
 * the cap reads as the cap.
 * @param {unknown} raw
 * @returns {TableRow | null}
 */
export function normalizeRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const text = typeof record.text === 'string' ? record.text.trim() : '';
  if (!text) return null;
  return { weight: clampInt(record.weight, 1, MAX_WEIGHT, 1), text };
}

/**
 * A clean table from any value, or null when it has no name or no usable
 * row. A row that normalizeRow cannot repair drops out by itself.
 * @param {unknown} raw
 * @returns {RandomTable | null}
 */
export function normalizeTable(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name || !Array.isArray(record.rows)) return null;
  const rows = /** @type {TableRow[]} */ (record.rows.map(normalizeRow).filter(Boolean));
  return rows.length > 0 ? { name, rows } : null;
}

/**
 * The summary line of a table in the Library list, for example
 * "6 rows, weights total 20".
 * @param {RandomTable} table
 * @returns {string}
 */
export function tableSummary(table) {
  const count = table.rows.length;
  return `${count} ${count === 1 ? 'row' : 'rows'}, weights total ${totalWeight(table)}`;
}
