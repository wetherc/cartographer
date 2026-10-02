import { packState, deserialize } from './SaveManager.js';
import { normalizeLibrary, isLibraryEmpty } from '../library/Library.js';
import { downloadJSON, readFileText } from './fileIO.js';

/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */
/** @typedef {import('../types/storage.js').CampaignState} CampaignState */

/**
 * The exported campaign file: the campaign save plus the GM's custom
 * library, in one JSON document. The library joins the byte stream here and
 * nowhere else. The localStorage save, the undo history, and the tab-sync
 * deltas never carry it, so the campaign's storage costs and diff sizes
 * stay what they were. On the way back in, `deserialize` rebuilds the
 * state field by field and so drops the `library` key structurally;
 * `extractBundledLibrary` lifts it through `normalizeLibrary`, the same
 * gate a standalone library file passes.
 */

/**
 * The campaign state and the custom library as one JSON string. An empty or
 * absent library writes no `library` field, so a file from a GM with no
 * customizations equals the plain serialized save exactly.
 * @param {CampaignState} state
 * @param {CustomLibrary | null} library
 * @returns {string}
 */
export function serializeCampaignFile(state, library) {
  const packed = packState(state);
  if (!library || isLibraryEmpty(library)) return JSON.stringify(packed);
  return JSON.stringify({ ...packed, library });
}

/**
 * Start a browser download of the campaign file.
 * @param {CampaignState} state
 * @param {CustomLibrary | null} library
 * @param {string} [filename]
 */
export function downloadCampaignFile(state, library, filename = 'campaign.json') {
  downloadJSON(serializeCampaignFile(state, library), filename);
}

/**
 * The custom library a parsed save object carries, normalized, or null when
 * the field is absent, malformed, or empty. `normalizeLibrary` repairs
 * instead of rejecting, so a broken library can never fail the campaign
 * import around it.
 * @param {unknown} raw the parsed save object
 * @returns {CustomLibrary | null}
 */
export function extractBundledLibrary(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const field = /** @type {Record<string, unknown>} */ (raw).library;
  if (!field || typeof field !== 'object') return null;
  try {
    const library = normalizeLibrary(field);
    return isLibraryEmpty(library) ? null : library;
  } catch {
    return null;
  }
}

/**
 * Parse a campaign file's text into the state and the bundled library. The
 * text parses twice, once through `deserialize` and once for the library
 * field. A file import happens once per click, so the copy is cheaper than
 * threading a side channel through `deserialize`.
 * @param {string} text
 * @returns {{ state: CampaignState, library: CustomLibrary | null }}
 */
export function parseCampaignFile(text) {
  /** @type {unknown} */
  let raw = null;
  try {
    raw = JSON.parse(text);
  } catch {
    // deserialize throws its own error for unreadable JSON; the library
    // side only needs to stay quiet.
  }
  return { state: deserialize(text), library: extractBundledLibrary(raw) };
}

/**
 * Read an uploaded campaign file.
 * @param {File} file
 * @returns {Promise<{ state: CampaignState, library: CustomLibrary | null }>}
 */
export function readCampaignFromFile(file) {
  return readFileText(file).then(parseCampaignFile);
}

/**
 * What a campaign import does with the file's bundled library, against the
 * customs the browser already holds: nothing, adopt it silently, or ask the
 * GM first. Pure, so the import handler stays thin.
 * @param {CustomLibrary | null} bundled
 * @param {CustomLibrary | null} current
 * @returns {'skip' | 'adopt' | 'confirm'}
 */
export function libraryImportAction(bundled, current) {
  if (!bundled || isLibraryEmpty(bundled)) return 'skip';
  if (!current || isLibraryEmpty(current)) return 'adopt';
  return 'confirm';
}
