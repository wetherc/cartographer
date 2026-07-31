import { isNearQuota } from './SaveManager.js';

/**
 * What the GM is told after a write. The decisions are here rather than beside
 * the toast calls in `app/campaignActions.js` because most of them are about
 * *not* speaking: autosave writes every ten seconds while the campaign is dirty,
 * and an origin that is over quota degrades every one of those writes, so a
 * notice that fired per write would bury the one that mattered.
 */

/** Roughly what a browser gives one origin in localStorage. */
export const QUOTA_BYTES = 5 * 1024 * 1024;

/**
 * How much the footprint has to grow before the near-quota warning is repeated.
 * Ten percent, so trimming one image quiets it and adding a second one does not.
 */
export const RENOTIFY_GROWTH = 1.1;

/**
 * What a write's outcome means for the GM. A quota-full write is a failure the
 * caller must not reload onto. A write that landed the campaign but not its
 * images is still a save, since the map, the party, and every entity are stored,
 * but saying nothing would make the next load look like corruption.
 * @param {{ ok: boolean, assetsOk: boolean }} result
 * @returns {{ landed: boolean, message: string | null }}
 */
export function saveOutcome({ ok, assetsOk }) {
  if (!ok) {
    return {
      landed: false,
      message:
        'Save failed: browser storage is full. Export the campaign, then remove large handout images or custom tiles.',
    };
  }
  if (!assetsOk) {
    return {
      landed: true,
      message:
        'Saved, but browser storage is too full for the images: handout pictures were not stored.',
    };
  }
  return { landed: true, message: null };
}

/**
 * Which undo-history degradation a write caused. A write the log could not take
 * at all clears the history; one that had to evict its oldest steps shortens it.
 * An empty string is the healthy case.
 * @param {{ ok: boolean, evictedAll: boolean }} history
 * @returns {'' | 'shortened' | 'cleared'}
 */
export function historyLoss({ ok, evictedAll }) {
  if (!ok) return 'cleared';
  return evictedAll ? 'shortened' : '';
}

/**
 * The notice for a degradation, given the one last reported. Null covers both
 * quiet cases: nothing was lost, and the same loss is already on screen.
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
 * The Save button's tooltip: how much of the origin's quota the campaign spends.
 * Always shown, so the number is there before it becomes a problem.
 * @param {number} footprint bytes
 * @returns {string}
 */
export function footprintTooltip(footprint) {
  return `Browser storage: ${megabytes(footprint)} MB of about 5 MB used`;
}

/**
 * The near-quota warning, and the footprint to remember having warned at. Under
 * the threshold the remembered footprint resets to 0, so dropping below it and
 * climbing back over is reported again. Over it, the warning waits for material
 * growth rather than repeating per autosave.
 * @param {number} footprint bytes
 * @param {number} warnedAt the footprint of the last warning, 0 for none
 * @returns {{ message: string | null, warnedAt: number }}
 */
export function footprintWarning(footprint, warnedAt) {
  if (!isNearQuota(footprint)) return { message: null, warnedAt: 0 };
  if (footprint < warnedAt * RENOTIFY_GROWTH) return { message: null, warnedAt };
  return {
    message: `Warning: browser storage is at ${megabytes(footprint)} MB of its ~5 MB limit. Export a backup and trim large images.`,
    warnedAt: footprint,
  };
}

/** Bytes as the one-decimal megabyte figure both notices quote.
 * @param {number} bytes @returns {string} */
function megabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}
