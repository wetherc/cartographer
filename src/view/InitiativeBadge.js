/**
 * The text of the initiative badge on the character sheet. Pure.
 */

import { initiativeBonus } from '../entities/Checks.js';
import { effectiveStats } from '../entities/Equipment.js';
import { d20Penalty } from '../entities/Exhaustion.js';
import { abilityModifier, formatModifier } from '../entities/Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The badge label and its tooltip. The bonus is `Checks.initiativeBonus`
 * plus the exhaustion penalty, the same terms that `rollInitiative` uses, so
 * the badge matches the roll in combat setup. The tooltip names the DEX
 * modifier, the class features and feats on top of it, and exhaustion.
 * @param {Character} character
 * @returns {{ label: string, note: string }}
 */
export function initiativeReadout(character) {
  const bonus = initiativeBonus(character);
  const dex = abilityModifier(effectiveStats(character).DEX ?? 10);
  const tired = d20Penalty(character);
  const extra = bonus - dex;
  const terms = [
    `DEX modifier ${formatModifier(dex)}`,
    ...(extra ? [`features and feats ${formatModifier(extra)}`] : []),
    ...(tired ? [`exhaustion ${tired}`] : []),
  ];
  return {
    label: `Init ${formatModifier(bonus + tired)}`,
    note:
      terms.length > 1
        ? `Initiative bonus: ${terms.join(', ')}`
        : 'Initiative bonus (DEX modifier)',
  };
}
