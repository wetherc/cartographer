/**
 * The app's tooltip. Every hint used to be a native `title`, which the
 * browser draws in its own style, after its own delay, in a box nothing here
 * can theme. This module replaces that with one styled tooltip and one set of
 * delegated listeners.
 *
 * A widget marks an element with {@link setTip}, which writes `data-tip`.
 * {@link mountTooltips} watches the document for a pointer or the keyboard
 * landing on any element carrying that attribute, and shows the text beside
 * it. There is one tooltip element for the whole page, so a widget adds no
 * DOM of its own and no listeners of its own.
 *
 * The tooltip is a popover, so it draws in the browser's top layer. Without
 * that, a hint inside a modal dialog would render behind the dialog, which
 * also sits in the top layer. A browser with no popover support falls back to
 * a plain fixed element, which is correct everywhere except over a modal.
 *
 * `src/ui/TileTooltip.js` stays separate. It follows the cursor across the
 * map canvas, holds several lines of tile metadata, and has no element to
 * anchor to, so it shares nothing with this except its look.
 */

import { el } from './dom.js';

/** How far the tooltip sits from its anchor and from the viewport edge. */
const MARGIN = 8;

/**
 * How long the pointer rests on an element before its tooltip shows. Without
 * a delay, moving the pointer across a rail of icon buttons flashes a box over
 * each one in turn. The keyboard does not wait: see `mountTooltips`.
 */
const HOVER_DELAY = 1000;

/** A rectangle in viewport coordinates, as `getBoundingClientRect` gives it. */
/** @typedef {{ left: number, top: number, right: number, bottom: number, width: number, height: number }} Rect */

/**
 * Where the tooltip goes for one anchor. It prefers to sit above the anchor,
 * centered on it, and flips below when there is not enough room above. Either
 * way the result is clamped to the viewport, so a tooltip on an element at
 * the edge of the window stays fully readable.
 *
 * This is the whole placement rule, and it is pure, so it is tested without a
 * browser. The caller passes measured sizes.
 * @param {Rect} anchor the element the tooltip describes
 * @param {{ width: number, height: number }} tip the tooltip's own size
 * @param {{ width: number, height: number }} viewport
 * @param {number} [margin]
 * @returns {{ left: number, top: number, side: 'above' | 'below' }}
 */
export function tipPlacement(anchor, tip, viewport, margin = MARGIN) {
  const above = anchor.top - tip.height - margin;
  const side = above >= margin ? 'above' : 'below';
  const top = side === 'above' ? above : anchor.bottom + margin;
  const centered = anchor.left + (anchor.width - tip.width) / 2;
  // The clamp runs low-edge last, so a tooltip wider than the viewport starts
  // at the margin rather than off the left side.
  const left = Math.max(margin, Math.min(centered, viewport.width - tip.width - margin));
  return { left, top, side };
}

/**
 * Give an element a tooltip. The text may hold newlines, and the tooltip
 * keeps them, which is how a two-part hint puts its detail on its own line.
 * Passing an empty string takes the tooltip off again.
 *
 * This also clears any native `title`, so an element cannot end up with both
 * boxes. A caller that wants the native one keeps setting `title` itself.
 * @param {HTMLElement} element
 * @param {string} text
 * @returns {HTMLElement} the element, so a builder can set the tip inline
 */
export function setTip(element, text) {
  if (text) {
    element.dataset.tip = text;
  } else {
    delete element.dataset.tip;
    element.removeAttribute('aria-describedby');
  }
  element.removeAttribute('title');
  return element;
}

/**
 * Mount the one tooltip and its delegated listeners. Call this once, from the
 * composition root, before any widget is built. The listeners sit on the
 * document, so an element gains a tooltip by carrying `data-tip`, whenever it
 * is built and whether or not it existed at mount time.
 *
 * Both a pointer and the keyboard show the tooltip, so a control reached by
 * Tab reads the same hint a hovered control does. A hovered control waits out
 * {@link HOVER_DELAY} first, and the keyboard does not wait. A press, a
 * scroll, or Escape hides it: a tooltip that outlived the click that opened a
 * dialog used to hang over the dialog.
 * @param {HTMLElement} container
 * @returns {{ hide: () => void }}
 */
export function mountTooltips(container) {
  const tip = el('div', 'tooltip');
  tip.id = 'app-tooltip';
  tip.setAttribute('role', 'tooltip');
  // `manual` rather than `auto`, because an auto popover closes on any click
  // outside it, and that click is exactly what opens the dialog the tooltip
  // may need to sit over. A popover is hidden by its own state, so the
  // `hidden` attribute is the fallback path's business alone.
  const canPopover = 'popover' in HTMLElement.prototype;
  if (canPopover) tip.popover = 'manual';
  else tip.hidden = true;
  container.appendChild(tip);

  /** The element the tooltip currently describes. @type {HTMLElement | null} */
  let anchor = null;
  /** The pending hover timer, or 0 when none is waiting. @type {number} */
  let timer = 0;

  /** Drop a hover that has not come due yet. */
  function cancelPending() {
    if (timer) clearTimeout(timer);
    timer = 0;
  }

  function hide() {
    cancelPending();
    if (!anchor) return;
    // Only clear the description this module set. An element that names its
    // own describedby keeps it.
    if (anchor.getAttribute('aria-describedby') === tip.id) {
      anchor.removeAttribute('aria-describedby');
    }
    anchor = null;
    if (canPopover) tip.hidePopover();
    else tip.hidden = true;
  }

  /** @param {HTMLElement} element */
  function show(element) {
    const text = element.dataset.tip;
    if (!text) return;
    if (anchor === element) return;
    hide();
    anchor = element;
    tip.textContent = text;
    if (canPopover) tip.showPopover();
    else tip.hidden = false;
    // The tooltip has to be visible before it can be measured, so the
    // placement runs after the two lines above.
    const place = tipPlacement(element.getBoundingClientRect(), tip.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    tip.classList.toggle('tooltip--below', place.side === 'below');
    tip.style.left = `${place.left}px`;
    tip.style.top = `${place.top}px`;
    element.setAttribute('aria-describedby', tip.id);
  }

  /**
   * Show the tooltip once the pointer has rested on the element for the hover
   * delay. Moving on before then cancels it, so crossing a row of buttons
   * flashes nothing.
   * @param {HTMLElement} element
   */
  function showAfterDelay(element) {
    if (anchor === element) return;
    // The pointer has left whatever the open tooltip described, so that one
    // goes now rather than hanging over the new element for the delay.
    hide();
    timer = setTimeout(() => {
      timer = 0;
      show(element);
    }, HOVER_DELAY);
  }

  /** @param {Event} event @returns {HTMLElement | null} */
  function tipTarget(event) {
    const node = event.target;
    if (!(node instanceof Element)) return null;
    return /** @type {HTMLElement | null} */ (node.closest('[data-tip]'));
  }

  document.addEventListener('pointerover', (event) => {
    const target = tipTarget(event);
    if (target) showAfterDelay(target);
    else hide();
  });
  // The keyboard shows the hint at once. A Tab press is already a deliberate
  // stop on the control, so there is nothing to wait out.
  document.addEventListener('focusin', (event) => {
    const target = tipTarget(event);
    if (target) show(target);
    else hide();
  });
  document.addEventListener('pointerdown', hide);
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });
  // A scrolled anchor leaves its tooltip behind, since the tooltip is placed
  // in viewport coordinates once. Capture, because most scrolling here
  // happens inside a panel rather than on the window.
  document.addEventListener('scroll', hide, true);

  return { hide };
}
