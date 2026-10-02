import { campaignFromLiveState, loadInitialCampaign } from '../campaign/Campaigns.js';
import { rehydrateCampaign } from './rehydrate.js';
import { confirmModal } from '../ui/Modal.js';
import { STORAGE_KEY, onExternalSave, readSaveMark } from '../storage/SaveManager.js';
import {
  historyPosition,
  planAdoption,
  applyHistoryOps,
  adoptPersisted,
  persistedSave,
} from '../storage/HistoryLog.js';
import { markMovedOn, storageMovedOn } from '../storage/Autosave.js';
import { followerMode } from '../view/CombatMode.js';
import { isGM } from '../view/ViewRole.js';
import { fetchAssets, missingAssetKeys, withStoredAssets } from '../storage/AssetMirror.js';
import { refreshHistoryButtons } from './historySteps.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {ReturnType<typeof import('./playerPatches.js').wirePlayerPatches>} PlayerPatches */

/**
 * Wires cross-tab live sync, the minimum multi-device setup. When another
 * tab of the same origin writes a new save, for example a GM laptop that
 * drives a second player-facing tab, this tab takes that campaign as its
 * own without a page load. The browser never fires the storage event for a
 * tab's own saves, so no feedback loop can occur. Autosave keeps a follower
 * current while the GM plays, so these writes are adopted instead of
 * filtered out. A tab with unsaved local changes is asked first, but only
 * once. After a decline, further external saves (autosaves especially,
 * which recur every few minutes) show a quiet toast instead of a new modal
 * each time. This continues until this tab saves and its state becomes
 * canonical again.
 *
 * The module keeps the save this tab last matched in storage. Call this
 * before anything writes the campaign, because the first match is the save
 * the page loaded.
 * @param {AppContext} app
 * @param {{
 *   isDirty: () => boolean,
 *   setDirty: (next: boolean) => void,
 *   buildCurrentState: () => CampaignState,
 *   patches: PlayerPatches,
 * }} hooks
 * @returns {{
 *   externalWriteBlocks: () => boolean,
 *   noteWritten: (json: string, mark: string | null) => void,
 *   resetPrompts: () => void,
 * }} `noteWritten` records this tab's own landed write as the matched save,
 *   and `resetPrompts` runs when the campaign becomes clean.
 */
