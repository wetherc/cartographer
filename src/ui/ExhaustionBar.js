import { el } from './dom.js';
import { bareButton } from './buttons.js';
import { setTip } from './Tooltip.js';
import { exhaustionReadout, nextLevel } from '../view/ExhaustionView.js';

/** @typedef {import('../entities/Exhaustion.js').Exhaustible} Exhaustible */

/**
 * The exhaustion row: a label and one pip per level, shared by the character
 * sheet and the two creature panels. The bar reads the level through
 * `getEntity` and reports the new level through `onSet`. The owner writes it.
 *
 * A GM clicks a pip to set the level to it, and clicks the pip that matches the
 * current level to take that level back off. Every pip is a button with its own
 * accessible name, so the row is reachable from the keyboard and says what each
 * press does. The sixth pip is the fatal one, and it reads apart from the rest.
 *
 * Without `canEdit`, the row shows the pips and no controls. It hides itself
 * entirely at level 0 in that state, because a rested combatant has nothing to
 * report and every row would otherwise carry an empty one.
 * @param {HTMLElement} container
 * @param {{
 *   getEntity: () => Exhaustible,
 *   onSet: (level: number) => void,
 *   canEdit?: () => boolean,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountExhaustionBar(container, callbacks) {
  const canEdit = callbacks.canEdit ?? (() => true);
  const root = el('div', 'exhaustion-bar u-row u-wrap u-g1');
  container.appendChild(root);

  function render() {
    root.replaceChildren();
    const readout = exhaustionReadout(callbacks.getEntity());
    const editable = canEdit();
    root.hidden = !editable && readout.level === 0;
    if (root.hidden) return;
    root.classList.toggle('exhaustion-bar--fatal', readout.fatal);
    const label = el('span', 'exhaustion-bar__label u-muted', readout.label);
    setTip(label, readout.note);
    root.appendChild(label);
    const pips = el('span', 'exhaustion-bar__pips u-row');
    if (!editable) {
      pips.setAttribute('role', 'img');
      pips.setAttribute('aria-label', readout.ariaLabel);
    }
    for (const pip of readout.pips) {
      const glyph = pip.filled ? '●' : '○';
      const classes = `exhaustion-bar__pip${pip.fatal ? ' exhaustion-bar__pip--fatal' : ''}`;
      if (!editable) {
        pips.appendChild(el('span', classes, glyph));
        continue;
      }
      // The level to set is read at click time, from the level on screen when
      // the row was drawn. Every write re-renders the row, so the two agree.
      const target = nextLevel(readout.level, pip.level);
      pips.appendChild(
        bareButton([glyph], () => callbacks.onSet(target), {
          className: classes,
          ariaLabel: `Set exhaustion to ${target}`,
        }),
      );
    }
    root.appendChild(pips);
    if (readout.summary) {
      root.appendChild(el('span', 'exhaustion-bar__summary u-muted', readout.summary));
    }
  }

  render();
  return { update: render };
}
