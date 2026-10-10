/**
 * Damage resistance, vulnerability, and immunity. A creature keeps its own
 * three lists in `defenses`. A party character resists what its race resists,
 * from the race snapshot in `raceTraits`. Every function is pure.
 *
 * The rules follow 5e. Immunity takes a damage type to 0, resistance halves
 * it, and vulnerability doubles it, each rounded down. The halving of a
 * successful save comes first, and the defenses apply after it. Each damage
 * type in a hit is adjusted on its own, so a creature that resists fire still
 * takes the full cold half of a spell that deals both.
 */

import { DAMAGE_TYPES } from './DamageParts.js';
import { hasCondition } from './Conditions.js';

/** @typedef {import('../types/creature.js').DamageDefenses} DamageDefenses */
/** @typedef {import('../dice/DiceRoller.js').DamageGroup} DamageGroup */

/** The three lists, in the order the form and the readouts show them. */
const KEYS = /** @type {const} */ (['resist', 'vulnerable', 'immune']);

/**
 * Clean a stored or imported defenses record. Each list keeps only known
 * damage types, lowercase and without repeats.
 * @param {unknown} value
 * @returns {DamageDefenses}
 */
export function normalizeDefenses(value) {
  const source = /** @type {Record<string, unknown>} */ (
    value && typeof value === 'object' ? value : {}
  );
  /** @param {unknown} raw */
  const list = (raw) =>
    Array.isArray(raw)
      ? [...new Set(raw.map((t) => String(t).trim().toLowerCase()))].filter((t) =>
          DAMAGE_TYPES.includes(t),
        )
      : [];
  return {
    resist: list(source.resist),
    vulnerable: list(source.vulnerable),
    immune: list(source.immune),
  };
}

/**
 * The defenses field to spread into a creature or a template, or nothing at
 * all. A creature with no defenses carries no field, so the common case
 * stores nothing.
 * @param {unknown} value
 * @returns {{ defenses?: DamageDefenses }}
 */
export function defenseFields(value) {
  const defenses = normalizeDefenses(value);
  return KEYS.some((key) => defenses[key].length > 0) ? { defenses } : {};
}

/** The damage types that a `resistNonmagical` chip resists. */
const WEAPON_TYPES = ['bludgeoning', 'piercing', 'slashing'];

/**
 * The defenses a combatant fights with: a creature's own lists, or the
 * resistances of a character's race, and the resistances of its chips
 * (Protection from Energy). A chip with `resistNonmagical` (Stoneskin) adds
 * bludgeoning, piercing, and slashing only when `nonmagical` says the hit
 * comes from a nonmagical weapon, because a spell or a magic weapon gets
 * through it. A Petrified combatant resists every damage type and is immune
 * to poison, as the 5e condition says.
 * @param {{
 *   defenses?: DamageDefenses,
 *   raceTraits?: { resistances?: string[] },
 *   conditions?: { name?: string, mods?: import('../types/entities.js').ChipMods }[],
 * }} entity
 * @param {{ nonmagical?: boolean }} [options]
 * @returns {DamageDefenses}
 */
export function defensesOf(entity, { nonmagical = false } = {}) {
  const own = normalizeDefenses(entity.defenses);
  const race = entity.raceTraits?.resistances ?? [];
  const chips = (entity.conditions ?? []).flatMap((c) => [
    ...(c.mods?.resist ?? []),
    ...(nonmagical && c.mods?.resistNonmagical ? WEAPON_TYPES : []),
  ]);
  const stone = hasCondition(entity.conditions, 'Petrified');
  const resist = [...own.resist, ...race, ...chips, ...(stone ? DAMAGE_TYPES : [])];
  const immune = stone ? [...new Set([...own.immune, 'poison'])] : own.immune;
  return {
    ...own,
    resist: [...new Set(resist)].filter((t) => !stone || t !== 'poison'),
    immune,
  };
}

/**
 * The damage a target takes from one hit, after a save's halving and its
 * defenses. `notes` names each defense that changed a type, for the log.
 *
 * A save halves the damage of the whole effect, so the halving keeps its
 * fraction until the end. The types that no defense touches add up first and
 * round down once, the same as a hit on a target with no defenses at all. A
 * type that a defense touches takes its half, then resistance or
 * vulnerability, and rounds down once on its own. On a save, 7 bludgeoning
 * and 13 cold give 10 with no defenses, 6 with cold resistance (3.5 and
 * 3.25), and 16 with cold vulnerability (3.5 and 13).
 * @param {DamageGroup[]} groups the hit's damage, one group per type
 * @param {DamageDefenses} defenses
 * @param {{ halve?: boolean }} [options] `halve` is a successful save against
 *   a spell that deals half damage on a success
 * @returns {{ total: number, notes: string[] }}
 */
export function applyDefenses(groups, defenses, { halve = false } = {}) {
  const share = halve ? 0.5 : 1;
  /** @type {string[]} */
  const notes = [];
  let plain = 0;
  let total = 0;
  for (const g of groups) {
    const type = g.damageType;
    if (!KEYS.some((key) => defenses[key].includes(type))) {
      plain += g.subtotal * share;
      continue;
    }
    if (defenses.immune.includes(type)) {
      notes.push(`immune to ${type}`);
      continue;
    }
    let taken = g.subtotal * share;
    if (defenses.resist.includes(type)) {
      taken /= 2;
      notes.push(`resists ${type}`);
    }
    if (defenses.vulnerable.includes(type)) {
      taken *= 2;
      notes.push(`vulnerable to ${type}`);
    }
    total += Math.floor(taken);
  }
  return { total: total + Math.floor(plain), notes };
}

/**
 * A short readout of a creature's defenses, for a stat block, or an empty
 * string when it has none. For example "Resists fire, cold. Immune to poison."
 * @param {DamageDefenses | undefined} value
 * @returns {string}
 */
export function defensesSummary(value) {
  const defenses = normalizeDefenses(value);
  const labels = { resist: 'Resists', vulnerable: 'Vulnerable to', immune: 'Immune to' };
  return KEYS.filter((key) => defenses[key].length > 0)
    .map((key) => `${labels[key]} ${defenses[key].join(', ')}.`)
    .join(' ');
}

/**
 * The log note for a hit that defenses changed, for example
 * " (resists fire, takes 4)", or an empty string when none did. A spell of
 * several rays passes every ray's notes, and each defense is named once.
 * @param {string[]} notes
 * @param {number} total the damage taken after the defenses
 * @returns {string}
 */
export function defenseNote(notes, total) {
  return notes.length > 0 ? ` (${[...new Set(notes)].join(', ')}, takes ${total})` : '';
}
