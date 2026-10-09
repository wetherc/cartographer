/**
 * The text of the initiative badge on the character sheet. Pure.
 */

import { initiativeBonus } from '../entities/Checks.js';
import { effectiveStats } from '../entities/Equipment.js';
import { exhaustionLevel } from '../entities/Exhaustion.js';
import { abilityModifier, formatModifier } from '../entities/Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The badge label and its tooltip. The bonus is `Checks.initiativeBonus`, the
 * same value that `rollInitiative` uses, so the badge matches the roll in
 * combat setup. The tooltip names the DEX modifier, the class features and
 * feats on top of it, and the disadvantage of exhaustion.
 * @param {Character} character
 * @returns {{ label: string, note: string }}
 */
export function initiativeReadout(character) {
  const bonus = initiativeBonus(character);
  const dex = abilityModifier(effectiveStats(character).DEX ?? 10);
  const tired = exhaustionLevel(character);
  const extra = bonus - dex;
  const terms = [
    `DEX modifier ${formatModifier(dex)}`,
    ...(extra ? [`features and feats ${formatModifier(extra)}`] : []),
  ];
  const base =
    terms.length > 1 ? `Initiative bonus: ${terms.join(', ')}` : 'Initiative bonus (DEX modifier)';
  return {
    label: `Init ${formatModifier(bonus)}`,
    note: tired ? `${base}. Exhaustion ${tired}: disadvantage` : base,
  };
}
