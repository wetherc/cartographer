/**
 * The parts of a dice tray result, for a GM to read at a glance. The total
 * shows large, the dice and the modifier show small beside it, and a roll
 * with a target ends in a short verdict.
 */

import { formatModifier, signedTerm } from '../entities/Modifiers.js';

/**
 * Split a roll into its readout parts. `detail` lists each die group with its
 * rolls in parentheses, then a signed modifier, for example "2d6 (4, 4) + 3".
 * A roll at advantage or disadvantage adds the mode and the dropped d20, for
 * example "d20 (17) + 2, advantage, dropped 5".
 *
 * `passed` says whether the total meets the target, or is null with no
 * target. An attack roll (`attack` set) follows the attack rules instead: a
 * kept d20 at or above `critOn` always hits, and a natural 1 always misses.
 * Its verdict reads "hit" or "miss", the words the combat log uses, where
 * any other roll reads "success" or "fail".
 * @param {import('../types/dice.js').DiceResult} result
 * @param {number | null} target
 * @param {{ critOn?: number } | null} [attack]
 * @returns {{ total: number, detail: string, verdict: string | null, passed: boolean | null }}
 */
export function resultSummary(result, target, attack = null) {
  const parts = result.results.map((r) => {
    const count = r.rolls.length > 1 ? r.rolls.length : '';
    return `${count}${r.die} (${r.rolls.join(', ')})`;
  });
  let detail = parts.join(' + ');
  if (result.modifier !== 0) {
    const term = detail === '' ? formatModifier(result.modifier) : signedTerm(result.modifier);
    detail = detail === '' ? term : `${detail} ${term}`;
  }
  const dropped = result.results.flatMap((r) => r.dropped ?? []);
  if (dropped.length > 0) detail += `, ${result.selection.mode}, dropped ${dropped.join(', ')}`;
  const passed = target === null ? null : meets(result, target, attack);
  const words = attack ? ['hit', 'miss'] : ['success', 'fail'];
  const verdict = target === null ? null : `vs ${target}: ${passed ? words[0] : words[1]}`;
  return { total: result.total, detail, verdict, passed };
}

/**
 * Whether a roll meets its target. An attack's kept d20 can settle it
 * before the total does.
 * @param {import('../types/dice.js').DiceResult} result
 * @param {number} target
 * @param {{ critOn?: number } | null} attack
 * @returns {boolean}
 */
function meets(result, target, attack) {
  const natural = result.results.find((r) => r.die === 'd20')?.rolls[0];
  if (attack && natural !== undefined) {
    if (natural >= (attack.critOn ?? 20)) return true;
    if (natural === 1) return false;
  }
  return result.total >= target;
}
