/**
 * The text of the initiative badge on the character sheet. Pure.
 */

import { d20Penalty } from '../entities/Exhaustion.js';
import { abilityModifier, formatModifier } from '../entities/Modifiers.js';
import { effectiveStat } from '../entities/Stats.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The badge label and its tooltip. The bonus is the DEX modifier of the
 * effective score plus the exhaustion penalty, the same terms that
 * `rollInitiative` uses, so the badge matches the roll in combat setup.
 * @param {Character} character
 * @returns {{ label: string, note: string }}
 */
export function initiativeReadout(character) {
  const dex = abilityModifier(effectiveStat(character, 'DEX').total);
  const tired = d20Penalty(character);
  return {
    label: `Init ${formatModifier(dex + tired)}`,
    note: tired
      ? `Initiative bonus: DEX modifier ${formatModifier(dex)}, exhaustion ${tired}`
      : 'Initiative bonus (DEX modifier)',
  };
}
