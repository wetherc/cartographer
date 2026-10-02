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
 * The standard 5e status conditions, plus concentration, offered as
 * suggestions in the UI. A condition is a free string, so the GM can add one
 * that is not listed here. This is only the pick-list.
 *
 * Exhaustion is not among them. It is a level from 0 to 6 rather than an
 * on-or-off state, so it is a stored number that `entities/Exhaustion.js`
 * owns and its own stepper sets. Offering it here as well would give the GM
 * two ways to say the same thing, and only one of them would reach a roll.
 * @type {string[]}
 */
export const CONDITIONS = [
  'Blinded',
  'Charmed',
  CONCENTRATING,
  'Deafened',
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
 * The optional parts of a chip. `source` names the cast that wrote it.
 * `rider` is what it adds to the holder's later rolls. `expires` is the turn
 * boundary that ends it, `ongoing` is the damage it deals at the end of each
 * of the holder's turns, and `mods` is what it changes besides a roll, such
 * as AC. Each is left off the stored chip entirely when there is none, so a
 * hand-added chip stores no extra key.
 * @typedef {{
 *   source?: import('../types/entities.js').ConditionSource,
 *   rider?: import('../types/entities.js').RollRider,
 *   expires?: import('../types/entities.js').ChipExpiry,
 *   ongoing?: import('../types/entities.js').OngoingDamage,
 *   mods?: import('../types/entities.js').ChipMods,
 *   hit?: import('../types/entities.js').HitRider,
 * }} ConditionExtras
 */

/**
 * @param {string} name
 * @param {number | null} [rounds] remaining rounds. Null means indefinite
 * @param {ConditionExtras} [extras]
 * @returns {Condition}
 */
export function createCondition(
  name,
  rounds = null,
  { source, rider, expires, ongoing, mods, hit } = {},
) {
  return {
    name,
    rounds,
    ...(source ? { source } : {}),
    ...(rider ? { rider } : {}),
    ...(expires ? { expires } : {}),
    ...(ongoing ? { ongoing } : {}),
    ...(mods ? { mods } : {}),
    ...(hit ? { hit } : {}),
  };
}

/**
 * How long a chip has left, in rounds, for comparing two chips. A chip that
 * ends at a turn boundary counts one round per boundary left. A chip with no
 * count runs until something removes it, so it outlasts every timed chip.
 * @param {Condition} condition
 * @returns {number}
 */
export function chipLength(condition) {
  if (condition.expires) return condition.expires.count;
  return condition.rounds ?? Infinity;
}

/**
 * Whether a chip deals ongoing damage (Acid Arrow) or lets its holder retry
 * a save against it (Phantasmal Killer).
 * Two casts of such a chip each keep their own chip, so each one rolls its
 * damage and its save. The condition that the name states still applies once,
 * because every reader asks whether some chip has the name.
 * @param {Condition} chip
 * @returns {boolean}
 */
export function tracksCast(chip) {
  return Boolean(chip.ongoing || chip.source?.saveEnds);
}

/**
 * Whether two chips fill the same place on a creature, so that a new one
 * replaces the old one. Chips of the same name share a place. When either
 * chip tracks its cast (see `tracksCast`), they share a place only when the
 * same caster cast the same spell, and a hand-added chip shares none with it.
 * @param {Condition} a
 * @param {Condition} b
 * @returns {boolean}
 */
export function sameSlot(a, b) {
  if (a.name.trim().toLowerCase() !== b.name.trim().toLowerCase()) return false;
  if (!tracksCast(a) && !tracksCast(b)) return true;
  const x = a.source;
  const y = b.source;
  return Boolean(x && y && x.spellId === y.spellId && x.casterId === y.casterId);
}

/**
 * How strong a chip's mods are, for comparing two casts of one spell. The
 * sum of the number fields works because one spell writes the same fields at
 * every slot level, and only the size changes (Aid's +5 at 2nd level and +10
 * at 3rd).
 * @param {import('../types/entities.js').ChipMods | undefined} mods
 * @returns {number}
 */
function potency(mods) {
  if (!mods) return 0;
  return (mods.maxHP ?? 0) + (mods.ac ?? 0) + (mods.acMin ?? 0) + (mods.tempHPEachTurn ?? 0);
}

/**
 * Whether a chip that one cast wrote keeps its place against a new chip in
 * the same place from another cast (see `sameSlot`). A one-round Blinded from
 * Color Spray would otherwise replace the one-minute Blinded of
 * Blindness/Deafness, and the target would see again after one round, so the
 * longer chip stays. Two casts of one spell with different mods follow the
 * 5e rule for overlapping effects of one spell, and the stronger chip stays
 * whatever its length: a 2nd-level Aid does not replace a 3rd-level Aid, even
 * from the same caster. A hand-added chip names no cast, so the new chip
 * always replaces it, and a recast of the same spell by the same caster with
 * equal mods always refreshes its own chip.
 * @param {Condition | undefined} held the chip the creature has now
 * @param {Condition} incoming the chip a cast wants to write
 * @returns {boolean}
 */
export function outlasts(held, incoming) {
  const a = held?.source;
  const b = incoming.source;
  if (!held || !a || !b) return false;
  if (a.spellId === b.spellId) {
    const diff = potency(held.mods) - potency(incoming.mods);
    if (diff !== 0) return diff > 0;
    if (a.casterId === b.casterId) return false;
  }
  return chipLength(held) > chipLength(incoming);
}

/**
 * Add a condition, or update its duration if present. The chip replaces any
 * chip in the same place (see `sameSlot`), and the name match is
 * case-insensitive, so "Poisoned" does not stack with "poisoned". Returns a
 * new list. A replaced chip's source and rider go with it: the new cast owns
 * the condition now, and a hand-added replacement means the GM owns it
 * instead.
 * @param {Condition[]} list
 * @param {string} name
 * @param {number | null} [rounds]
 * @param {ConditionExtras} [extras]
 * @returns {Condition[]}
 */
export function addCondition(list, name, rounds = null, extras = {}) {
  if (!name.trim()) return list;
  const chip = createCondition(name.trim(), rounds, extras);
  return [...list.filter((c) => !sameSlot(c, chip)), chip];
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
 * Remove one chip that a person picked, such as with the remove button of a
 * conditions bar. It takes off only the chips in the same place as `chip`
 * (see `sameSlot`), so when two casters' Hold Person each keep a Paralyzed
 * chip, removing one leaves the other. Returns a new list.
 * @param {Condition[]} list
 * @param {Condition} chip
 * @returns {Condition[]}
 */
export function removeChip(list, chip) {
  return list.filter((c) => !sameSlot(c, chip));
}

/**
 * Take off the chips that damage ends, such as the Unconscious of Sleep. The
 * damage write paths of both kinds of combatant call this, so a hit from any
 * source wakes the holder. A list with no such chip comes back as the same
 * array.
 * @param {Condition[]} list
 * @returns {Condition[]}
 */
export function endOnDamage(list) {
  const kept = list.filter((c) => !c.source?.endsOnDamage);
  return kept.length === list.length ? list : kept;
}

/**
 * Advance one round. Decrement every timed condition's counter and drop any
 * that reach zero. Indefinite conditions (rounds === null) stay untouched,
 * and a list with no timed condition comes back as the same array.
 * @param {Condition[]} list
 * @returns {Condition[]}
 */
export function tickConditions(list) {
  if (!list.some((c) => c.rounds !== null)) return list;
  return list
    .map((c) => (c.rounds === null ? c : { ...c, rounds: c.rounds - 1 }))
    .filter((c) => c.rounds === null || c.rounds > 0);
}

/**
 * The log line for a chip that ends. A standard condition is an adjective,
 * so it reads "Goblin is no longer Paralyzed." Any other chip is named after
 * a spell or typed by the GM, and a name such as Haste has no adjective form
 * the app can build, so it reads "Goblin is no longer affected by Haste."
 * @param {string} holder
 * @param {string} condition
 * @returns {string}
 */
export function endedLine(holder, condition) {
  const key = condition.trim().toLowerCase();
  const standard = CONDITIONS.some((n) => n.toLowerCase() === key);
  return `${holder} is no longer ${standard ? '' : 'affected by '}${condition}`;
}
