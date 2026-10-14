import { campaignFromLiveState } from '../campaign/Campaigns.js';
import { GM_LOCK_KEY, isLockActive, loadLock } from '../storage/GMLock.js';
import { clearPatch, onPlayerPatch, storedPatches, writePatch } from '../storage/PlayerPatch.js';
import { diffState } from '../storage/StateDiff.js';
import { applyOps } from '../storage/StateApply.js';
import { isGM } from '../view/ViewRole.js';
import { rehydrateCampaign } from './rehydrate.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/storage.js').DiffOp} DiffOp */

/**
 * Wires both ends of the player patch (see `storage/PlayerPatch.js`). A
 * player tab sends the ops of its own edits while a GM tab is open, and the
 * GM tab merges each patch into its live campaign and saves.
 *
 * The sender diffs against `base`, the state this tab last sent, saved, or
 * adopted, so each patch holds only the edits made since the one before.
 * With no GM tab open, nobody merges a patch, so `active` is false and the
 * player tab writes the whole campaign as a GM tab does.
 *
 * The GM tab merges only in Play and combat mode, for the reason that
 * `adoptExternalSave` gives: a re-hydrate in Build mode leaves the stroke
 * history and the tile inspector on nodes that are no longer live. A patch
 * that arrives in Build or Library mode waits in storage, and `mergeQueued`
 * applies every stored patch on the next mode change or role change. Each
 * patch applies on its own, in the order its tab wrote it, because
 * `applyOps` runs all removals before all insertions, and one combined list
 * would drop an entry that a later patch removed after an earlier one
 * inserted it.
 *
 * A merged patch stays in storage until `landed` reports a save of the
 * merged campaign. A reload (Undo, Redo, an adopted save) or a closed tab
 * before that save then loses nothing, because the next GM tab to enter
 * Play mode merges the stored patches again.
 * @param {AppContext} app
 * @param {{ buildCurrentState: () => CampaignState, onMerged: () => void }} hooks
 *   `onMerged` runs after a merge changed the live campaign, so the GM tab
 *   can save it.
 */
export function wirePlayerPatches(app, { buildCurrentState, onMerged }) {
  const tabId = Math.random().toString(36).slice(2, 10);
  let base = buildCurrentState();
  /** Keys of the patches merged into the live campaign but not yet saved. */
  const merged = new Set();

  const canMerge = () => app.state.mode === 'play' || app.state.mode === 'combat';

  /**
   * Merge one patch. A patch that cannot merge is removed, so it does not
   * fail again on every mode change.
   * @param {string} key
   * @param {DiffOp[]} ops
   */
  function merge(key, ops) {
    if (merged.has(key)) return;
    try {
      rehydrateCampaign(app, campaignFromLiveState(applyOps(buildCurrentState(), ops)));
    } catch (error) {
      console.warn('Could not merge a player tab edit.', error);
      clearPatch(key);
      return;
    }
    merged.add(key);
    onMerged();
  }

  function dropMerged() {
    for (const key of merged) clearPatch(key);
    merged.clear();
  }

  onPlayerPatch((ops, key) => {
    if (isGM(app.state.role) && canMerge()) merge(key, ops);
  });

  return {
    /** True when this tab sends patches instead of writing the save. */
    active: () => !isGM(app.state.role) && isLockActive(loadLock(GM_LOCK_KEY), Date.now()),
    /**
     * Send the edits made since the last patch. An edit that nets out to
     * nothing sends nothing.
     * @returns {boolean} whether the edits reached storage
     */
    send() {
      const next = buildCurrentState();
      const ops = diffState(base, next);
      if (ops.length > 0 && !writePatch(tabId, ops)) return false;
      base = next;
      // A tab that left the GM role sends its unsaved merges inside this patch,
      // so their own keys go, or the next GM tab would merge them twice.
      dropMerged();
      return true;
    },
    /** Record that the live campaign now matches storage. */
    rebase() {
      base = buildCurrentState();
    },
    /** Remove the merged patches, after a save of the live campaign landed. */
    landed: dropMerged,
    /**
     * Apply the stored patches that this tab has not merged: those that
     * arrived outside Play and combat mode, and those left by a GM tab that
     * reloaded or closed before its save landed.
     */
    mergeQueued() {
      if (!canMerge() || !isGM(app.state.role)) return;
      for (const { key, ops } of storedPatches()) merge(key, ops);
    },
  };
}
