import { bareButton } from './buttons.js';
import { classNames, el } from './dom.js';
import { icon } from './icons.js';

/**
 * Build a disclosure and wire it in one call: the header button, its chevron
 * cue, and the `wireDisclosure` state over the body the caller passes.
 *
 * A header with a `label` takes the shared section-label treatment, since that
 * is what a collapsible group heading looks like everywhere here. A header
 * built out of icons instead, the dice tray's d20 summary, leaves `label` out
 * and names itself through `ariaLabel`. Anything that belongs between the
 * label and the chevron, a count for example, goes in `headChildren`.
 *
 * The header and the body come back as siblings rather than inside a wrapper,
 * so a panel can put them in whatever box its own layout needs.
 * @param {{ body: HTMLElement, label?: string, headChildren?: import('./dom.js').Child[],
 *   className?: string, ariaLabel?: string, expanded?: boolean,
 *   onToggle?: (expanded: boolean) => void }} spec
 * @returns {{ head: HTMLButtonElement, body: HTMLElement,
 *   isExpanded: () => boolean, setExpanded: (expanded: boolean) => void }}
 */
export function buildDisclosure(spec) {
  const head = bareButton(
    [
      spec.label !== undefined && el('span', '', spec.label),
      ...(spec.headChildren ?? []),
      icon('chevron', { className: 'disclosure__chevron' }),
    ],
    undefined,
    {
      className: classNames([
        'disclosure',
        spec.label !== undefined && 'section-label',
        'u-row',
        'u-g2',
        spec.className,
      ]),
      ariaLabel: spec.ariaLabel,
    },
  );
  return { head, body: spec.body, ...wireDisclosure(head, spec.body, spec) };
}

/**
 * Wire an accessible disclosure. The `button` toggles the visibility of
 * `body`. This function keeps `aria-expanded` in sync and rotates a chevron
 * cue through a CSS class. The caller owns both elements and their content.
 * This function only manages state. A panel that re-renders can persist
 * expansion across renders by passing the previous state back in and by
 * listening on `onToggle`.
 * @param {HTMLButtonElement} button
 * @param {HTMLElement} body
 * @param {{ expanded?: boolean, onToggle?: (expanded: boolean) => void }} [options]
 * @returns {{ isExpanded: () => boolean, setExpanded: (expanded: boolean) => void }}
 */
export function wireDisclosure(button, body, options = {}) {
  let expanded = options.expanded ?? false;

  /** @param {boolean} next */
  function setExpanded(next) {
    expanded = next;
    button.setAttribute('aria-expanded', String(expanded));
    button.classList.toggle('disclosure--open', expanded);
    body.hidden = !expanded;
    options.onToggle?.(expanded);
  }

  button.addEventListener('click', () => setExpanded(!expanded));
  setExpanded(expanded);
  return { isExpanded: () => expanded, setExpanded };
}
