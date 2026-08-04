import { bareButton } from './buttons.js';
import { classNames, el } from './dom.js';
import { barReadout, pipReadout, slotColumnLabel, slotLineReadout } from '../view/StatBars.js';

/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * An empty compact track, for a character with no HP pool authored yet. This
 * lives here rather than at its one call site so that the `stat-bar` classes
 * stay inside the module that owns them. It draws no numbers, since there is
 * no pool to read out.
 * @returns {HTMLElement}
 */
export function emptyStatBar() {
  return el('span', 'stat-bar stat-bar--compact', el('span', 'stat-bar__track'));
}

/**
 * Build a stat bar (HP). The full form is one wide line with a label, a fill
 * track, and the numbers after it, for a character sheet's head. Two
 * narrower forms drop the label: `showLabel: false` keeps the numbers beside
 * the track, for a combat board card, and `compact` puts them over a
 * fixed-width track, for a roster row that has only a pill's worth of space.
 * The label still names the bar to a screen reader in every form. If the
 * pool is absent, for example in an older save, the caller draws no bar.
 *
 * update rewrites the fill, the numbers, and the label for a new value of
 * the same pool. A tick of HP changes four properties instead of
 * rebuilding the line.
 * @param {{ current: number, max: number }} pool
 * @param {{ modifier: string, label: string, critical?: boolean, bonus?: number,
 *   showLabel?: boolean, compact?: boolean, band?: boolean, className?: string,
 *   flank?: { before: HTMLElement, after: HTMLElement } }} opts
 *   modifier selects the fill color. critical turns on the low-fill red
 *   state. band colors the whole fill by remaining fraction instead, in
 *   three steps, for a bar read at a glance rather than watched. bonus
 *   appends a plus-N readout for temporary points on top of the pool, for
 *   example bonus HP. flank places a control, for example a damage or heal
 *   stepper, on each side of the track, and keeps the numeric readout after
 *   them. className adds a caller's own class to the wrapper.
 * @returns {{ element: HTMLElement, update: (pool: { current: number, max: number },
 *   bonus: number) => void }}
 */
export function buildStatBar(pool, opts) {
  const compact = Boolean(opts.compact);
  const showLabel = opts.showLabel ?? !compact;
  const fill = el('span', `stat-bar__fill stat-bar__fill--${opts.modifier}`);
  // The numbers recede next to a label. Alone on a card, or over a compact
  // track, they are the readout, so they keep the body color.
  const text = el('span', classNames(['stat-bar__text', showLabel && 'u-muted']));
  const track = el('span', 'stat-bar__track', fill);
  // The compact form centers the numbers on the track, so they belong
  // inside it. Every other form sets them beside it.
  if (compact) track.appendChild(text);
  const wrap = el(
    'span',
    classNames(['stat-bar u-row u-g2', compact && 'stat-bar--compact', opts.className]),
    showLabel ? el('span', 'stat-bar__label u-muted', opts.label) : null,
    opts.flank?.before,
    track,
    opts.flank?.after,
    compact ? null : text,
  );
  if (!opts.flank) wrap.setAttribute('role', 'img');

  // The bonus readout exists only while there is a bonus. update creates
  // and removes it instead of hiding it.
  /** @type {HTMLElement | null} */
  let bonusEl = null;

  /** @param {{ current: number, max: number }} next @param {number} bonus */
  function update(next, bonus) {
    const readout = barReadout(next, { label: opts.label, bonus, critical: opts.critical });
    fill.style.width = `${readout.percent}%`;
    fill.classList.toggle('stat-bar__fill--critical', readout.critical);
    if (opts.band) wrap.dataset.band = readout.band;
    text.textContent = readout.text;
    wrap.setAttribute('aria-label', readout.ariaLabel);
    // A compact pill can squeeze its numbers, so the hover text repeats them.
    if (compact) wrap.title = readout.ariaLabel;
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
 * A compact spell-slot readout. It shows one column per spell level, with
 * the ordinal centered above a two-wide grid of pips. A filled pip is a
 * slot still unspent. Columns wrap under the pip area, not the label, when
 * a high-level caster outgrows the card width.
 *
 * If onToggle is set, each pip is a button. A click on a filled pip spends
 * a slot of that level. A click on an empty pip restores one. Slots drain
 * and refill from left to right, so this reads as toggling that pip.
 * Without onToggle, for a spectator's view, the line is a plain readout.
 *
 * If allowRestore is false, the line keeps the spend half but disables the
 * empty pips. This is a player's view of their own slots: a player can
 * cast, but only the GM can grant a slot back. A non-caster with no slot
 * pools gets no line.
 *
 * update takes the same pools with new current values and moves the pips
 * to match. It assumes the maxima are unchanged, since the pip count comes
 * from them. A caster who gains a slot needs a rebuilt line instead.
 * @param {ResourcePool[]} pools
 * @param {((pool: ResourcePool, spent: boolean) => void) | null} onToggle
 * @param {boolean} [allowRestore] whether clicking an empty pip can put a slot back
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
  // Each pip element matches one slot, in pool order. update can walk
  // pools and pips together without reading the shape of the DOM.
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
        // The pool for this pip is read at click time. A spend acts on the
        // live counts, not the counts present when the pip was built.
        const index = pipsByPool.length;
        pip = bareButton(
          [],
          () => {
            const live = livePools[index];
            const spent = i < live.current;
            if (!spent && !allowRestore) return;
            onToggle(live, spent);
          },
          { className: 'slot-line__pip' },
        );
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
