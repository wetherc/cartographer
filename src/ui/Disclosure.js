/**
 * Wire an accessible disclosure: `button` toggles `body`'s visibility, with
 * `aria-expanded` kept in sync and a rotating chevron cue via a CSS class.
 * The caller owns both elements and their content; this only manages state,
 * so panels that re-render can persist expansion across renders by passing
 * the previous state back in and listening on `onToggle`.
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
