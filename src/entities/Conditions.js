/** @typedef {import('../types/entities.js').Condition} Condition */

/**
 * The chip that a caster carries while it holds a spell open.
 * `entities/Concentration.js` writes and removes it, and the chip is named
 * here so the two modules agree on the spelling. It stays in the pick-list
 * below because a foe's concentration has no state behind it yet, and a
 * person still adds it by hand.
 */
export const CONCENTRATING = 'Concentrating';

/**
 * The chip that a creature carries while it is at 0 HP. `entities/DeathSaves.js`
 * writes and removes it, and the chip is named here so the two modules agree
 * on the spelling. It stays in the pick-list below because a foe has no death
 * saves behind it, and a person still adds it by hand.
 */
export const UNCONSCIOUS = 'Unconscious';

/**
 * The standard 5e status conditions, plus concentration and exhaustion,
 * offered as suggestions in the UI. A condition is a free string, so the GM
 * can add one that is not listed here. This is only the pick-list.
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
  UNCONSCIOUS,
];

/**
 * The optional halves of a chip. `source` names the cast that wrote it.
 * `rider` is what it adds to the holder's later rolls. Each is left off the
 * stored chip entirely when there is none, so a hand-added chip stores no
 * extra key.
 * @typedef {{
 *   source?: import('../types/entities.js').ConditionSource,
 *   rider?: import('../types/entities.js').RollRider,
 * }} ConditionExtras
 */

/**
 * @param {string} name
 * @param {number | null} [rounds] remaining rounds. Null means indefinite
 * @param {ConditionExtras} [extras]
 * @returns {Condition}
 */
export function createCondition(name, rounds = null, { source, rider } = {}) {
  return { name, rounds, ...(source ? { source } : {}), ...(rider ? { rider } : {}) };
}

/**
 * Add a condition, or update its duration if present. The match is
 * case-insensitive by name, so "Poisoned" does not stack with "poisoned".
 * Returns a new list. A replaced chip's source and rider go with it: the new
 * cast owns the condition now, and a hand-added replacement means the GM owns
 * it instead.
 * @param {Condition[]} list
 * @param {string} name
 * @param {number | null} [rounds]
 * @param {ConditionExtras} [extras]
 * @returns {Condition[]}
 */
export function addCondition(list, name, rounds = null, extras = {}) {
  const key = name.trim().toLowerCase();
  if (!key) return list;
  const without = list.filter((c) => c.name.toLowerCase() !== key);
  return [...without, createCondition(name.trim(), rounds, extras)];
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
 * Advance one round. Decrement every timed condition's counter and drop any
 * that reach zero. Indefinite conditions (rounds === null) stay untouched.
 * @param {Condition[]} list
 * @returns {Condition[]}
 */
export function tickConditions(list) {
  return list
    .map((c) => (c.rounds === null ? c : { ...c, rounds: c.rounds - 1 }))
    .filter((c) => c.rounds === null || c.rounds > 0);
}
