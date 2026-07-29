import { isPactPool, slotLevelOf } from '../entities/SpellSlots.js';
import { el } from './dom.js';

/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * Build a stat bar (HP) shown on the card's head, one full-width line per pool:
 * a visible label, the fill track, and the numbers. Absence of the pool (older
 * saves) renders no bar rather than a fake full one.
 *
 * The returned `update` rewrites the fill, the numbers, and the label for a new
 * value of the same pool, so ticking HP touches four properties instead of
 * rebuilding the line.
 * @param {ResourcePool} pool
 * @param {{ modifier: string, label: string, critical?: boolean, bonus?: number,
 *   flank?: { before: HTMLElement, after: HTMLElement } }} opts
 *   `modifier` selects the fill colour; `critical` arms the low-fill red
 *   state; `bonus` appends a "+N" readout for temporary points on top of the
 *   pool (bonus HP); `flank` places a control on either side of the track
 *   (damage/heal steppers), keeping the numeric readout after them.
 * @returns {{ element: HTMLElement, update: (pool: ResourcePool, bonus: number) => void }}
 */
export function buildStatBar(pool, opts) {
  const fill = el('span', `stat-bar__fill stat-bar__fill--${opts.modifier}`);
  const text = el('span', 'stat-bar__text u-muted');
  const wrap = el(
    'span',
    'stat-bar u-row u-g2',
    el('span', 'stat-bar__label u-muted', opts.label),
    opts.flank?.before,
    el('span', 'stat-bar__track', fill),
    opts.flank?.after,
    text,
  );
  if (!opts.flank) wrap.setAttribute('role', 'img');

  // The bonus readout only exists while there is a bonus, so it is created and
  // removed by `update` rather than hidden.
  /** @type {HTMLElement | null} */
  let bonusEl = null;

  /** @param {ResourcePool} next @param {number} bonus */
  function update(next, bonus) {
    const ratio = next.max > 0 ? next.current / next.max : 0;
    fill.style.width = `${Math.round(ratio * 100)}%`;
    fill.classList.toggle('stat-bar__fill--critical', Boolean(opts.critical) && ratio <= 0.25);
    text.textContent = `${next.current}/${next.max}`;
    const bonusReadout = bonus ? `, plus ${bonus} bonus` : '';
    wrap.setAttribute('aria-label', `${opts.label} ${next.current} of ${next.max}${bonusReadout}`);
    if (bonus && !bonusEl) {
      bonusEl = el('span', 'stat-bar__bonus');
      bonusEl.title = 'Bonus HP';
      wrap.appendChild(bonusEl);
    } else if (!bonus && bonusEl) {
      bonusEl.remove();
      bonusEl = null;
    }
    if (bonusEl) bonusEl.textContent = `+${bonus}`;
  }

  update(pool, opts.bonus ?? 0);
  return { element: wrap, update };
}

/**
 * Compact spell-slot readout: a column per spell level, the ordinal centered
 * above a two-wide grid of pips, filled pips being the slots still unspent.
 * Columns wrap under the pip area (not the label) when a high-level caster
 * outgrows the card width. With `onToggle` each pip is a button: clicking a
 * filled pip spends a slot of that level, clicking an empty one restores one
 * (slots drain and refill left to right, so it reads as toggling that pip).
 * Without it (a spectator's view) the line is a plain readout.
 * A non-caster (no slot pools) renders nothing.
 *
 * `update` takes the same pools with new `current` values and re-points the
 * pips. It assumes the maxima are unchanged, since the pip count comes from
 * them; a caster who gains a slot gets a rebuilt line instead.
 * @param {ResourcePool[]} pools
 * @param {((pool: ResourcePool, spent: boolean) => void) | null} onToggle
 * @returns {{ element: HTMLElement, update: (pools: ResourcePool[]) => void }}
 */
export function buildSlotLine(pools, onToggle) {
  /** @param {ResourcePool} p */
  const slotNoun = (p) => (isPactPool(p) ? 'pact slot' : 'slot');

  /** @param {number} n */
  const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
  const groups = el('span', 'slot-line__groups');
  const wrap = el(
    'span',
    'stat-bar slot-line u-row u-g2',
    el('span', 'stat-bar__label u-muted', 'Slots'),
    groups,
  );
  // One pip element per slot, in pool order, so `update` can walk pools and
  // pips together without reading the DOM's shape back.
  /** @type {HTMLElement[][]} */
  const pipsByPool = [];
  for (const pool of pools) {
    const level = isPactPool(pool)
      ? `${ordinal(slotLevelOf(pool))} pact`
      : ordinal(slotLevelOf(pool));
    const pips = el('span', 'slot-line__pips');
    /** @type {HTMLElement[]} */
    const row = [];
    for (let i = 0; i < pool.max; i += 1) {
      /** @type {HTMLElement} */
      let pip;
      if (onToggle) {
        pip = el('button', 'slot-line__pip');
        pip.setAttribute('type', 'button');
        // The pool this pip belongs to is read at click time, so a spend acts
        // on the live counts rather than the ones present when it was built.
        const index = pipsByPool.length;
        pip.addEventListener('click', () => {
          const live = livePools[index];
          onToggle(live, i < live.current);
        });
      } else {
        pip = el('span');
      }
      pips.appendChild(pip);
      row.push(pip);
    }
    pipsByPool.push(row);
    groups.appendChild(el('span', 'slot-line__group', el('span', 'u-muted', level), pips));
  }

  /** @type {ResourcePool[]} */
  let livePools = pools;

  /** @param {ResourcePool[]} next */
  function update(next) {
    livePools = next;
    next.forEach((pool, poolIndex) => {
      pipsByPool[poolIndex]?.forEach((pip, i) => {
        const available = i < pool.current;
        pip.textContent = available ? '●' : '○';
        if (!onToggle) return;
        pip.setAttribute(
          'aria-label',
          available
            ? `Spend a level ${slotLevelOf(pool)} ${slotNoun(pool)}`
            : `Restore a level ${slotLevelOf(pool)} ${slotNoun(pool)}`,
        );
        pip.title = available ? 'Click to spend' : 'Click to restore';
      });
    });
    if (onToggle) return;
    const readout = next
      .map((p) => `level ${slotLevelOf(p)} ${slotNoun(p)}s: ${p.current} of ${p.max}`)
      .join(', ');
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `Spell slots — ${readout}`);
  }

  update(pools);
  return { element: wrap, update };
}
