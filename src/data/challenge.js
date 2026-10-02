/**
 * Challenge rating: the 5e measure of how much of a threat one creature is.
 * A rating says what a creature is worth in experience points, which is what
 * the encounter-difficulty math adds up. It also sets the proficiency bonus
 * the creature rolls with, which `Modifiers.crProficiencyBonus` reads, because
 * that is the same ladder a character level climbs.
 *
 * Every function here is pure, and the tables are verbatim SRD data.
 */

/**
 * Every rating a creature can hold, in order. The four values below 1 are
 * stored as fractions of one, so that a rating always compares and adds as a
 * plain number. `crLabel` prints them the conventional way.
 * @type {number[]}
 */
export const CR_STEPS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

/**
 * The experience points a creature of each rating is worth. This is the SRD
 * table. A rating of 0 is the one entry the rules give two values for, 0 or
 * 10, and the app uses 10, so that a swarm of the weakest foes still counts
 * for something in the difficulty math.
 * @type {Record<string, number>}
 */
const CR_XP = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10000,
  14: 11500,
  15: 13000,
  16: 15000,
  17: 18000,
  18: 20000,
  19: 22000,
  20: 25000,
  21: 33000,
  22: 41000,
  23: 50000,
  24: 62000,
  25: 75000,
  26: 90000,
  27: 105000,
  28: 120000,
  29: 135000,
  30: 155000,
};

/** The fraction labels, keyed by the number they are stored as.
 * @type {Record<string, string>} */
const FRACTION_LABELS = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };

/**
 * The experience points a rating is worth, or 0 for a value that is not a
 * rating. A caller that must tell "worth nothing" from "not rated" checks the
 * rating for absence first.
 * @param {number} cr
 * @returns {number}
 */
export function crXP(cr) {
  return CR_XP[String(cr)] ?? 0;
}

/**
 * A rating as it is written: "1/4", "0", "12". A value that is not a rating
 * prints as an empty string.
 * @param {number} cr
 * @returns {string}
 */
export function crLabel(cr) {
  if (!isChallengeRating(cr)) return '';
  return FRACTION_LABELS[String(cr)] ?? String(cr);
}

/**
 * True for one of the ratings in `CR_STEPS`. This rejects a value between two
 * steps, for example 1.5, because the rules define no such rating and no XP
 * value exists for it.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isChallengeRating(value) {
  return typeof value === 'number' && CR_STEPS.includes(value);
}

/**
 * Read a rating out of untrusted data: a saved creature, a library file, or a
 * form field. A number that names a step is kept. A string is parsed, both as
 * a fraction ("1/4") and as a plain number ("3"). Anything else, an absent
 * value included, reads as undefined, which means "not rated" everywhere in
 * the app. Nothing is snapped to a nearby step, because a rating between two
 * steps is more likely a typo than an intent.
 * @param {unknown} value
 * @returns {number | undefined}
 */
export function coerceCR(value) {
  const parsed = typeof value === 'string' ? parseRating(value.trim()) : value;
  return isChallengeRating(parsed) ? /** @type {number} */ (parsed) : undefined;
}

/**
 * Parse one written rating into its number. A blank string is not a rating.
 * @param {string} text
 * @returns {number | undefined}
 */
function parseRating(text) {
  if (!text) return undefined;
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? undefined : Number(fraction[1]) / denominator;
  }
  const plain = Number(text);
  return Number.isFinite(plain) ? plain : undefined;
}

/**
 * The rating picker's choices, with a blank first entry for a creature that
 * nobody has rated. Both creature forms render this list.
 * @returns {{ value: string, label: string }[]}
 */
export function crOptions() {
  return [
    { value: '', label: 'Unrated' },
    ...CR_STEPS.map((cr) => ({ value: String(cr), label: `CR ${crLabel(cr)}` })),
  ];
}
