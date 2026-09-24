import { buildCombatView, fightOutcome } from './CombatView.js';
import { crXP } from '../data/challenge.js';
import { isDead } from '../entities/DeathSaves.js';

/** @typedef {import('./CombatView.js').ResolvedCombatant} ResolvedCombatant */
/** @typedef {import('../types/combat.js').CombatState} CombatState */

/**
 * @typedef {{
 *   outcome: 'victory' | 'defeat' | null,
 *   standing: number,
 *   xp: number,
 *   earners: string[],
 *   share: number,
 * }} FightEnd
 */

/**
 * What the End combat control needs to know about a fight: its outcome, how
 * many hostile creatures still stand, and the experience points that the
 * defeated ones are worth. The points go to the characters in the order who
 * are still alive, a dying one included, split evenly and rounded down. A
 * foe with no challenge rating is worth nothing.
 * @param {CombatState} combat
 * @param {(id: string) => ResolvedCombatant | null} resolve
 * @returns {FightEnd}
 */
export function fightEnd(combat, resolve) {
  const view = buildCombatView(combat, resolve, { gm: true });
  const foes = view.rows.filter((row) => row.side === 'foe' && row.counted);
  let xp = 0;
  for (const row of foes) {
    const found = resolve(row.id);
    if (row.defeated && found?.kind === 'creature') xp += crXP(found.entity.cr ?? -1);
  }
  const earners = view.rows.flatMap((row) => {
    const found = resolve(row.id);
    return found?.kind === 'character' && !isDead(found.entity) ? [row.id] : [];
  });
  return {
    outcome: fightOutcome(view),
    standing: foes.filter((row) => !row.defeated).length,
    xp,
    earners,
    share: earners.length > 0 ? Math.floor(xp / earners.length) : 0,
  };
}
