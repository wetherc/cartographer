/**
 * Where the toast stack goes on the screen. The stack sits at the right end
 * of the breadcrumb row, above the map. A toast in a bottom corner covers
 * the party roster or the encounter stats after each autosave, and a
 * centered toast covers the HP bar of the sheet.
 *
 * On a wide screen the trail of crumbs is short, so the right end of the row
 * is empty. On a narrow screen a long trail reaches the right end, or wraps
 * onto more lines, and a toast in the row covers the last crumb. When the
 * stack does not fit between the end of the trail and the end of the row, it
 * goes just below the row instead, over the top of the map.
 *
 * The row moves with the header, which wraps onto more lines on a narrow
 * screen, and it scrolls away with the page. The stack therefore reads the
 * row's box when a toast appears. A row that is hidden or scrolled out of
 * view gives null, and the stack then uses its CSS place in the bottom-right
 * corner of the window.
 */

/** The smallest gap in pixels between the stack and the window edges. */
const EDGE = 8;

/** The gap in pixels between the stack and the trail or the row. */
const GAP = 8;

/**
 * @param {{ top: number, bottom: number, right: number, height: number }} row
 *   the box of the breadcrumb row, in window coordinates
 * @param {number} trailRight the right end of the widest line of crumbs
 * @param {number} stackWidth the width of the toast stack
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @returns {{ top: number, right: number } | null} the offsets in pixels
 *   from the top and the right edge of the window, or null for the CSS place
 */
export function toastPlace(row, trailRight, stackWidth, viewportWidth, viewportHeight) {
  if (row.height === 0 || row.bottom <= 0 || row.top >= viewportHeight) return null;
  const fits = trailRight + GAP + stackWidth <= row.right;
  return {
    top: Math.max(EDGE, Math.round(fits ? row.top : row.bottom + GAP)),
    right: Math.max(EDGE, Math.round(viewportWidth - row.right)),
  };
}
