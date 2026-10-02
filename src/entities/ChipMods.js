import { clampInt } from '../util/num.js';
import { ABILITY_SCORES } from './Modifiers.js';
import { DAMAGE_TYPES } from './Equipment.js';

/**
 * What a condition chip changes on its holder besides a d20 roll. A buff
 * spell such as Shield or Barkskin writes these fields onto the chip it
 * leaves, and the AC readers (`Armor.armorClass` for a character,
 * `Creature.effectiveStatBlock` for a creature) fold the chips in. The HP
 * fields work through `entities/HPBuffs.js`, and `app/combatants.js` reads
 * the immunities when a chip lands. `ConditionEffects.rollMode` reads the
 * save advantage and the attack slants (see `ChipSlants.js`), and the weapon
 * swing reads the extra action. `DamageDefenses.defensesOf` reads the
 * resistances. The chip goes
 * away with its spell, so the change ends with it. Every function here is pure.
 */

/** @typedef {import('../types/entities.js').ChipMods} ChipMods */
/** @typedef {import('../types/entities.js').Condition} Condition */

/** The largest AC a chip field can name. */
const MAX_AC = 30;

/** The largest HP maximum raise a chip can name. */
export const MAX_HP_BOOST = 100;

/** The most temporary HP a chip can grant at the start of a turn. */
const MAX_TEMP_EACH_TURN = 30;

/**
 * A written list of condition names, trimmed, with blanks and repeats
 * dropped. A repeat is a name that matches an earlier one without regard to
 * case.
 * @param {unknown} value
 * @returns {string[]}
 */
function nameList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {string[]} */
  const names = [];
  for (const entry of value) {
    const name = typeof entry === 'string' ? entry.trim() : '';
    if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  return names;
}

/**
 * A written list of ability keys, uppercased, in the order of the six, with
 * anything else dropped.
 * @param {unknown} value
 * @returns {string[]}
 */
function abilityList(value) {
  if (!Array.isArray(value)) return [];
  const keys = value.map((entry) => (typeof entry === 'string' ? entry.trim().toUpperCase() : ''));
  return ABILITY_SCORES.filter((key) => keys.includes(key));
}

/**
 * A written slant, or undefined for anything but the two words.
 * @param {unknown} value
 * @returns {'advantage' | 'disadvantage' | undefined}
 */
function slantOf(value) {
  return value === 'advantage' || value === 'disadvantage' ? value : undefined;
}

/**
 * A written list of damage types, lowercased, with unknown types and
 * repeats dropped.
 * @param {unknown} value
 * @returns {string[]}
 */
function damageList(value) {
  return nameList(value)
    .map((t) => t.toLowerCase())
    .filter((t) => DAMAGE_TYPES.includes(t));
}

/**
 * A written mods block, or null when it changes nothing. A flat AC bonus can
 * be negative, for a chip that lowers AC. A base AC, a floor, an HP raise,
 * and a temporary HP grant below 1 name nothing, so they drop.
 * @param {unknown} value
 * @returns {ChipMods | null}
 */
export function normalizeChipMods(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const ac = clampInt(raw.ac, -MAX_AC, MAX_AC, 0);
  const acBase = clampInt(raw.acBase, 0, MAX_AC);
  const acMin = clampInt(raw.acMin, 0, MAX_AC);
  const maxHP = clampInt(raw.maxHP, 0, MAX_HP_BOOST);
  const immune = nameList(raw.immune);
  const tempHPEachTurn = clampInt(raw.tempHPEachTurn, 0, MAX_TEMP_EACH_TURN);
  const saveAdvantage = abilityList(raw.saveAdvantage);
  const blocks = nameList(raw.blocks).map((id) => id.toLowerCase());
  const attacks = slantOf(raw.attacks);
  const attacksAgainst = slantOf(raw.attacksAgainst);
  const attackerTypes = nameList(raw.attackerTypes).map((t) => t.toLowerCase());
  const resist = damageList(raw.resist);
  const mods = {
    ...(ac !== 0 ? { ac } : {}),
    ...(acBase > 0 ? { acBase } : {}),
    ...(acMin > 0 ? { acMin } : {}),
    ...(maxHP > 0 ? { maxHP } : {}),
    ...(immune.length > 0 ? { immune } : {}),
    ...(tempHPEachTurn > 0 ? { tempHPEachTurn } : {}),
    ...(saveAdvantage.length > 0 ? { saveAdvantage } : {}),
    ...(raw.extraAction === true ? { extraAction: true } : {}),
    ...(blocks.length > 0 ? { blocks } : {}),
    ...(raw.noHealing === true ? { noHealing: true } : {}),
    ...(raw.disadvantageVsSource === true ? { disadvantageVsSource: true } : {}),
    ...(attacks ? { attacks } : {}),
    ...(attacksAgainst ? { attacksAgainst } : {}),
    ...(attacksAgainst && attackerTypes.length > 0 ? { attackerTypes } : {}),
    ...((attacks || attacksAgainst) && raw.once === true ? { once: true } : {}),
    ...(resist.length > 0 ? { resist } : {}),
    ...(raw.resistNonmagical === true ? { resistNonmagical: true } : {}),
  };
  return Object.keys(mods).length > 0 ? mods : null;
}

