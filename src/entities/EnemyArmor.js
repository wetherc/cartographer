/**
 * The armor a creature wears, and what it does to the creature's AC.
 *
 * A creature's authored AC is its unarmored AC. It defaults to 10 plus the
 * DEX modifier, and a GM raises it for natural armor or a shield. Worn armor
 * replaces the 10 + DEX part with the armor's own base AC and the DEX
 * contribution its weight allows, the same rule `Armor.armorClass` applies
 * to a character: light armor adds the full modifier, medium armor adds at
 * most +2, and heavy armor adds none. The part of the authored AC above
 * 10 + DEX stays on top. A DEX 16 creature in Plate has AC 18, not the
 * 10 + 3 + 8 = 21 that a flat bonus over the unarmored AC gives.
 */

import { ARMOR_WEIGHTS } from './Equipment.js';
import { ARMOR_PRESETS } from './EquipmentPresets.js';
import { abilityModifier } from './Modifiers.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/entities.js').EnemyArmor} EnemyArmor */
/** @typedef {import('../types/entities.js').ArmorWeight} ArmorWeight */

/**
 * @param {unknown} key
 * @returns {(typeof ARMOR_WEIGHTS)[number]}
 */
function weightOf(key) {
  return ARMOR_WEIGHTS.find((w) => w.key === key) ?? ARMOR_WEIGHTS[0];
}

/**
 * A stored armor value as the current fields, or null for no armor. A
 * value with a flat `acBonus` and no `baseAC` reads as a base AC of
 * 10 + that bonus, with the weight of the preset that has its name, or
 * light when no preset matches. A base AC that is not a number reads as
 * 10, so a hand-edited value cannot turn AC into NaN.
 * @param {unknown} value
 * @returns {EnemyArmor | null}
 */
export function coerceEnemyArmor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = /** @type {Record<string, any>} */ (value);
  const name = typeof raw.name === 'string' && raw.name ? raw.name : 'Armor';
  const preset = ARMOR_PRESETS.find((p) => p.name === name);
  const legacy = raw.baseAC === undefined && raw.acBonus !== undefined;
  const baseAC = legacy ? 10 + clampInt(raw.acBonus, 0, 30, 0) : clampInt(raw.baseAC, 0, 30, 10);
  const armorWeight = weightOf(raw.armorWeight ?? preset?.armorWeight).key;
  return { name, baseAC, armorWeight: /** @type {ArmorWeight} */ (armorWeight) };
}

/**
 * How much worn armor moves AC away from the unarmored 10 + DEX. The result
 * is 0 with no armor. It can be negative, for example light armor with a
 * base AC under 10.
 * @param {EnemyArmor | null | undefined} armor
 * @param {number} dex the creature's DEX score
 * @returns {number}
 */
export function enemyArmorDelta(armor, dex) {
  if (!armor) return 0;
  const dexMod = abilityModifier(dex);
  const { dexCap } = weightOf(armor.armorWeight);
  const worn = armor.baseAC + (dexCap === 0 ? 0 : Math.min(dexMod, dexCap));
  return worn - (10 + dexMod);
}

/**
 * A picker label for an armor choice, such as "Chain Shirt (AC 13 + DEX,
 * max 2)" or "Plate (AC 18)".
 * @param {EnemyArmor} armor
 * @returns {string}
 */
export function enemyArmorLabel(armor) {
  const { dexCap } = weightOf(armor.armorWeight);
  const dex = dexCap === 0 ? '' : dexCap === Infinity ? ' + DEX' : ` + DEX, max ${dexCap}`;
  return `${armor.name} (AC ${armor.baseAC}${dex})`;
}
