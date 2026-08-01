import { isPactPool, slotLevelOf } from '../entities/SpellSlots.js';

/**
 * What the HP bar and the spell-slot pips say, apart from the elements that
 * show it. `ui/CharacterBars.js` keeps the DOM and the update loop. This
 * file holds the numbers, the low-HP threshold, and every string that a
 * screen reader gets, where a test can check them without a browser.
 */

/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/** The fill fraction at or below which a bar reads as critical. */
export const CRITICAL_RATIO = 0.25;

/**
 * The HP bar's readout for a pool. `percent` is the fill width, rounded,
 * because a fractional percentage adds nothing on a bar a few hundred
 * pixels wide. A pool with no maximum reads as empty, instead of dividing
 * by zero. This is what an older save with no HP recorded looks like.
 *
 * `critical` is only ever true for a bar set up for it, so a resource that
 * merely happens to be low does not turn red.
 * @param {ResourcePool} pool
 * @param {{ label: string, bonus?: number, critical?: boolean }} opts
 * @returns {{ percent: number, critical: boolean, text: string, ariaLabel: string }}
 */
export function barReadout(pool, opts) {
  const bonus = opts.bonus ?? 0;
  const ratio = pool.max > 0 ? pool.current / pool.max : 0;
  const bonusReadout = bonus ? `, plus ${bonus} bonus` : '';
  return {
    percent: Math.round(ratio * 100),
    critical: Boolean(opts.critical) && ratio <= CRITICAL_RATIO,
    text: `${pool.current}/${pool.max}`,
    ariaLabel: `${opts.label} ${pool.current} of ${pool.max}${bonusReadout}`,
  };
}

/**
 * An English ordinal for a small counting number. Spell-slot columns need
 * only 1st through 9th.
 * @param {number} n
 * @returns {string}
 */
export function ordinal(n) {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

/**
 * A slot pool's column heading. A warlock's pact slots say so in the
 * heading, because pact slots refresh on a short rest. Spending a pact slot
 * is a different decision from spending an ordinary slot of the same level.
 * @param {ResourcePool} pool
 * @returns {string}
 */
export function slotColumnLabel(pool) {
  return isPactPool(pool) ? `${ordinal(slotLevelOf(pool))} pact` : ordinal(slotLevelOf(pool));
}

/**
 * One pip's accessible name and tooltip. A spent pip that a player cannot
 * refill stays on the line, and keeps a name that explains why. This way
 * the cost of the cast stays visible, even after the pip stops being a
 * control.
 * @param {ResourcePool} pool
 * @param {boolean} available Whether this pip is an unspent slot.
 * @param {boolean} allowRestore Whether a click on an empty pip can put a slot back.
 * @returns {{ ariaLabel: string, title: string, disabled: boolean }}
 */
export function pipReadout(pool, available, allowRestore) {
  const noun = `level ${slotLevelOf(pool)} ${isPactPool(pool) ? 'pact slot' : 'slot'}`;
  if (available) return { ariaLabel: `Spend a ${noun}`, title: 'Click to spend', disabled: false };
  if (allowRestore) {
    return { ariaLabel: `Restore a ${noun}`, title: 'Click to restore', disabled: false };
  }
  return {
    ariaLabel: `Spent ${noun}, restored by the GM`,
    title: 'Only the GM can restore slots',
    disabled: true,
  };
}

/**
 * The whole slot line as one sentence, for the read-only view where the
 * pips are decoration, not controls.
 * @param {ResourcePool[]} pools
 * @returns {string}
 */
export function slotLineReadout(pools) {
  const parts = pools.map(
    (pool) =>
      `level ${slotLevelOf(pool)} ${isPactPool(pool) ? 'pact slot' : 'slot'}s: ` +
      `${pool.current} of ${pool.max}`,
  );
  return `Spell slots — ${parts.join(', ')}`;
}
