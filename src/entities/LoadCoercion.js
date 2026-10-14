import { PACT_BOONS } from '../data/invocationCatalog.js';

/**
 * Coercers for the list and record fields of a loaded character or creature.
 * The entity `withDefaults` functions run on data from a save or an imported
 * file, and the panels read these fields without a type check. A scalar
 * where a list belongs (`inventory: 5`) or a list of scalars throws during
 * startup, with the malformed save already stored. Every function here is
 * pure.
 */

import { normalizeChipMods } from './ChipMods.js';
import { clampInt } from '../util/num.js';
import { isRecord } from '../util/isRecord.js';

/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */

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
 * A stored resource list. An entry needs an id that is a string that is not
 * empty, because the slot, hit dice, and class pool code calls string methods
 * on it.
 * @param {unknown} value
 * @returns {any[]}
 */
export function resourceList(value) {
  return recordList(value).filter((entry) => typeof entry.id === 'string' && entry.id !== '');
}

/**
 * Stored ASI choices: either the record keyed by slot, or the older array.
 * Both keep only their record entries, and any other value reads as an
 * empty record. `migrateASIChoices` reads each array entry with `in`, which
 * throws on null. A record of the built-in Durable feat always gets the
 * `hitDieFloor` flag, since `spendHitDie` reads only the flag, and a stored
 * record without it would heal with no minimum.
 * @param {unknown} value
 * @returns {Record<string, any> | any[]}
 */
export function asiChoicesOf(value) {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, choice]) => isRecord(choice))
      .map(([key, choice]) => [
        key,
        choice.featId === 'durable' && !choice.hitDieFloor
          ? { ...choice, hitDieFloor: true }
          : choice,
      ]),
  );
}

/**
 * A stored level as a whole number from `min` to `max`, or undefined when the
 * value does not read as a finite number. The caster slot tables index by
 * this number, so a level such as `"__proto__"` or `{}` finds no row and
 * throws.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {number | undefined}
 */
export function levelOf(value, min, max) {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const n = Math.floor(Number(value));
  if (value === '' || !Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

/**
 * A stored condition list. An entry needs a string name, because the
 * condition chips and the exhaustion migration read it as one. A chip's mods
 * go through `normalizeChipMods`, so a stored `ac: "5"` reads as 5. As a
 * string, the AC sum would join it onto the base AC, and AC 15 would read as
 * 1505.
 * @param {unknown} value
 * @returns {Condition[]}
 */
export function conditionList(value) {
  return recordList(value)
    .filter((entry) => typeof entry.name === 'string')
    .map((entry) => {
      if (!('mods' in entry)) return entry;
      const { mods: raw, ...rest } = entry;
      const mods = normalizeChipMods(raw);
      return mods ? { ...rest, mods } : rest;
    });
}

/** The largest stored HP maximum raise. Chips of several spells can add up. */
const MAX_STORED_BOOST = 1000;

/** The largest HP maximum cut of exhaustion a save can store. */
const MAX_STORED_HALVED = 100000;

/**
 * An entity with its HP buff fields (see `HPBuffFields`) cleaned. The HP
 * maximum raise is a whole number from 0 up, and a raise of 0 or a value that
 * is not a number drops the field. The name of the chip that granted the
 * temporary HP stays only when it is a string that is not empty.
 * @template {Record<string, any>} T
 * @param {T} entity
 * @returns {T}
 */
export function coerceHPBuffs(entity) {
  const { hpBoost, bonusHPFrom, hpHalved, ...rest } = entity;
  const boost = clampInt(hpBoost, 0, MAX_STORED_BOOST, 0);
  const halved = clampInt(hpHalved, 0, MAX_STORED_HALVED, 0);
  return /** @type {T} */ ({
    ...rest,
    ...(boost > 0 ? { hpBoost: boost } : {}),
    ...(halved > 0 ? { hpHalved: halved } : {}),
    ...(typeof bonusHPFrom === 'string' && bonusHPFrom ? { bonusHPFrom } : {}),
  });
}

/**
 * A stored list of ids. A value that is not an array reads as empty, and an
 * entry that is not a string drops.
 * @param {unknown} value
 * @returns {string[]}
 */
export function stringList(value) {
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

/**
 * A stored warlock's picks: the invocation ids, the once-per-rest uses, and
 * the pact boon. A string where a list belongs reads as empty, because the
 * sheet calls list methods on both lists, and `String.includes` would read
 * a use id inside the string as spent. An unknown pact boon drops. An empty
 * field stays absent.
 * @param {{ invocations?: unknown, invocationUses?: unknown, pactBoon?: unknown }} value
 * @returns {{ invocations?: string[], invocationUses?: string[],
 *   pactBoon?: import('../types/invocation.js').PactBoon }}
 */
export function warlockPicks({ invocations, invocationUses, pactBoon }) {
  const picks = stringList(invocations);
  const uses = stringList(invocationUses);
  const boon = /** @type {import('../types/invocation.js').PactBoon | undefined} */ (
    PACT_BOONS.find((b) => b.id === pactBoon)?.id
  );
  return {
    ...(picks.length ? { invocations: picks } : {}),
    ...(uses.length ? { invocationUses: uses } : {}),
    ...(boon ? { pactBoon: boon } : {}),
  };
}
