import { el } from './dom.js';
import { barReadout, pipReadout, slotColumnLabel, slotLineReadout } from '../view/StatBars.js';

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
    const readout = barReadout(next, { label: opts.label, bonus, critical: opts.critical });
    fill.style.width = `${readout.percent}%`;
    fill.classList.toggle('stat-bar__fill--critical', readout.critical);
    text.textContent = readout.text;
    wrap.setAttribute('aria-label', readout.ariaLabel);
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
 * `allowRestore` false keeps the spend half and disables the empty pips, which
 * is a player's view of their own slots: they may cast, but getting a slot back
 * is the GM's to grant.
 * A non-caster (no slot pools) renders nothing.
 *
 * `update` takes the same pools with new `current` values and re-points the
 * pips. It assumes the maxima are unchanged, since the pip count comes from
 * them; a caster who gains a slot gets a rebuilt line instead.
 * @param {ResourcePool[]} pools
 * @param {((pool: ResourcePool, spent: boolean) => void) | null} onToggle
 * @param {boolean} [allowRestore] whether clicking an empty pip may put a slot back
 * @returns {{ element: HTMLElement, update: (pools: ResourcePool[]) => void }}
 */
export function buildSlotLine(pools, onToggle, allowRestore = true) {
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
    const level = slotColumnLabel(pool);
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
          const spent = i < live.current;
          if (!spent && !allowRestore) return;
          onToggle(live, spent);
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
        const readout = pipReadout(pool, available, allowRestore);
        pip.toggleAttribute('disabled', readout.disabled);
        pip.setAttribute('aria-label', readout.ariaLabel);
        pip.title = readout.title;
      });
    });
    if (onToggle) return;
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', slotLineReadout(next));
  }

  update(pools);
  return { element: wrap, update };
}
