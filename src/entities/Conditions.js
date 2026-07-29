/** @typedef {import('../types/entities.js').Condition} Condition */

/**
 * The chip a caster holding a spell open carries. `entities/Concentration.js`
 * writes and removes it, and it is named here so the two modules agree on the
 * spelling. It stays in the pick-list below because a foe's concentration has no
 * state behind it yet and is still added by hand.
 */
export const CONCENTRATING = 'Concentrating';

/**
 * The standard 5e status conditions, plus concentration and exhaustion, offered
 * as suggestions in the UI. A condition is a free string, so a GM can add one
 * that isn't listed here; this is only the pick-list.
 * @type {string[]}
 */
export const CONDITIONS = [
  'Blinded',
  'Charmed',
  CONCENTRATING,
  'Deafened',
  'Exhaustion',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];

/**
 * @param {string} name
 * @param {number | null} [rounds] remaining rounds; null = indefinite
 * @returns {Condition}
 */
export function createCondition(name, rounds = null) {
  return { name, rounds };
}

/**
 * Add (or update the duration of) a condition, matched case-insensitively by
 * name so "Poisoned" doesn't stack with "poisoned". Returns a new list.
 * @param {Condition[]} list
 * @param {string} name
 * @param {number | null} [rounds]
 * @returns {Condition[]}
 */
export function addCondition(list, name, rounds = null) {
  const key = name.trim().toLowerCase();
  if (!key) return list;
  const without = list.filter((c) => c.name.toLowerCase() !== key);
  return [...without, createCondition(name.trim(), rounds)];
}

/**
 * Remove a condition by name (case-insensitive). Returns a new list.
 * @param {Condition[]} list
 * @param {string} name
 * @returns {Condition[]}
 */
export function removeCondition(list, name) {
  const key = name.toLowerCase();
  return list.filter((c) => c.name.toLowerCase() !== key);
}

/**
 * Advance one round: decrement every timed condition's counter and drop any
 * that reach zero. Indefinite conditions (rounds === null) are left untouched.
 * @param {Condition[]} list
 * @returns {Condition[]}
 */
export function tickConditions(list) {
  return list
    .map((c) => (c.rounds === null ? c : { ...c, rounds: c.rounds - 1 }))
    .filter((c) => c.rounds === null || c.rounds > 0);
}
