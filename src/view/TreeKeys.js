/**
 * One visible row of a tree view, in screen order.
 * @typedef {{ id: string, parentId: string | null, expanded: boolean | null }} TreeKeyRow
 * `expanded` is null for a row with no children. `parentId` names the row
 * one level up, or null for a root row.
 */

/**
 * @typedef {{ focus: string } | { expand: string } | { collapse: string } | { menu: string } | { select: string }} TreeKeyAction
 */

/**
 * Work out what a key press does in a tree view, following the WAI-ARIA tree
 * pattern. Up and Down move one row, Home and End go to the first and last
 * row, Right opens a closed branch or moves into an open one, and Left
 * closes an open branch or moves to the parent. Enter and Space select the
 * row. Shift+F10 and the ContextMenu key open the row menu. It returns null
 * for any other key, or when the key has nothing to do on this row, so the
 * caller lets the browser handle it.
 * @param {{ key: string, shiftKey?: boolean }} event
 * @param {TreeKeyRow[]} rows the visible rows in screen order
 * @param {string} focusedId
 * @returns {TreeKeyAction | null}
 */
export function treeKeyAction(event, rows, focusedId) {
  const index = rows.findIndex((row) => row.id === focusedId);
  if (index < 0) return null;
  const row = rows[index];
  const focusAt = (/** @type {number} */ i) => (rows[i] ? { focus: rows[i].id } : null);
  switch (event.key) {
    case 'ArrowDown':
      return focusAt(index + 1);
    case 'ArrowUp':
      return focusAt(index - 1);
    case 'Home':
      return focusAt(0);
    case 'End':
      return focusAt(rows.length - 1);
    case 'ArrowRight':
      if (row.expanded === false) return { expand: row.id };
      return row.expanded ? focusAt(index + 1) : null;
    case 'ArrowLeft':
      if (row.expanded) return { collapse: row.id };
      return row.parentId ? { focus: row.parentId } : null;
    case 'Enter':
    case ' ':
      return { select: row.id };
    case 'ContextMenu':
      return { menu: row.id };
    case 'F10':
      return event.shiftKey ? { menu: row.id } : null;
    default:
      return null;
  }
}
