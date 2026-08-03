/**
 * Riders: what a condition chip adds to the rolls its holder makes later.
 * Bless puts a chip on an ally that adds 1d4 to its attack rolls and saving
 * throws. Bane puts the same chip shape on a foe with the sign flipped.
 *
 * Every function is pure, and the dice come from the injected random number
 * generator. Nothing here reads or writes a character. The roll sites call
 * `rollRiders` with the roller's own condition list.
 */

import { DIE_SIDES } from '../dice/DiceRoller.js';
import { clamp } from '../util/num.js';

/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/entities.js').RollRider} RollRider */
/** @typedef {import('../types/entities.js').RiderRoll} RiderRoll */
/** @typedef {import('../types/dice.js').DieType} DieType */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * The rolls a rider can touch, in the order the authoring form lists them.
 * @type {RiderRoll[]}
 */
export const RIDER_ROLLS = ['attack', 'save', 'check'];

/** The die a rider uses when it names none. Every rider in the SRD is a d4. */
export const DEFAULT_RIDER_DIE = /** @type {DieType} */ ('d4');

/** How many dice one rider may roll, in either direction. This is a sanity
 * ceiling on written input, not a rule of the game. */
const MAX_RIDER_DICE = 20;

/** The largest flat amount one rider may add or subtract. The same kind of
 * ceiling as the dice count: it holds a typo out of the roll instead of
 * expressing a rule. */
const MAX_RIDER_FLAT = 100;

/**
 * Coerce a written rider block into a clean one, or return null when the
 * value says nothing usable. A rider that touches no roll changes nothing, so
 * it reads as absent. So does one with no dice and no flat amount. The
 * authoring form and the library normalizer share this function, so a typed
 * rider and an imported one can never disagree.
 * @param {unknown} value
 * @returns {RollRider | null}
 */
export function normalizeRider(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const written = Array.isArray(raw.rolls) ? raw.rolls : [];
  const rolls = RIDER_ROLLS.filter((kind) => written.includes(kind));
  if (rolls.length === 0) return null;
  const dice = Math.trunc(Number(raw.dice));
  const count = Number.isFinite(dice) ? clamp(dice, -MAX_RIDER_DICE, MAX_RIDER_DICE) : 0;
  const flatValue = Math.trunc(Number(raw.flat));
  const flat = Number.isFinite(flatValue) ? clamp(flatValue, -MAX_RIDER_FLAT, MAX_RIDER_FLAT) : 0;
  if (count === 0 && flat === 0) return null;
  const die = typeof raw.die === 'string' && raw.die in DIE_SIDES ? raw.die : DEFAULT_RIDER_DIE;
  return {
    rolls,
    ...(count !== 0 ? { dice: count, die: /** @type {DieType} */ (die) } : {}),
    ...(flat !== 0 ? { flat } : {}),
  };
}

/**
 * The rider a chip carries, cleaned, or null when it carries none.
 *
 * Chips live in the campaign save, and nothing sanitizes a save's chips on
 * the way in. A hand-edited or half-written save can therefore hold a rider
 * with no `rolls` list or with a die that does not exist. Every read of a
 * stored rider goes through here, so a broken one reads as absent instead of
 * throwing inside an attack roll.
 * @param {Condition | undefined | null} condition
 * @returns {RollRider | null}
 */
export function chipRider(condition) {
  return normalizeRider(condition?.rider);
}

/**
 * The chips on a creature that touch one kind of roll, each with its cleaned
 * rider. A chip with no rider, such as a hand-added Poisoned, is not one of
 * them.
 * @param {Condition[] | undefined} conditions
 * @param {RiderRoll} kind
 * @returns {{ condition: Condition, rider: RollRider }[]}
 */
export function activeRiders(conditions, kind) {
  if (!Array.isArray(conditions)) return [];
  /** @type {{ condition: Condition, rider: RollRider }[]} */
  const found = [];
  for (const condition of conditions) {
    const rider = chipRider(condition);
    if (rider?.rolls.includes(kind)) found.push({ condition, rider });
  }
  return found;
}

/**
 * One rider as a short signed string, for a chip tooltip or a spell readout.
 * A rider with both halves states both, for example `+1d4 +1`.
 * @param {RollRider} rider
 * @returns {string}
 */
export function riderText(rider) {
  const parts = [];
  const dice = rider.dice ?? 0;
  if (dice !== 0) {
    parts.push(`${dice > 0 ? '+' : '-'}${Math.abs(dice)}${rider.die ?? DEFAULT_RIDER_DIE}`);
  }
  const flat = rider.flat ?? 0;
  if (flat !== 0) parts.push(`${flat > 0 ? '+' : ''}${flat}`);
  return parts.join(' ');
}

/** How each roll kind reads in a sentence. @type {Record<RiderRoll, string>} */
const ROLL_NAMES = {
  attack: 'attack rolls',
  save: 'saving throws',
  check: 'ability checks',
};

/**
 * One rider as a full sentence naming the rolls it touches, for the spell
 * detail modal and the chip tooltip.
 * @param {RollRider} rider
 * @returns {string}
 */
export function riderSummary(rider) {
  const rolls = rider.rolls.map((kind) => ROLL_NAMES[kind]);
  const last = rolls[rolls.length - 1];
  const list =
    rolls.length <= 1 ? (last ?? 'nothing') : `${rolls.slice(0, -1).join(', ')} and ${last}`;
  return `${riderText(rider)} to ${list}`;
}

/**
 * Roll every rider a creature holds against one kind of roll, and report what
 * they come to. The dice roll here rather than joining the caller's own
 * selection, so a bonus and a penalty resolve the same way and a save site
 * with no dice tray works identically to an attack site with one.
 *
 * The note names each chip and the faces it rolled, so a log line can explain
 * the number. A creature with no rider chip costs one pass over its chips and
 * returns a zero modifier with an empty note, which every call site treats as
 * nothing to say.
 * @param {Condition[] | undefined} conditions
 * @param {RiderRoll} kind
 * @param {RandomFn} [rng]
 * @returns {{ modifier: number, note: string }}
 */
export function rollRiders(conditions, kind, rng = Math.random) {
  const chips = activeRiders(conditions, kind);
  if (chips.length === 0) return { modifier: 0, note: '' };
  let modifier = 0;
  const notes = [];
  for (const { condition, rider } of chips) {
    const dice = rider.dice ?? 0;
    const die = rider.die ?? DEFAULT_RIDER_DIE;
    /** @type {number[]} */
    const faces = [];
    for (let i = 0; i < Math.abs(dice); i++) {
      faces.push(Math.floor(rng() * DIE_SIDES[die]) + 1);
    }
    const sum = faces.reduce((total, face) => total + face, 0);
    modifier += (dice < 0 ? -sum : sum) + (rider.flat ?? 0);
    notes.push(
      faces.length > 0
        ? `${condition.name} ${riderText(rider)} [${faces.join(',')}]`
        : `${condition.name} ${riderText(rider)}`,
    );
  }
  return { modifier, note: notes.join(', ') };
}
