/**
 * Coercers for the list and record fields of a loaded character or creature.
 * The entity `withDefaults` functions run on data from a save or an imported
 * file, and the panels read these fields without a type check. A scalar
 * where a list belongs (`inventory: 5`) or a list of scalars throws during
 * startup, with the malformed save already stored. Every function here is
 * pure.
 */

/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A stored list as its record entries. A value that is not an array reads as
 * empty.
 * @param {unknown} value
 * @returns {any[]}
 */
export function recordList(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/**
 * A stored condition list. An entry needs a string name, because the
 * condition chips and the exhaustion migration read it as one.
 * @param {unknown} value
 * @returns {Condition[]}
 */
export function conditionList(value) {
  return recordList(value).filter((entry) => typeof entry.name === 'string');
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringList(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}

/**
 * A stored spellbook with its three id lists, or undefined when the value is
 * not a record. The `sources` map stays only when it is a record, and keeps
 * only its string values.
 * @param {unknown} value
 * @returns {Spellbook | undefined}
 */
export function spellbookOf(value) {
  if (!isRecord(value)) return undefined;
  /** @type {Spellbook} */
  const book = {
    cantrips: stringList(value.cantrips),
    known: stringList(value.known),
    prepared: stringList(value.prepared),
  };
  if (isRecord(value.sources)) {
    book.sources = Object.fromEntries(
      Object.entries(value.sources).filter(([, classId]) => typeof classId === 'string'),
    );
  }
  return book;
}