/**
 * The HP maximum raise of a holder's chips. Two casts of one spell do not
 * stack, so the highest raise of each spell counts, keyed by the spell id
 * (or the chip name for a hand-written chip). Raises from different spells
 * add up.
 * @param {Condition[] | undefined} conditions
 * @returns {number}
 */
export function heldBoost(conditions) {
  /** @type {Map<string, number>} */
  const best = new Map();
  for (const chip of conditions ?? []) {
    const key = chip.source?.spellId ?? chip.name.toLowerCase();
    best.set(key, Math.max(best.get(key) ?? 0, chip.mods?.maxHP ?? 0));
  }
  let boost = 0;
  for (const raise of best.values()) boost += raise;
  return boost;
}

/**
 * The chip on a holder that makes it immune to a condition, or undefined.
 * The match ignores case.
 * @param {Condition[] | undefined} conditions
 * @param {string} name
 * @returns {Condition | undefined}
 */
export function immunityTo(conditions, name) {
  const key = name.trim().toLowerCase();
  return (conditions ?? []).find((chip) =>
    (chip.mods?.immune ?? []).some((n) => n.toLowerCase() === key),
  );
}

/**
 * Whether a chip on a holder gives it an extra action (Haste).
 * @param {Condition[] | undefined} conditions
 * @returns {boolean}
 */
export function hasExtraAction(conditions) {
  return (conditions ?? []).some((chip) => chip.mods?.extraAction);
}

/**
 * The mods of every chip on a holder, combined. The flat bonuses add up,
 * because Shield and Shield of Faith stack. A base AC and a floor do not
 * stack, so the highest of each wins. A holder with no such chip reads as
 * all zeros.
 * @param {Condition[] | undefined} conditions
 * @returns {{ ac: number, acBase: number, acMin: number }}
 */
export function heldMods(conditions) {
  const total = { ac: 0, acBase: 0, acMin: 0 };
  for (const chip of conditions ?? []) {
    const mods = chip.mods;
    if (!mods) continue;
    total.ac += mods.ac ?? 0;
    total.acBase = Math.max(total.acBase, mods.acBase ?? 0);
    total.acMin = Math.max(total.acMin, mods.acMin ?? 0);
  }
  return total;
}

/**
 * An AC with the flat chip bonuses added and the floor applied. The floor
 * comes last, so Barkskin's 16 is a minimum for the finished AC. Shield of
 * Faith on a holder with AC 12 gives 14, which the floor raises to 16, and
 * not 18.
 * @param {number} ac the AC before any chip
 * @param {{ ac: number, acMin: number }} mods from `heldMods`
 * @returns {number}
 */
export function withChipAC(ac, mods) {
  return Math.max(ac + mods.ac, mods.acMin);
}

/**
 * How a mods block reads on a chip tooltip and in the spell detail, for
 * example "+5 AC" or "AC at least 16". A block that changes nothing reads as
 * an empty string.
 * @param {ChipMods | undefined} mods
 * @returns {string}
 */
export function modsSummary(mods) {
  if (!mods) return '';
  const parts = [];
  if (mods.ac) parts.push(`${mods.ac > 0 ? '+' : ''}${mods.ac} AC`);
  if (mods.acBase) parts.push(`base AC ${mods.acBase} + DEX without armor`);
  if (mods.acMin) parts.push(`AC at least ${mods.acMin}`);
  if (mods.maxHP) parts.push(`+${mods.maxHP} max HP`);
  if (mods.immune) parts.push(`immune to ${mods.immune.join(' and ')}`);
  if (mods.tempHPEachTurn) parts.push(`${mods.tempHPEachTurn} temp HP each turn`);
  if (mods.saveAdvantage) parts.push(`advantage on ${mods.saveAdvantage.join(' and ')} saves`);
  if (mods.extraAction) parts.push('an extra action for one weapon attack');
  if (mods.blocks)
    parts.push(`blocks ${mods.blocks.map((id) => id.replace(/-/g, ' ')).join(' and ')}`);
  const next = mods.once ? ' next' : '';
  const plural = mods.once ? '' : 's';
  if (mods.attacks) parts.push(`${mods.attacks} on its${next} attack roll${plural}`);
  if (mods.attacksAgainst) {
    const from = mods.attackerTypes ? ` by ${mods.attackerTypes.join(', ')}` : '';
    parts.push(`${mods.attacksAgainst} on the${next} attack${plural} against it${from}`);
  }
  if (mods.resist) parts.push(`resists ${mods.resist.join(', ')}`);
  if (mods.resistNonmagical) parts.push('resists nonmagical bludgeoning, piercing, slashing');
  return parts.join(', ');
}

/**
 * The chip on a holder that stops a spell outright, or undefined. Shield
 * names Magic Missile, so the darts of a Magic Missile skip a holder of
 * Shield even though they hit without an attack roll.
 * @param {Condition[] | undefined} conditions
 * @param {string} spellId
 * @returns {Condition | undefined}
 */
export function blockerOf(conditions, spellId) {
  return (conditions ?? []).find((chip) => chip.mods?.blocks?.includes(spellId));
}
