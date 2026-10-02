/**
 * The view that Undo and Redo keep across their reload. A step reloads the
 * page so every module starts from the restored save, and a plain reload
 * opens on the first character and the first tab of each strip. A GM who
 * undoes a spell slot on the third character's sheet, with the Log tab open,
 * then lands on another character and another tab, and a step in Build mode
 * lands in Play mode. The step writes the mode, the selected character, the
 * open tabs, and whether the full sheet is open here, and the next start
 * reads them back once.
 *
 * The record goes into sessionStorage, which belongs to this tab alone, so
 * a second tab of the same browser keeps its own view. The storage is
 * passed in, so a test can use a plain object.
 */

const RELOAD_VIEW_KEY = 'campaign-builder:reload-view';

/**
 * @typedef {object} ReloadView
 * @property {string | null} characterId the character the sheet showed
 * @property {string[]} tabs the ids of the selected tab of each strip
 * @property {boolean} fullSheet true when the full character sheet was open
 * @property {EditMode | null} mode the mode of the page, or null in combat mode,
 *   which a running fight restores by itself
 */

/** @typedef {"play" | "build" | "library"} EditMode */

/** The modes that a stored view can name. */
const MODES = ['play', 'build', 'library'];

/** @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} ViewStorage */

/**
 * Store the view for the next start of this tab. A full or blocked storage
 * drops the record, and the reload opens on the default view.
 * @param {ViewStorage} storage
 * @param {ReloadView} view
 */
export function keepViewForReload(storage, view) {
  try {
    storage.setItem(RELOAD_VIEW_KEY, JSON.stringify(view));
  } catch {
    // The view is a convenience. The step goes ahead without it.
  }
}

/**
 * Read and clear the stored view. Only the next start after a step uses it,
 * so an ordinary reload later opens on the default view. A missing or
 * unreadable record gives null.
 * @param {ViewStorage} storage
 * @returns {ReloadView | null}
 */
export function takeReloadView(storage) {
  try {
    const raw = storage.getItem(RELOAD_VIEW_KEY);
    storage.removeItem(RELOAD_VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      characterId: typeof parsed?.characterId === 'string' ? parsed.characterId : null,
      tabs: Array.isArray(parsed?.tabs)
        ? parsed.tabs.filter((/** @type {unknown} */ id) => typeof id === 'string')
        : [],
      mode: MODES.includes(parsed?.mode) ? parsed.mode : null,
      fullSheet: parsed?.fullSheet === true,
    };
  } catch {
    return null;
  }
}

/**
 * The character to select at start: the stored one while it is still in the
 * roster, otherwise the fallback.
 * @param {ReloadView | null} view
 * @param {{ id: string }[]} characters
 * @param {string | null} fallback
 * @returns {string | null}
 */
export function startingCharacterId(view, characters, fallback) {
  const id = view?.characterId;
  return id && characters.some((c) => c.id === id) ? id : fallback;
}
