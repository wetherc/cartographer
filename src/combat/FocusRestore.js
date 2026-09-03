/**
 * Where keyboard focus goes after the combat screen rebuilds. A rebuild
 * replaces every button, so the element that had focus leaves the document.
 * Without help, focus falls to the page body and a keyboard user has to find
 * the screen again. These two functions decide the replacement from plain
 * descriptions, so the screen only has to read them off its elements.
 */

/**
 * @typedef {{
 *   combatantId?: string | null,
 *   chip?: boolean,
 *   label?: string | null,
 *   text?: string | null,
 * }} FocusSource
 */

/**
 * @template T
 * @typedef {{ element: T, key: string | null, disabled?: boolean }} FocusCandidate
 */

/**
 * A stable name for a focusable control, the same before and after a
 * rebuild. A ribbon chip and a board card are named by the combatant they
 * stand for, so the chip and the card of one combatant stay distinct. Any
 * other control is named by its accessible label, or its text when it has no
 * label. A control with neither has no key and cannot be found again.
 * @param {FocusSource} source
 * @returns {string | null}
 */
export function focusKey({ combatantId = null, chip = false, label = null, text = null }) {
  if (combatantId) return `${chip ? 'chip' : 'card'}:${combatantId}`;
  const name = (label ?? text ?? '').trim();
  return name ? `control:${name}` : null;
}

/**
 * The element to focus after a rebuild. The control with the same key wins
 * when it exists and is enabled. A Damage button stays under the finger
 * across the HP edit it made. Otherwise the fallbacks are tried in order:
 * the current turn's chip, then the screen heading. A fallback that is
 * missing or disabled is skipped. The result is null when nothing is left,
 * and the caller leaves focus alone.
 * @template T
 * @param {string | null} key the key of the control that had focus
 * @param {FocusCandidate<T>[]} candidates every focusable control on the rebuilt screen
 * @param {(FocusCandidate<T> | null | undefined)[]} fallbacks
 * @returns {FocusCandidate<T> | null}
 */
export function refocusTarget(key, candidates, fallbacks) {
  const same = key ? candidates.find((c) => c.key === key && !c.disabled) : undefined;
  return same ?? fallbacks.find((f) => f && !f.disabled) ?? null;
}
