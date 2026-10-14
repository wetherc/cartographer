import { confirmModal } from '../ui/Modal.js';
import { holdSaves, loadTruncation, releaseSaves, savesHeld } from '../storage/ShortenedLoad.js';
import {
  SAVE_WHILE_HELD_MESSAGE,
  shortenedBootMessage,
  shortenedImportMessage,
} from '../storage/SaveNotices.js';

/** @typedef {import('../storage/ShortenedLoad.js').Truncation} Truncation */

/**
 * The prompts for a campaign that loaded shortened (`storage/ShortenedLoad.js`).
 * Each one tells the GM before a save stores the shortened map over the full
 * one. This module is DOM glue: the rules and the wording live in the storage
 * modules it imports.
 */

/**
 * Put saving on hold at boot and tell the GM why. Keeping the shortened map
 * lifts the hold. Declining leaves it on for the rest of the session, and
 * the Save button asks again.
 * @param {Truncation} truncation
 * @returns {Promise<void>}
 */
export async function holdShortenedBoot(truncation) {
  holdSaves();
  const keep = await confirmModal(shortenedBootMessage(truncation), {
    title: 'Part of the map did not load',
    confirmLabel: 'Keep the shortened map',
    cancelLabel: 'Keep saving paused',
    variant: 'danger',
  });
  if (keep) releaseSaves();
}

/**
 * Whether to go on with an import. A file that loads whole needs no
 * question here.
 * @param {import('../types/storage.js').CampaignState} state the state read from the file
 * @returns {Promise<boolean>}
 */
export async function confirmShortenedImport(state) {
  const truncation = loadTruncation(state);
  if (!truncation) return true;
  return confirmModal(shortenedImportMessage(truncation), {
    title: 'Part of the map will not load',
    confirmLabel: 'Import the shortened map',
    variant: 'danger',
  });
}

/**
 * Whether the Save button goes on to write. With saving on hold, the GM
 * confirms first, and a confirm lifts the hold.
 * @returns {Promise<boolean>}
 */
export async function confirmSaveWhileHeld() {
  if (!savesHeld()) return true;
  const save = await confirmModal(SAVE_WHILE_HELD_MESSAGE, {
    title: 'Save the shortened map?',
    confirmLabel: 'Save the shortened map',
    variant: 'danger',
  });
  if (save) releaseSaves();
  return save;
}
