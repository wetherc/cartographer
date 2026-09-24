import { campaignFromLiveState } from '../campaign/Campaigns.js';
import { GM_LOCK_KEY, isLockActive, loadLock } from '../storage/GMLock.js';
import { clearPatch, onPlayerPatch, writePatch } from '../storage/PlayerPatch.js';
import { applyOps, diffState } from '../storage/StateDiff.js';
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
 * that arrives in Build or Library mode waits in `queued`, and
 * `mergeQueued` applies it on the next mode change. Each patch applies on
 * its own, in arrival order, because `applyOps` runs all removals before all
 * insertions, and one combined list would drop an entry that a later patch
 * removed after an earlier one inserted it.
 * @param {AppContext} app
 * @param {{ buildCurrentState: () => CampaignState, onMerged: () => void }} hooks
 *   `onMerged` runs after a merge changed the live campaign, so the GM tab
 *   can save it.
 */
export function wirePlayerPatches(app, { buildCurrentState, onMerged }) {
  const tabId = Math.random().toString(36).slice(2, 10);
  let base = buildCurrentState();
  /** @type {DiffOp[][]} */
  const queued = [];

  const canMerge = () => app.state.mode === 'play' || app.state.mode === 'combat';

  /** @param {DiffOp[]} ops */
  function merge(ops) {
    try {
      rehydrateCampaign(app, campaignFromLiveState(applyOps(buildCurrentState(), ops)));
    } catch (error) {
      console.warn('Could not merge a player tab edit.', error);
      return;
    }
    onMerged();
  }

  onPlayerPatch((ops, key) => {
    if (!isGM(app.state.role)) return;
    clearPatch(key);
    if (canMerge()) merge(ops);
    else queued.push(ops);
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
      return true;
    },
    /** Record that the live campaign now matches storage. */
    rebase() {
      base = buildCurrentState();
    },
    /** Apply the patches that arrived outside Play and combat mode. */
    mergeQueued() {
      if (!canMerge() || !isGM(app.state.role)) return;
      for (const ops of queued.splice(0)) merge(ops);
    },
  };
}
