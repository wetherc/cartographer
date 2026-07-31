/**
 * Which app-wide action a keypress means. `app/shortcuts.js` keeps the listener,
 * the "am I typing in a field" test (which needs the real DOM), and the calls;
 * the table of what each key does, and the two places it depends on mode and
 * role, are here.
 */

/** @typedef {'save' | 'undo' | 'undo-stroke' | 'redo' | 'build' | 'play' | 'help'} ShortcutAction */

/**
 * The shortcut list the '?' dialog shows. Kept beside the table it describes so
 * a new shortcut and its documentation are one edit rather than two.
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
 * The action a keypress asks for, or null for one that asks for nothing.
 *
 * Ctrl/Cmd+Z means two different undos. In Build mode it is the stroke-level one,
 * because that is what a GM mid-painting reaches for; everywhere else it is the
 * save-level one the header button drives. Shift makes it a redo, and always the
 * save-level redo, since strokes have none.
 *
 * Mode switching is GM-only and takes a bare letter, so it is checked after the
 * modifier combinations and skipped entirely when any modifier is held. Help is
 * open to everyone, since a player who cannot switch modes can still want to know
 * what the map keys do.
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
