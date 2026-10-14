import { textButton } from './buttons.js';
import { el } from './dom.js';

/**
 * A text element that folds to a few lines behind a More button, which
 * reads Less while the text is open. The caller keeps the open state, so
 * it lasts across a list repaint, and `onToggle` flips it and repaints.
 * The CSS class `<className>--folded` sets how many lines show.
 * @param {'span' | 'p'} tag
 * @param {string} className
 * @param {string} text
 * @param {{ fold: boolean, open: boolean, onToggle: () => void, subject: string,
 *   focusKey: string }} opts `fold` false returns the text alone. `subject`
 *   names the text in the button's accessible name, such as "notes on Dorn".
 * @returns {HTMLElement[]}
 */
export function foldText(tag, className, text, opts) {
  const body = el(tag, className, text);
  if (!opts.fold) return [body];
  body.classList.toggle(`${className}--folded`, !opts.open);
  const label = opts.open ? 'Less' : 'More';
  const more = textButton(label, opts.onToggle, { className: 'fold-text__more' });
  more.setAttribute('aria-expanded', String(opts.open));
  // The name starts with the visible word, so a speech command such as
  // "click More" finds the button (WCAG 2.5.3, Label in Name).
  more.setAttribute('aria-label', `${label}: ${opts.subject}`);
  more.dataset.focusKey = opts.focusKey;
  if (!opts.open && typeof ResizeObserver !== 'undefined') {
    // The fold rule counts characters, so a long note in a wide box can fit
    // in its folded lines. The button hides while the clamp clips nothing,
    // and shows again when a narrower box makes the text overflow.
    new ResizeObserver(() => {
      more.hidden = body.scrollHeight <= body.clientHeight + 1;
    }).observe(body);
  }
  return [body, more];
}
