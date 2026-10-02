/**
 * The parts of a dice tray result, for a GM to read at a glance. The total
 * shows large, the dice and the modifier show small beside it, and a roll
 * with a target ends in a short verdict.
 */

/**
 * Split a roll into its readout parts. `detail` lists each die group with its
 * rolls in parentheses, then a signed modifier, for example "2d6 (4, 4) + 3".
 * A roll at advantage or disadvantage adds the mode and the dropped d20, for
 * example "d20 (17) + 2, advantage, dropped 5".
 * @param {import('../types/dice.js').DiceResult} result
 * @param {number | null} target
 * @returns {{ total: number, detail: string, verdict: string | null }}
 */
export function resultSummary(result, target) {
  const parts = result.results.map((r) => {
    const count = r.rolls.length > 1 ? r.rolls.length : '';
    return `${count}${r.die} (${r.rolls.join(', ')})`;
  });
  let detail = parts.join(' + ');
  if (result.modifier !== 0) {
    const sign = result.modifier > 0 ? '+' : '-';
    const amount = Math.abs(result.modifier);
    detail = detail === '' ? `${sign}${amount}` : `${detail} ${sign} ${amount}`;
  }
  const dropped = result.results.flatMap((r) => r.dropped ?? []);
  if (dropped.length > 0) detail += `, ${result.selection.mode}, dropped ${dropped.join(', ')}`;
  const verdict =
    target === null ? null : `vs ${target}: ${result.total >= target ? 'success' : 'fail'}`;
  return { total: result.total, detail, verdict };
}
