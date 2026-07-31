import { isPactPool, slotLevelOf } from '../entities/SpellSlots.js';

/**
 * What the HP bar and the spell-slot pips say, apart from the elements that say
 * it. `ui/CharacterBars.js` keeps the DOM and the update loop; the numbers, the
 * low-HP threshold, and every string a screen reader gets are here, where they
 * can be checked without a browser.
 */

/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/** The fill fraction at or below which a bar reads as critical. */
export const CRITICAL_RATIO = 0.25;

/**
 * The HP bar's readout for a pool. `percent` is the fill width, rounded because
 * a fractional percentage buys nothing on a bar a few hundred pixels wide. A
 * pool with no maximum reads as empty rather than dividing by zero, which is
 * what an older save with no HP recorded looks like.
 *
 * `critical` is only ever true for a bar armed for it, so a resource that merely
 * happens to be low does not turn red.
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
 * An English ordinal for a small counting number, which is all the spell-slot
 * columns need: 1st through 9th.
 * @param {number} n
 * @returns {string}
 */
export function ordinal(n) {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

/**
 * A slot pool's column heading. A warlock's pact slots say so, because they
 * refresh on a short rest and spending one is a different decision from spending
 * an ordinary slot of the same level.
 * @param {ResourcePool} pool
 * @returns {string}
 */
export function slotColumnLabel(pool) {
  return isPactPool(pool) ? `${ordinal(slotLevelOf(pool))} pact` : ordinal(slotLevelOf(pool));
}

/**
 * One pip's accessible name and tooltip. A spent pip a player may not refill
 * stays on the line and keeps a name saying why, so the cost of the cast is
 * still visible after it stops being a control.
 * @param {ResourcePool} pool
 * @param {boolean} available whether this pip is an unspent slot
 * @param {boolean} allowRestore whether clicking an empty pip may put a slot back
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
 * The whole slot line as one sentence, for the read-only view where the pips are
 * decoration rather than controls.
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
