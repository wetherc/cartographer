import {
  buildBlankCampaign,
  buildExampleCampaign,
  loadInitialCampaign,
} from '../campaign/Campaigns.js';
import { rehydrateCampaign } from './rehydrate.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmModal } from '../ui/Modal.js';
import { queueToastAfterReload } from '../ui/Toast.js';
import {
  buildState,
  isNearQuota,
  downloadState,
  readStateFromFile,
  onExternalSave,
} from '../storage/SaveManager.js';
import { saveCampaign, undoCampaign, redoCampaign, historyDepth } from '../storage/HistoryLog.js';
import { shouldAutosave, AUTOSAVE_POLL_MS } from '../storage/Autosave.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Campaign persistence and the header's campaign-management controls: the
 * dirty flag (Save-button indicator, leave-page guard, external-sync prompt),
 * Save / Undo / New / Load example / Export / Import, and the cross-tab
 * reload-on-save sync. Owns `dirty`; registers `markDirty` on `app.actions` for
 * every other module's mutations.
 * @param {AppContext} app
 */
export function wireCampaignActions(app) {
  /** Whether the live campaign has mutations not yet written by Save. */
  let dirty = false;
  /** When the most recent mutation happened, driving the autosave idle window. */
  let lastMutationAt = 0;
  /** When the campaign first became dirty after the last save. */
  let dirtySince = 0;
  /** Whether this tab declined an external-save reload; suppresses re-prompts. */
  let syncPromptDeclined = false;
  /** Footprint at the last near-quota warning, so the toast doesn't repeat per autosave. */
  let warnedFootprint = 0;
  /**
   * Which undo-history degradation was last reported, so the notice doesn't
   * repeat per autosave while a full origin degrades every push.
   * @type {'' | 'shortened' | 'cleared'}
   */
  let reportedHistoryLoss = '';
  /**
   * The autosave poll, live only while there are unsaved changes to write.
   * @type {ReturnType<typeof setInterval> | null}
   */
  let autosaveTimer = null;

  /**
   * Begin polling the autosave policy. Driven by the dirty flag rather than
   * started once at wiring time: a tab that never becomes dirty never polls,
   * which covers every player tab (read-only, so nothing can mark it dirty)
   * including one locked to the Player view, and a GM tab between saves. The
   * poll also queries the DOM for an open dialog, so leaving it running in a
   * tab that can never save was pure overhead.
   */
  function startAutosavePolling() {
    if (autosaveTimer === null) autosaveTimer = setInterval(autosaveTick, AUTOSAVE_POLL_MS);
  }

  /** Stop the autosave poll; nothing is left to write. */
  function stopAutosavePolling() {
    if (autosaveTimer !== null) clearInterval(autosaveTimer);
    autosaveTimer = null;
  }

  /** @param {boolean} next */
  function setDirty(next) {
    if (next && !dirty) dirtySince = Date.now();
    // Once this tab saves (or intentionally reloads), its state is canonical
    // again, so a future external save deserves a fresh prompt.
    if (!next) syncPromptDeclined = false;
    dirty = next;
    // Autosave has nothing to do while the campaign is clean, so the poll only
    // runs between the first unsaved change and the write that clears it.
    if (dirty) startAutosavePolling();
    else stopAutosavePolling();
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
      saveBtn.classList.toggle('btn--attention', dirty);
      saveBtn.textContent = dirty ? 'Save •' : 'Save';
    }
  }

  /** Mark the campaign as having unsaved changes. Called from every mutation. */
  function markDirty() {
    lastMutationAt = Date.now();
    if (!dirty) setDirty(true);
  }

  app.actions.markDirty = markDirty;

  // Warn before closing/reloading a tab with unsaved changes. Intentional
  // reload flows (Undo/Import/replace) clear the flag first, so they stay quiet.
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  /**
   * Report what became of the undo history, since a full origin degrades it
   * rather than throwing and Undo silently becoming shallow is worse than being
   * told. The notice fires on entering a degraded state and again if it worsens,
   * but not on every write: autosave writes every ten seconds while dirty, and an
   * over-quota origin degrades every one of them.
   * @param {{ ok: boolean, evictedAll: boolean }} history
   */
  function reportHistory({ ok, evictedAll }) {
    const loss = !ok ? 'cleared' : evictedAll ? 'shortened' : '';
    if (!loss) {
      reportedHistoryLoss = '';
      return;
    }
    if (loss === reportedHistoryLoss) return;
    reportedHistoryLoss = loss;
    app.toasts.show(
      loss === 'cleared'
        ? 'Browser storage is full: the undo history was cleared, so this change can no longer be undone.'
        : 'Browser storage is full: the oldest undo steps were dropped.',
    );
  }

  /**
   * Surface the outcome of a write instead of failing silently: a quota-full
   * write gets an error toast (and reports failure so reload flows can abort), a
   * near-quota write gets a warning nudging the GM to trim data:-URL images
   * before saves start throwing.
   *
   * Image payloads are stored apart from the campaign, so a full origin can lose
   * them while the campaign itself lands. That reports as a save, because it is
   * one — the map, the party, and every entity are stored — but the GM has to be
   * told the pictures are not, or a later load looks like corruption.
   * @param {{ ok: boolean, assetsOk: boolean, footprint: number }} result
   * @returns {boolean} whether the write landed
   */
  function reportSave(result) {
    if (result.ok && !result.assetsOk) {
      app.toasts.show(
        'Saved, but browser storage is too full for the images: handout pictures were not stored.',
      );
    }
    if (!result.ok) {
      app.toasts.show(
        'Save failed: browser storage is full. Export the campaign, then remove large handout images or custom tiles.',
      );
      return false;
    }
    reportFootprint(result.footprint);
    return true;
  }

  /**
   * Persist a campaign and record the history step that produced it, reporting
   * both outcomes. The step is recorded after the campaign write, so a failed
   * write leaves the history describing exactly what is stored.
   * @param {import('../types/storage.js').CampaignState} state
   * @returns {boolean} whether the write landed
   */
  function persistState(state) {
    const result = saveCampaign(state);
    if (!reportSave(result)) return false;
    reportHistory(result.history);
    refreshHistoryButtons();
    return true;
  }

  /**
   * Grey out Undo and Redo when there is nothing in that direction, so the
   * history's depth is visible rather than something the GM discovers by
   * clicking. Both keep their handlers' no-op message as a backstop: another tab
   * can save between a refresh and a click.
   */
  function refreshHistoryButtons() {
    const { undo, redo } = historyDepth();
    const undoBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('undo-btn'));
    const redoBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('redo-btn'));
    if (undoBtn) undoBtn.disabled = undo === 0;
    if (redoBtn) redoBtn.disabled = redo === 0;
  }

  /**
   * Surface how much of the origin's storage quota is spent: always on the Save
   * button's tooltip, and as a toast once past the warning threshold. The toast
   * repeats only after the footprint has grown materially, because autosave
   * writes every ten seconds while the campaign is dirty and a threshold that
   * fires correctly would otherwise nag on every one of them.
   * @param {number} footprint
   */
  function reportFootprint(footprint) {
    const mb = footprint / (1024 * 1024);
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.title = `Browser storage: ${mb.toFixed(1)} MB of about 5 MB used`;
    if (!isNearQuota(footprint)) {
      // Back under the threshold (the GM trimmed, or another tab did): forget the
      // last warning so crossing it again is reported.
      warnedFootprint = 0;
      return;
    }
    if (footprint < warnedFootprint * 1.1) return;
    warnedFootprint = footprint;
    app.toasts.show(
      `Warning: browser storage is at ${mb.toFixed(1)} MB of its ~5 MB limit. Export a backup and trim large images.`,
    );
  }

  /**
   * Assemble the live campaign into a serializable state for save/export. The
   * whole of `state` goes in, so a new top-level field is persisted as soon as
   * `buildState` knows about it; the two fields the app tracks outside `state`
   * (the grid and the party's position) are added here.
   */
  function buildCurrentState() {
    return buildState({
      ...app.state,
      grid: app.grid,
      party: app.partyTracker.getPosition(),
    });
  }

  /**
   * Replace the whole campaign: persist the given one and reload, so every
   * module re-initializes from the same loadFromLocalStorage path a normal
   * page load takes (the same pattern the import flow uses).
   * @param {import('../campaign/Campaigns.js').Campaign} campaign
   * @param {string} [toastMessage]
   */
  function replaceCampaign(campaign, toastMessage = 'Campaign replaced.') {
    const ok = persistState(buildState(campaign));
    if (!ok) return; // the error toast already explained; don't reload onto stale state
    queueToastAfterReload(toastMessage);
    setDirty(false); // intentional reload; don't trip the beforeunload guard
    location.reload();
  }

  mustGetElement('new-btn').addEventListener('click', async () => {
    const ok = await confirmModal(
      'Start a new blank campaign? The current campaign is replaced, including anything saved.',
      { danger: true, confirmLabel: 'New campaign' },
    );
    if (ok) replaceCampaign(buildBlankCampaign(), 'Started a new blank campaign.');
  });

  mustGetElement('example-btn').addEventListener('click', async () => {
    const ok = await confirmModal(
      'Load the example campaign? The current campaign is replaced, including anything saved.',
      { danger: true, confirmLabel: 'Load example' },
    );
    if (ok) replaceCampaign(buildExampleCampaign(app.palette), 'Loaded the example campaign.');
  });

  mustGetElement('save-btn').addEventListener('click', () => {
    if (!persistState(buildCurrentState())) return;
    setDirty(false);
    app.toasts.show('Campaign saved.');
  });

  // Autosave: poll the pure policy and write through the same snapshot-then-
  // save path as the Save button once the GM pauses editing (or changes have
  // sat unsaved past the hard cap). Only ever fires while dirty, so an idle
  // table doesn't rewrite the save — and follower tabs see nothing.
  function autosaveTick() {
    const now = Date.now();
    if (!shouldAutosave({ dirty, now, lastMutationAt, dirtySince })) return;
    // Don't autosave under an open dialog: the GM is mid-edit, and a modal's
    // pending form values aren't in the state yet.
    if (document.querySelector('dialog[open]')) return;
    if (!persistState(buildCurrentState())) return;
    setDirty(false);
    app.toasts.show('Autosaved.');
  }

  // Undo and Redo walk the recorded history one step at a time — a step being one
  // save, New, Load example, or Import — and reload so every module
  // re-initializes from the restored state, the same reload path those actions
  // use. Both persist through the history log rather than `persistState`, because
  // stepping the cursor is not itself an edit: recording it would push the
  // inverse of the undo and leave Undo toggling between two states forever.
  /**
   * @param {() => { save: Parameters<typeof reportSave>[0] } | null} apply
   * @param {string} nothingToDo
   * @param {string} restored
   */
  function stepHistory(apply, nothingToDo, restored) {
    const step = apply();
    if (!step) {
      // Nothing in that direction, or the log turned out to be unreadable and was
      // dropped. Either way there is nothing to restore and the campaign stands.
      refreshHistoryButtons();
      app.toasts.show(nothingToDo);
      return;
    }
    if (!reportSave(step.save)) return;
    queueToastAfterReload(restored);
    setDirty(false);
    location.reload();
  }

  mustGetElement('undo-btn').addEventListener('click', () => {
    stepHistory(undoCampaign, 'Nothing to undo.', 'Restored the previous save.');
  });

  // Redo is only reachable straight after an Undo: saving from a stepped-back
  // cursor is a new edit, which drops everything ahead of it.
  mustGetElement('redo-btn').addEventListener('click', () => {
    stepHistory(redoCampaign, 'Nothing to redo.', 'Reapplied the undone change.');
  });

  refreshHistoryButtons();

  // Cross-tab live sync (the minimum-viable multi-device story): when another
  // tab of the same origin writes a new save — e.g. a GM laptop driving a
  // second player-facing tab — this tab takes that campaign as its own. The
  // browser never fires this for our own saves, so there's no feedback loop.
  // Autosave is what keeps a follower current while the GM plays, so these writes
  // are adopted rather than filtered out; what changed is that adopting one no
  // longer costs a page load. A tab with unsaved local changes is asked first
  // instead of having them silently discarded — but only once: after a decline,
  // further external saves (autosaves especially, which recur every couple of
  // minutes) show a quiet toast instead of a storm of modals, until this tab
  // saves and its state is canonical again.
  /**
   * Take another tab's save without reloading the page: read it through the
   * ordinary load path and write it over the live campaign. A reload would cost
   * this tab its scroll position, its open panel, the map's pan and zoom, and
   * anything staged in the dice tray, every ten seconds of GM editing.
   *
   * Only in Play mode. Build mode carries authoring state a re-hydrate would leave
   * pointing at a world that is gone — the stroke history holds pre-stroke nodes by
   * reference, the tile inspector holds a tile of one of them — and Library mode
   * would come back to Play with stale panels. Both, and any failure to adopt the
   * campaign at all, fall back to the reload this replaces, so the worst case is
   * the behavior that was already there.
   * @returns {boolean} whether the tab re-hydrated instead of reloading
   */
  function adoptExternalSave() {
    if (app.state.mode !== 'play') return false;
    try {
      rehydrateCampaign(app, loadInitialCampaign());
    } catch (error) {
      console.error('Could not adopt the campaign another tab saved; reloading.', error);
      return false;
    }
    refreshHistoryButtons();
    return true;
  }

  let syncPromptOpen = false;
  onExternalSave(async () => {
    if (!dirty) {
      if (!adoptExternalSave()) location.reload();
      return;
    }
    if (syncPromptOpen) return;
    if (syncPromptDeclined) {
      app.toasts.show(
        'Another tab saved again. Save here to overwrite it, or reload to take its version.',
      );
      return;
    }
    syncPromptOpen = true;
    const ok = await confirmModal(
      'Another tab saved this campaign. Reload to match it? Your unsaved changes here are discarded.',
      { danger: true, confirmLabel: 'Reload' },
    );
    syncPromptOpen = false;
    if (ok) {
      setDirty(false);
      location.reload();
    } else {
      syncPromptDeclined = true;
    }
  });

  mustGetElement('export-btn').addEventListener('click', () => {
    downloadState(buildCurrentState());
    app.toasts.show('Campaign exported.');
  });

  const importInput = /** @type {HTMLInputElement} */ (mustGetElement('import-input'));
  mustGetElement('import-btn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    // Clear the input before anything else can fail: a file input only fires
    // `change` when the selection differs from its current value, so leaving the
    // value set makes re-picking the same file a silent no-op — including the
    // retry a GM reaches for after a failed import.
    importInput.value = '';
    if (!file) return;
    /** @type {import('../types/storage.js').CampaignState} */
    let state;
    try {
      state = await readStateFromFile(file);
    } catch {
      // Nothing has been written, so this only needs saying, not acknowledging.
      app.toasts.show('That file is not a readable campaign JSON.');
      return;
    }
    // Simplest correct way to apply an imported campaign: persist it, then
    // reload so every module re-initializes from the same loadFromLocalStorage
    // path a normal page load takes, rather than re-wiring every closure above.
    if (!persistState(state)) return;
    queueToastAfterReload('Campaign imported.');
    setDirty(false);
    location.reload();
  });
}
