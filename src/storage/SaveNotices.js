import { isNearQuota } from './SaveManager.js';
import { MAX_NODES, MAX_TOTAL_CELLS } from './TileCodec.js';

/**
 * What the GM sees after a write. This module holds the decisions instead of
 * the toast calls in `app/campaignActions.js`, because most of the decisions
 * are about when to stay silent. Autosave writes every ten seconds while the
 * campaign is dirty. When the origin is over quota, every one of those
 * writes degrades. A notice on every write buries the one notice that
 * matters.
 */

export { QUOTA_BYTES } from './Footprint.js';

/**
 * How much the footprint must grow before the near-quota warning repeats.
 * The value is ten percent, so trimming one image stops the warning, and
 * adding a second image does not.
 */
export const RENOTIFY_GROWTH = 1.1;

/**
 * What a write's outcome means for the GM. A quota-full write is a failure,
 * and the caller must not reload after it. A write that saves the campaign
 * but not its images is still a save, because the map, the party, and every
 * entity are stored. The function still reports this case, because silence
 * makes the next load look like data corruption.
 *
 * `imagesApart` is true when IndexedDB keeps the images
 * (`AssetMirror.mirrorActive`). The localStorage quota then contains no
 * image, and advice to remove images frees nothing there. An image write
 * to IndexedDB can also fail for a reason other than a full disk, so that
 * notice does not claim one.
 * @param {{ ok: boolean, assetsOk: boolean }} result
 * @param {boolean} [imagesApart]
 * @returns {{ landed: boolean, message: string | null }}
 */
export function saveOutcome({ ok, assetsOk }, imagesApart = false) {
  if (!ok) {
    return {
      landed: false,
      message: imagesApart
        ? 'Save failed: browser storage is full. Export the campaign to keep a copy of it.'
        : 'Save failed: browser storage is full. Export the campaign, then remove large handout images or custom tiles.',
    };
  }
  if (!assetsOk) {
    return {
      landed: true,
      message: imagesApart
        ? 'Saved, but the browser did not store the images: handout pictures and custom tiles were not stored.'
        : 'Saved, but browser storage is too full for the images: handout pictures were not stored.',
    };
  }
  return { landed: true, message: null };
}

/**
 * Which undo-history degradation a write caused. A write that the log cannot
 * take at all clears the history. A write that must remove its oldest steps
 * shortens the history. An empty string is the healthy case.
 * @param {{ ok: boolean, evictedAll: boolean }} history
 * @returns {'' | 'shortened' | 'cleared'}
 */
export function historyLoss({ ok, evictedAll }) {
  if (!ok) return 'cleared';
  return evictedAll ? 'shortened' : '';
}

/**
 * The notice for a degradation, given the last one reported. A null return
 * covers two quiet cases: nothing was lost, or the same loss is already on
 * screen.
 * @param {'' | 'shortened' | 'cleared'} loss
 * @param {'' | 'shortened' | 'cleared'} reported
 * @returns {string | null}
 */
export function historyLossMessage(loss, reported) {
  if (!loss || loss === reported) return null;
  return loss === 'cleared'
    ? 'Browser storage is full: the undo history was cleared, so this change can no longer be undone.'
    : 'Browser storage is full: the oldest undo steps were dropped.';
}

/**
 * The Save button's tooltip. It shows how much of the origin's quota the
 * campaign uses. The tooltip shows at all times, so the number is visible
 * before it becomes a problem. With `imagesApart`, the images are not in
 * this number, and the tooltip says so.
 * @param {number} footprint bytes
 * @param {boolean} [imagesApart]
 * @returns {string}
 */
export function footprintTooltip(footprint, imagesApart = false) {
  const used = `Browser storage: ${megabytes(footprint)} MB of about 5 MB used`;
  return imagesApart ? `${used}, not counting images` : used;
}

/**
 * The near-quota warning, and the footprint to remember as the point of the
 * last warning. Under the threshold, the remembered footprint resets to 0,
 * so a drop below the threshold followed by a rise above it triggers the
 * warning again. Over the threshold, the warning waits for real growth in
 * the footprint instead of repeating on every autosave. With `imagesApart`,
 * the warning does not tell the GM to trim images, because they are not in
 * the footprint.
 * @param {number} footprint bytes
 * @param {number} warnedAt the footprint of the last warning, 0 for none
 * @param {boolean} [imagesApart]
 * @returns {{ message: string | null, warnedAt: number }}
 */
