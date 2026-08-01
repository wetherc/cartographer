/**
 * Which app-wide action a keypress means. `app/shortcuts.js` keeps the
 * listener, the test for whether the user is typing in a field (which needs
 * the real DOM), and the calls. This file holds the table of what each key
 * does, and the two places where it depends on mode and role.
 */

/** @typedef {'save' | 'undo' | 'undo-stroke' | 'redo' | 'build' | 'play' | 'help'} ShortcutAction */

/**
 * The shortcut list that the '?' dialog shows. This list stays beside the
 * table it describes, so a new shortcut and its documentation are one edit,
 * not two.
 */
export const SHORTCUT_HELP = [
  'Ctrl/Cmd+S — save the campaign',
  'Ctrl/Cmd+Z — undo (Build: last edit; Play: previous save)',
  'Ctrl/Cmd+Shift+Z — redo the last undone save',
  'B / P — switch to Build / Play mode',
  'On the map (click it first):',
  'Arrows — move the cursor · Enter/Space — act',
  '+ / - — zoom',
];

/**
 * The action that a keypress asks for, or null for a keypress that asks for
 * nothing.
 *
 * Ctrl/Cmd+Z means two different undos. In Build mode it is the
 * stroke-level undo, because that is what a GM reaches for while painting.
 * Everywhere else it is the save-level undo that the header button drives.
 * Shift turns it into a redo, always the save-level redo, because strokes
 * have no redo.
 *
 * Mode switching is GM-only, and uses a bare letter. The function checks it
 * after the modifier combinations, and skips it entirely when any modifier
 * is held. Help is open to everyone, because a player who cannot switch
 * modes can still want to know what the map keys do.
 * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean }} event
 * @param {{ mode: string, gm: boolean }} context
 * @returns {ShortcutAction | null}
 */
export function shortcutFor(event, context) {
  const command = Boolean(event.ctrlKey || event.metaKey);
  const key = event.key.toLowerCase();
  if (command && key === 's') return 'save';
  if (command && key === 'z') {
    if (event.shiftKey) return 'redo';
    return context.mode === 'build' ? 'undo-stroke' : 'undo';
  }
  if (command || event.altKey) return null;
  if (event.key === 'b' && context.gm) return 'build';
  if (event.key === 'p' && context.gm) return 'play';
  if (event.key === '?') return 'help';
  return null;
}
