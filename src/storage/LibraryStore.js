import { normalizeLibrary } from '../library/Library.js';
import { downloadJSON, readFileText } from './fileIO.js';

/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */

/** The localStorage key the custom library lives under — its own key, not the
 * campaign save's, because the library is deliberately campaign-independent:
 * New / Import / Load example replace the campaign and leave it untouched. */
export const LIBRARY_KEY = 'campaign-builder:library';

/** Where an exported library file is auto-loaded from, relative to the served
 * project root. The library/ directory is gitignored, so customizations stay
 * with the working copy without entering version control. */
export const LIBRARY_FILE = 'library/campaign-library.json';

/**
 * Read the custom library from localStorage: null when none has been stored
 * (a corrupt entry also reads as none), so the caller can fall back to the
 * library file.
 * @param {string} [key]
 * @returns {CustomLibrary | null}
 */
export function loadCustomLibrary(key = LIBRARY_KEY) {
  const json = localStorage.getItem(key);
  if (!json) return null;
  try {
    return normalizeLibrary(JSON.parse(json));
  } catch {
    return null;
  }
}

/**
 * Persist the custom library, reporting failure (a full origin quota) instead
 * of throwing.
 * @param {CustomLibrary} library
 * @param {string} [key]
 * @returns {boolean} whether the write landed
 */
export function saveCustomLibrary(library, key = LIBRARY_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

/**
 * Drop the stored custom library entirely, so the next page load falls back
 * to the library file (if present) or the built-in defaults.
 * @param {string} [key]
 */
export function clearCustomLibrary(key = LIBRARY_KEY) {
  localStorage.removeItem(key);
}

/**
 * Fetch the library file served from the project root, or null when it isn't
 * there (the common case: the gitignored library/ directory doesn't exist) or
 * doesn't parse.
 * @param {string} [url]
 * @returns {Promise<CustomLibrary | null>}
 */
export async function fetchLibraryFile(url = LIBRARY_FILE) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return normalizeLibrary(await response.json());
  } catch {
    return null;
  }
}

/**
 * Trigger a browser download of the custom library as a portable .json file,
 * pretty-printed since the whole point is a file the GM keeps and may edit.
 * @param {CustomLibrary} library
 * @param {string} [filename]
 */
export function downloadLibrary(library, filename = 'campaign-library.json') {
  downloadJSON(JSON.stringify(library, null, 2), filename);
}

/**
 * Read a custom library from a File (the Import picker). Rejects only on a
 * read or parse error; a structurally-off file normalizes instead.
 * @param {File} file
 * @returns {Promise<CustomLibrary>}
 */
export function readLibraryFromFile(file) {
  return readFileText(file).then((text) => normalizeLibrary(JSON.parse(text)));
}