export function footprintWarning(footprint, warnedAt, imagesApart = false) {
  if (!isNearQuota(footprint)) return { message: null, warnedAt: 0 };
  if (footprint < warnedAt * RENOTIFY_GROWTH) return { message: null, warnedAt };
  const advice = imagesApart ? 'Export a backup.' : 'Export a backup and trim large images.';
  return {
    message: `Warning: browser storage is at ${megabytes(footprint)} MB of its ~5 MB limit. ${advice}`,
    warnedAt: footprint,
  };
}

/** Bytes as the one-decimal megabyte figure that both notices quote.
 * @param {number} bytes @returns {string} */
function megabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * The boot notice for a stored save that the app cannot read. The session
 * starts blank, and the stored string stays in place until the next save.
 * Undo is named only when the history has a step to undo, because with no
 * step the button does nothing.
 * @param {number} undoSteps
 * @returns {string}
 */
export function loadFailedMessage(undoSteps) {
  const lead = 'The saved campaign could not be read, so this session started blank.';
  return undoSteps > 0
    ? `${lead} Nothing has been overwritten: press Undo to restore the previous save, and export a backup before making changes.`
    : `${lead} The stored save stays in this browser until the next save overwrites it.`;
}

/**
 * What a load that passed the decode limits left out, in one sentence. The
 * limits come from `TileCodec.js`: `MAX_NODES` map areas, and
 * `MAX_TOTAL_CELLS` tiles over the whole campaign.
 * @param {import('./ShortenedLoad.js').Truncation} truncation
 * @returns {string}
 */
export function truncationSummary({ dropped, emptied }) {
  const areas = (/** @type {number} */ n) => `${n} map ${n === 1 ? 'area' : 'areas'}`;
  const parts = [];
  if (dropped > 0) {
    parts.push(
      `${areas(dropped)} past the first ${MAX_NODES.toLocaleString('en-US')} did not load`,
    );
  }
  if (emptied > 0) {
    parts.push(
      `${areas(emptied)} loaded with no tiles, because the campaign has more than ${MAX_TOTAL_CELLS.toLocaleString('en-US')} tiles`,
    );
  }
  return `This campaign is larger than the app can load: ${parts.join(', and ')}.`;
}

/**
 * The boot notice for a stored save that loaded shortened. Saving is on
 * hold while it shows.
 * @param {import('./ShortenedLoad.js').Truncation} truncation
 * @returns {string}
 */
export function shortenedBootMessage(truncation) {
  return `${truncationSummary(truncation)} Saving is paused, so the full campaign stays stored in this browser. Changes you make are not saved until you keep the shortened map.`;
}

/**
 * The import confirm for a file that loads shortened. Import stores what it
 * reads at once, and the file itself is not changed.
 * @param {import('./ShortenedLoad.js').Truncation} truncation
 * @returns {string}
 */
export function shortenedImportMessage(truncation) {
  return `${truncationSummary(truncation)} Importing stores the shortened map. The file itself is not changed.`;
}

/** The Save button's confirm while saving is paused. */
export const SAVE_WHILE_HELD_MESSAGE =
  'Saving now stores the shortened map over the full campaign in this browser.';

/**
 * The sentence a replace confirm adds when browser storage has no room to
 * keep the current campaign as an undo snapshot. The GM can still export
 * the campaign first.
 */
export const NO_UNDO_ROOM =
  'Browser storage has no room for a copy of the current campaign, so Undo may not be able to restore it. Export it first to keep a copy.';

/**
 * The text of a confirm before New, Load example, or Import. `undoNote`
 * tells the GM that Undo restores the current campaign, and it shows only
 * when the step is undoable. A step that is not undoable shows
 * `NO_UNDO_ROOM` in its place.
 * @param {string} question
 * @param {boolean} undoable the answer of `HistoryLog.replaceIsUndoable`
 * @param {string} [undoNote]
 * @returns {string}
 */
export function replacePrompt(question, undoable, undoNote = '') {
  return [question, undoable ? undoNote : NO_UNDO_ROOM].filter(Boolean).join(' ');
}
