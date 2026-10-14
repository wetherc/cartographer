/**
 * The words of the banner that shows once one side of a fight is down.
 * Pure over the combat view and the viewer.
 */

import { fightOutcome } from './CombatView.js';
import { deathSaveStatus } from '../view/DeathSaveView.js';

/**
 * The outcome and the banner text, or null while both sides still stand.
 * A victory with a party member still dying names that member, because the
 * fight is not safe for them until they stabilize or heal. The GM also gets
 * a reminder that the fight stays open until they end it.
 * @param {import('./CombatView.js').CombatView} view
 * @param {boolean} gm
 * @returns {{ outcome: 'victory' | 'defeat', text: string } | null}
 */
export function fightNotice(view, gm) {
  const outcome = fightOutcome(view);
  if (!outcome) return null;
  if (outcome === 'defeat') {
    return {
      outcome,
      text: withTail('The party is defeated.', 'End combat when you are ready.', gm),
    };
  }
  const dying = view.rows
    .filter((row) => row.side === 'party' && deathSaveStatus(row.deathSaves) === 'dying')
    .map((row) => row.name ?? 'A party member');
  const line =
    dying.length === 0
      ? 'The party is victorious.'
      : `All foes are down. ${joinNames(dying)} ${dying.length === 1 ? 'is' : 'are'} dying.`;
  return { outcome, text: withTail(line, 'End combat when the party is done here.', gm) };
}

/**
 * @param {string} line
 * @param {string} tail
 * @param {boolean} gm
 */
function withTail(line, tail, gm) {
  return gm ? `${line} ${tail}` : line;
}

/**
 * "A", "A and B", or "A, B and C".
 * @param {string[]} names
 */
function joinNames(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
