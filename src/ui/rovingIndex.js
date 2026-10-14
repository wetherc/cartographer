/**
 * The pure half of a roving tabindex over a grid of buttons. A grid of many
 * small controls, for example the tile swatches of the Build palette, keeps
 * one Tab stop and moves focus inside itself with the arrow keys. This file
 * answers which item a key moves to. The widget that owns the elements
 * applies the answer. `Tabs.js` does the same for a one-row strip and keeps
 * its own copy, because a tab strip also selects on arrow move.
 */

/**
 * The index an arrow, Home, or End key moves focus to inside a grid laid out
 * in rows of `columns` items. Left and Right step one item and wrap at the
 * ends of the whole list. Up and Down step one row and stop at the first and
 * last row, so a key held down does not loop through the grid. Home and End
 * go to the first and last item. Any other key returns null, so the caller
 * lets the browser handle it.
 * @param {number} index the focused item's position in the list
 * @param {string} key the `KeyboardEvent.key` value
 * @param {number} count how many items the list holds
 * @param {number} columns how many items one rendered row holds, at least 1
 * @returns {number | null}
 */
export function rovingTarget(index, key, count, columns) {
  if (count <= 0) return null;
  const step = Math.max(1, columns);
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'ArrowDown':
      return index + step < count ? index + step : index;
    case 'ArrowUp':
      return index - step >= 0 ? index - step : index;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * How many items share the first rendered row, read from each item's top
 * offset in document order. The first item that sits lower than the first
 * one starts the second row. An empty list has one column, so a caller can
 * always divide by the result.
 * @param {number[]} tops each item's `offsetTop`, in list order
 * @returns {number}
 */
export function columnsFromTops(tops) {
  if (tops.length === 0) return 1;
  let columns = 0;
  while (columns < tops.length && tops[columns] === tops[0]) columns += 1;
  return columns;
}