export function wireExternalSaves(app, { isDirty, setDirty, buildCurrentState, patches }) {
  /**
   * The history position of the state this tab keeps, recorded whenever the
   * live state matches the persisted save: at load, after this tab's own
   * save, and after adopting another tab's save. An external save whose
   * recorded delta is based exactly here is adopted by applying that delta
   * instead of re-reading the whole save.
   * @type {string | null}
   */
  let heldPosition = historyPosition();
  // The page loaded its save through the history cache, so the cache names
  // the string and the mark of that save. Taking the string from there
  // keeps one copy of it in this tab. With nothing cached, the mark is read
  // before the string, so a save that lands between the two reads has
  // removed the mark and cannot match it.
  const loaded = persistedSave();
  /**
   * The save mark of the save this tab last matched in storage, or null when
   * it is not known.
   * @type {string | null}
   */
  let heldMark = loaded ? loaded.mark : readSaveMark();
  /**
   * The save string this tab last matched in storage: the one it loaded,
   * wrote, or adopted. An automatic write checks storage against it first.
   * Every later value is the string object that the history cache keeps
   * (`adoptPersisted`, and the `json` of this tab's own save).
   * @type {string | null}
   */
  let heldSave = loaded ? loaded.raw : localStorage.getItem(STORAGE_KEY);
  /** True when this tab declined an external save reload. This suppresses re-prompts. */
  let syncPromptDeclined = false;
  /** True once this tab reported that autosave is paused. This stops the toast from repeating on every poll. */
  let pausedNoticeShown = false;
  let syncPromptOpen = false;

  /**
   * Adopt an external save by applying its recorded deltas to the live state
   * instead of re-reading the whole save. Every save writes its exact edit
   * as a delta beside the campaign, and `applyHistoryOps` copies only along the
   * op paths, so every node and entity the edits did not touch keeps its
   * identity by construction. The map caches stay warm, and the reconcile
   * inside `rehydrateCampaign` returns each untouched object at the first
   * comparison. This runs only when the log walks from this tab's held
   * state to the stored one (`planAdoption`). Everything else answers false,
   * and the caller re-reads the whole save.
   * @returns {boolean}
   */
  function adoptByDelta() {
    const plan = planAdoption(heldPosition, heldMark);
    if (plan.kind === 'current') return true;
    if (plan.kind !== 'delta') return false;
    try {
      const next = plan.steps.reduce(
        (state, ops) => applyHistoryOps(state, ops),
        buildCurrentState(),
      );
      rehydrateCampaign(app, campaignFromLiveState(next));
      return true;
    } catch (error) {
      console.warn('Could not apply the recorded delta; adopting the full save.', error);
      return false;
    }
  }

  /**
   * Takes another tab's save without reloading the page. This adopts the
   * save through `adoptByDelta` when the recorded delta chains from this
   * tab's held state, and re-reads the whole save through the ordinary load
   * path otherwise. Either way it writes the result over the live campaign.
   * A reload costs this tab its scroll position, its open panel, the map's
   * pan and zoom, and anything staged in the dice tray, on every ten seconds
   * of GM editing.
   *
   * This applies only in Play mode and combat mode. Build mode keeps
   * authoring state that a re-hydrate leaves pointing at a world that no
   * longer exists: the stroke history keeps pre-stroke nodes by reference,
   * and the tile inspector keeps a tile from one of them. Library mode
   * returns to Play with stale panels. Both modes, and any failure to adopt
   * the campaign, fall back to a page reload. Combat mode keeps nothing but
   * a projection of the fight, which is exactly what the save contains. Mode
   * is per-tab and never restored, so a reload of a tab that watches a fight
   * returns it to the map, and someone has to reopen the fight on every turn.
   *
   * `followerMode` decides whether the tab then moves between Play and combat.
   * @returns {boolean} whether the tab re-hydrated instead of reloading
   */
  function adoptExternalSave() {
    if (app.state.mode !== 'play' && app.state.mode !== 'combat') return false;
    const hadFight = app.state.combat !== null;
    try {
      if (!adoptByDelta()) rehydrateCampaign(app, loadInitialCampaign());
      heldPosition = historyPosition();
      ({ raw: heldSave, mark: heldMark } = adoptPersisted(buildCurrentState()));
      patches.rebase();
    } catch (error) {
      console.error('Could not adopt the campaign another tab saved; reloading.', error);
      return false;
    }
    const next = followerMode(app.state.mode, { hadFight, hasFight: app.state.combat !== null });
    if (next) app.actions.setMode(next);
    refreshHistoryButtons();
    showLateImages();
    return true;
  }

  /**
   * Reads the images that the stored save names and this tab's copy lacks,
   * then shows them. Another tab commits an image before it writes the save
   * that names it, so such a key was committed after this tab read IndexedDB
   * (`storage/AssetMirror.js`). Until the read finishes, the image draws as
   * a placeholder. The live state keeps the `asset:` key, so a later save
   * still names the stored image. The tab takes the images only when it
   * could still adopt a save: it has no unsaved change, it is in Play or
   * combat mode, and no newer save has arrived.
   */
  function showLateImages() {
    const raw = heldSave;
    const missing = missingAssetKeys(raw);
    if (!missing.length) return;
    void fetchAssets(missing).then((added) => {
      if (!added || isDirty() || heldSave !== raw) return;
      if (app.state.mode !== 'play' && app.state.mode !== 'combat') return;
      try {
        rehydrateCampaign(app, campaignFromLiveState(withStoredAssets(buildCurrentState())));
        ({ raw: heldSave, mark: heldMark } = adoptPersisted(buildCurrentState()));
        patches.rebase();
      } catch (error) {
        console.warn('Could not show the images another tab stored.', error);
      }
    });
  }

  // The boot reads IndexedDB before the stored save, so a save that another
  // tab wrote in between can name an image this tab has not read.
  showLateImages();

  /**
   * The way out of a declined reload. A player tab has no Save button, so it
   * can only reload.
   */
  function takeOrOverwrite() {
    return isGM(app.state.role)
      ? 'Save here to overwrite it, or reload to take its version.'
      : 'Reload to take its version.';
  }

  /**
   * Asks a tab with unsaved changes whether to take another tab's save. A
   * yes reloads, and a no keeps the changes here and pauses the automatic
   * writes until an explicit Save.
   */
  async function promptExternalSave() {
    syncPromptOpen = true;
    const ok = await confirmModal(
      'Another tab saved this campaign. Reload to match it? Your unsaved changes here are discarded.',
      { title: 'Reload from the other tab?', variant: 'danger', confirmLabel: 'Reload' },
    );
    syncPromptOpen = false;
    if (ok) {
      setDirty(false);
      location.reload();
    } else {
      syncPromptDeclined = true;
    }
  }

  /**
   * True when another tab wrote the campaign after this tab last matched
   * storage, so an automatic write here stops. Without the stop, a tab that
   * declined the reload prompt, or one that has not seen the other save yet,
   * writes its older copy over the other tab's roll, attack, or map edit.
   * The first stop asks the reload question, and a stop after a decline
   * says once that autosave is paused.
   * @returns {boolean}
   */
  function externalWriteBlocks() {
    const moved =
      markMovedOn(heldMark, readSaveMark()) ??
      storageMovedOn(heldSave, localStorage.getItem(STORAGE_KEY));
    if (!moved) return false;
    if (syncPromptOpen) return true;
    if (!syncPromptDeclined) {
      void promptExternalSave();
    } else if (!pausedNoticeShown) {
      pausedNoticeShown = true;
      app.toasts.show(`Autosave is paused because another tab saved. ${takeOrOverwrite()}`);
    }
    return true;
  }

  onExternalSave(() => {
    // A player tab sends its unsent edit first. The GM tab merges it, so the
    // tab adopts the save with nothing lost and needs no reload prompt.
    if (isDirty() && patches.active() && patches.send()) setDirty(false);
    if (!isDirty()) {
      if (!adoptExternalSave()) location.reload();
      return;
    }
    if (syncPromptOpen) return;
    if (syncPromptDeclined) {
      app.toasts.show(`Another tab saved again. ${takeOrOverwrite()}`);
      return;
    }
    void promptExternalSave();
  });

  return {
    externalWriteBlocks,
    noteWritten(json, mark) {
      heldSave = json;
      heldMark = mark;
      heldPosition = historyPosition();
    },
    // After this tab saves or intentionally reloads, its state becomes
    // canonical again. A future external save then gets a fresh prompt.
    resetPrompts() {
      syncPromptDeclined = false;
      pausedNoticeShown = false;
    },
  };
}
