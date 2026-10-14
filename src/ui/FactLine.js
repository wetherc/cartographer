import { sectionLabel } from './buttons.js';
import { classNames, el } from './dom.js';

/**
 * A label with the value it names: a combatant's initiative and AC, a
 * spell's casting time, the armor a foe wears. The value sits under the
 * label by default. With `layout: 'row'` it sits beside it, which is the
 * dense form a fixed label column reads best in.
 *
 * The label is a `sectionLabel`, so every line of this kind is cased and
 * sized alike wherever it appears. The value takes any `Child`, so a caller
 * can hand it a built node, a row of slot chips for example, where plain
 * text will not do.
 *
 * This is not `buildStatBar`. A stat bar draws a fraction as a filled
 * track. This draws text.
 * @param {string} label
 * @param {import('./dom.js').Child} value
 * @param {{ layout?: 'stack' | 'row', className?: string }} [opts]
 * @returns {HTMLDivElement}
 */
export function factLine(label, value, opts = {}) {
  const classes = ['fact-line', opts.layout === 'row' && 'fact-line--row', opts.className];
  return el(
    'div',
    classNames(classes),
    sectionLabel(label, { className: 'fact-line__label' }),
    el('span', 'fact-line__value', value),
  );
}
