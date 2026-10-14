import { DIE_SIDES } from '../dice/DiceRoller.js';
import { clampInt } from '../util/num.js';

/**
 * Hit riders: extra damage dice that a chip adds to hits. Divine Favor puts a
 * chip on its caster, and each weapon hit of the caster deals 1d4 radiant
 * more. Hunter's Mark puts a chip on a foe with `mark` set, and each weapon
 * hit of the caster against that foe deals 1d6 more. The chip's source names
 * the caster, so a mark from one ranger does nothing for another. Every
 * function here is pure.
 */

/** A chip, or a feat stamp read as a rider source, that may add damage to
 * hits. Only a chip carries `hit` and `source`.
 * @typedef {{ name: string, hit?: HitRider, source?: { casterId?: string } }} HitSource */
/** @typedef {import('../types/entities.js').HitRider} HitRider */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */

/** How many dice one hit rider may roll. A sanity ceiling on written input. */
const MAX_HIT_DICE = 20;

/**
 * Coerce a written hit rider into a clean one, or return null when it adds
 * nothing. The die has to be one the dice tray knows. A rider with no damage
 * type deals the type of the weapon or spell it rides on.
 * @param {unknown} value
 * @returns {HitRider | null}
 */
export function normalizeHitRider(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const count = clampInt(raw.count, 0, MAX_HIT_DICE, 0);
  const sides = Number(raw.sides);
  if (count === 0 || !Object.values(DIE_SIDES).includes(sides)) return null;
  const type = typeof raw.damageType === 'string' ? raw.damageType.trim().toLowerCase() : '';
  return {
    count,
    sides,
    ...(type ? { damageType: type } : {}),
    ...(raw.weaponOnly === true ? { weaponOnly: true } : {}),
    ...(raw.mark === true ? { mark: true } : {}),
  };
}

/**
 * The hit riders that apply to one hit, each with the chip name for the log.
 * The attacker's own chips count when they carry no mark. The defender's
 * chips count when they carry a mark that the attacker cast. A rider with
 * `weaponOnly` counts only for a weapon hit.
 * @param {{ id: string, conditions?: HitSource[] }} attacker
 * @param {{ conditions?: HitSource[] }} defender
 * @param {{ weapon: boolean }} hit
 * @returns {{ name: string, rider: HitRider }[]}
 */
export function hitRiders(attacker, defender, { weapon }) {
  /** @type {{ name: string, rider: HitRider }[]} */
  const found = [];
  /** @param {HitSource} chip @param {boolean} marked */
  const take = (chip, marked) => {
    const rider = normalizeHitRider(chip.hit);
    if (!rider || Boolean(rider.mark) !== marked) return;
    if (rider.weaponOnly && !weapon) return;
    if (marked && chip.source?.casterId !== attacker.id) return;
    found.push({ name: chip.name, rider });
  };
  for (const chip of attacker.conditions ?? []) take(chip, false);
  for (const chip of defender.conditions ?? []) take(chip, true);
  return found;
}

/**
 * The damage parts of the riders on one hit. A critical hit doubles the dice.
 * A rider with no type of its own takes `baseType`, the type of the hit's
 * first damage term, so it groups with that term in the readout.
 * @param {{ rider: HitRider }[]} riders
 * @param {boolean} crit
 * @param {string} baseType
 * @returns {DamagePart[]}
 */
export function hitRiderParts(riders, crit, baseType) {
  return riders.map(({ rider }) => ({
    count: crit ? rider.count * 2 : rider.count,
    sides: rider.sides,
    damageType: rider.damageType ?? baseType,
  }));
}

/**
 * The log note that names the riders of a hit, for example
 * `, Hunter's Mark +1d6`. The dice are already inside the damage detail, so
 * the note only names where they came from. An empty list reads as nothing.
 * @param {{ name: string, rider: HitRider }[]} riders
 * @param {boolean} crit
 * @returns {string}
 */
export function hitRiderNote(riders, crit) {
  return riders
    .map(
      ({ name, rider }) =>
        `, ${name} +${crit ? rider.count * 2 : rider.count}d${rider.sides}${typeText(rider)}`,
    )
    .join('');
}

/**
 * How a hit rider reads in a chip tooltip or a spell detail, for example
 * "+1d6 damage on weapon hits by the caster".
 * @param {HitRider | undefined | null} rider
 * @returns {string}
 */
export function hitRiderSummary(rider) {
  if (!rider) return '';
  const kind = rider.weaponOnly ? 'weapon hits' : 'hits';
  const who = rider.mark ? ' by the caster' : '';
  return `+${rider.count}d${rider.sides}${typeText(rider)} on ${kind}${who}`;
}

/**
 * The damage type of a rider as a word after its dice, or nothing when the
 * rider takes the type of its hit.
 * @param {HitRider} rider
 * @returns {string}
 */
function typeText(rider) {
  return rider.damageType ? ` ${rider.damageType}` : '';
}
