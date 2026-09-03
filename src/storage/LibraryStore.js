import { normalizeLibrary } from '../library/Library.js';
import { downloadJSON, readFileText } from './fileIO.js';
import { removeStored, writeStored } from './Footprint.js';

/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */

/** The localStorage key that the custom library uses. This key is separate
 * from the campaign save's key, because the library is deliberately
 * independent of the campaign. New, Import, and Load Example replace the
 * campaign and leave the library untouched. */
export const LIBRARY_KEY = 'campaign-builder:library';

/** Where the app loads an exported library file from at startup, relative to
 * the served project root. The committed file holds an empty library, so the
 * startup fetch always has something to read. A GM's export overwrites this
 * file in place. Everything else under library/ is in gitignore. */
export const LIBRARY_FILE = 'library/campaign-library.json';

/**
 * Read the custom library from localStorage. The function returns null when
 * no library is stored. A corrupt entry also reads as null, so the caller
 * can fall back to the library file.
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
 * Save the custom library. The function reports failure (a full origin
 * quota) instead of throwing an error.
 * @param {CustomLibrary} library
 * @param {string} [key]
 * @returns {boolean} true when the write lands
 */
export function saveCustomLibrary(library, key = LIBRARY_KEY) {
  try {
    writeStored(key, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete the stored custom library entirely, so the next page load falls
 * back to the library file, if present, or the built-in defaults.
 * @param {string} [key]
 */
export function clearCustomLibrary(key = LIBRARY_KEY) {
  removeStored(key);
}

/**
 * Fetch the library file served from the project root, or return null when
 * the file is not there (a deployment that does not include it) or when the
 * file does not parse. The committed file holds an empty library, and the
 * caller treats this the same as no file.
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
 * Start a browser download of the custom library as a portable .json file.
 * The file is pretty-printed, because the GM keeps this file and can edit
 * it.
 * @param {CustomLibrary} library
 * @param {string} [filename]
 */
export function downloadLibrary(library, filename = 'campaign-library.json') {
  downloadJSON(JSON.stringify(library, null, 2), filename);
}

/**
 * Read a custom library from a File object (the Import picker). The function
 * rejects only on a read error or a parse error. A file with a structural
 * error normalizes instead of failing.
 * @param {File} file
 * @returns {Promise<CustomLibrary>}
 */
export function readLibraryFromFile(file) {
  return readFileText(file).then((text) => normalizeLibrary(JSON.parse(text)));
}
