/**
 * The rules for wearing armor: what the worn pieces do to AC, to Stealth,
 * and to a character who is not trained for them. These functions read the
 * character's classes and proficiency lists, which the item-schema readers
 * in `Equipment.js` never do, so they live apart from them. `Equipment.js`
 * keeps the slots, the equip rules, and the per-item field readers.
 */

import { abilityModifier } from './Modifiers.js';
import { isProficientArmor } from './Proficiencies.js';
import { unarmoredDefenses } from './Classes.js';
import {
  ARMOR_WEIGHTS,
  armorTraits,
  effectiveStats,
  equippedIndex,
  itemACBonus,
  itemType,
} from './Equipment.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * A character's armor class, in 5e style. Equipped body armor replaces the
 * unarmored baseline with its own base AC plus a DEX contribution set by its
 * weight class. Light armor adds the full DEX modifier. Medium armor caps
 * the DEX modifier at +2. Heavy armor ignores DEX. Unarmored AC is the base
 * AC, which is 10 by default or higher from an effect like Mage Armor, plus
 * the full DEX modifier. A Barbarian or a Monk with an empty chest slot also
 * gets the unarmored defense formula of its class, and takes whichever result
 * is higher. A shield adds its own bonus, which is +2 unless the item says
 * otherwise. Every other equipped item adds its own flat acBonus. DEX here
 * includes equipped stat buffs.
 * @param {Character} character
 * @returns {number}
 */
export function armorClass(character) {
  const stats = effectiveStats(character);
  const dexMod = abilityModifier(stats.DEX ?? 10);
  const worn = equippedIndex(character);
  const body = worn.get('chest');
  let ac;
  if (body && body.baseAC !== undefined) {
    const weight =
      ARMOR_WEIGHTS.find((w) => w.key === (body.armorWeight ?? 'light')) ?? ARMOR_WEIGHTS[0];
    // Heavy armor ignores DEX completely, so a negative modifier does not
    // hurt. Otherwise the modifier applies up to the weight's cap.
    ac = body.baseAC + (weight.dexCap === 0 ? 0 : Math.min(dexMod, weight.dexCap));
  } else {
    const base = character.baseAC ?? 10;
    ac = base + dexMod;
    // The formula runs only with the chest slot empty. A chest item with no
    // base AC lands in this branch too, and something is worn in that case,
    // so the class feature does not apply.
    //
    // A base AC below 10 is a GM-applied debuff. The formula would erase it,
    // because it starts from a literal 10, so a debuffed character keeps the
    // ordinary result instead.
    if (!body && base >= 10) {
      const off = worn.get('offHand');
      const shielded = !!off && itemType(off) === 'shield';
      for (const grant of unarmoredDefenses(character)) {
        if (shielded && !grant.shield) continue;
        ac = Math.max(ac, 10 + dexMod + abilityModifier(stats[grant.ability] ?? 10));
      }
    }
  }
  for (const item of worn.values()) {
    if (item === body) continue;
    ac += itemACBonus(item);
  }
  return ac;
}

/**
 * The worn pieces the character is not proficient with, as short phrases for
 * a message, for example `['medium armor', 'shield']`. Body armor checks its
 * weight class and a worn shield checks the shield grant. An empty list means
 * the character wears nothing beyond its training. A character without
 * proficiency lists predates them, so it reads as proficient with everything,
 * the same as the weapon gate.
 *
 * Two slots are enough to cover every piece. `armorClass` reads body armor
 * from the chest slot, and `EQUIPMENT_SLOTS` lets a shield into the off hand
 * alone, so no other slot can hold something this gate would name.
 * @param {Character} character
 * @returns {string[]}
 */
export function unproficientWear(character) {
  if (!character.proficiencies) return [];
  const worn = equippedIndex(character);
  const phrases = [];
  const body = worn.get('chest');
  if (body && body.baseAC !== undefined) {
    const weight = body.armorWeight ?? 'light';
    if (!isProficientArmor(character, weight)) phrases.push(`${weight} armor`);
  }
  const off = worn.get('offHand');
  if (off && itemType(off) === 'shield' && !isProficientArmor(character, 'shield')) {
    phrases.push('a shield');
  }
  return phrases;
}

/**
 * The name of the worn body armor when it slants Stealth, else null. Noisy
 * armor gives the wearer disadvantage on every Stealth check, whether or not
 * the character is trained for the armor.
 * @param {Character} character
 * @returns {string | null}
 */
export function stealthPenalty(character) {
  const body = equippedIndex(character).get('chest');
  return armorTraits(body).stealthDisadvantage ? (body?.name ?? 'armor') : null;
}
