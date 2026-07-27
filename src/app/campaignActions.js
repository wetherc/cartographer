import { buildBlankCampaign, buildExampleCampaign } from '../campaign/Campaigns.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmModal } from '../ui/Modal.js';
import { queueToastAfterReload } from '../ui/Toast.js';
import {
  buildState,
  isNearQuota,
  trySaveToLocalStorage,
  snapshotPersistedSave,
  undoHistory,
  downloadState,
  readStateFromFile,
  onExternalSave,
} from '../storage/SaveManager.js';
import { shouldAutosave, AUTOSAVE_POLL_MS } from '../storage/Autosave.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Campaign persistence and the header's campaign-management controls: the
 * dirty flag (Save-button indicator, leave-page guard, external-sync prompt),
 * Save / Undo / New / Load example / Export / Import, and the cross-tab
 * reload-on-save sync. Owns `dirty`; registers `setDirty` / `markDirty` on
 * `app.actions` for every other module's mutations.
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

  app.actions.setDirty = setDirty;
  app.actions.markDirty = markDirty;

  // Warn before closing/reloading a tab with unsaved changes. Intentional
  // reload flows (Undo/Import/replace) clear the flag first, so they stay quiet.
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  /**
   * Push the currently-persisted campaign onto the undo history ring, so the
   * next save/replace/import is reversible. No-op on a first run with no save.
   * Works on the raw persisted string — no parse/re-serialize of the campaign.
   *
   * A full origin makes the ring degrade rather than throw, which costs the GM
   * undo depth; report that instead of leaving Undo quietly single-step. The
   * notice fires on entering a degraded state and again if it worsens, but not
   * on every push: autosave pushes every ten seconds while dirty, and an
   * over-quota origin degrades every one of them.
   */
  function snapshotCurrentSave() {
    const { ok, evictedAll } = snapshotPersistedSave();
    const loss = !ok ? 'cleared' : evictedAll ? 'shortened' : '';
    if (!loss) {
      reportedHistoryLoss = '';
      return;
    }
    if (loss === reportedHistoryLoss) return;
    reportedHistoryLoss = loss;
    app.toasts.show(
      loss === 'cleared'
        ? 'Browser storage is full: the undo history was cleared, so the previous save can no longer be restored.'
        : 'Browser storage is full: the undo history was shortened to a single step.',
    );
  }

  /**
   * Persist a campaign, surfacing the outcome instead of failing silently: a
   * quota-full write gets an error toast (and reports failure so reload flows
   * can abort), a near-quota write gets a warning nudging the GM to trim
   * data:-URL images before saves start throwing.
   * @param {import('../types/storage.js').CampaignState} state
   * @returns {boolean} whether the write landed
   */
  function persistState(state) {
    const result = trySaveToLocalStorage(state);
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

  /** Assemble the live campaign into a serializable state for save/export. */
  function buildCurrentState() {
    const { state } = app;
    return buildState(
      app.grid,
      app.partyTracker.getPosition(),
      state.characters,
      state.encounters,
      state.travelog,
      state.quests,
      {
        clock: state.clock,
        npcs: state.npcs,
        handouts: state.handouts,
        bestiary: state.bestiary,
        splitParty: state.splitParty,
        combat: state.combat,
      },
    );
  }

  /**
   * Replace the whole campaign: persist the given one and reload, so every
   * module re-initializes from the same loadFromLocalStorage path a normal
   * page load takes (the same pattern the import flow uses).
   * @param {import('../campaign/Campaigns.js').Campaign} campaign
   * @param {string} [toastMessage]
   */
  function replaceCampaign(campaign, toastMessage = 'Campaign replaced.') {
    snapshotCurrentSave();
    const ok = persistState(
      buildState(
        campaign.grid,
        campaign.party,
        campaign.characters,
        campaign.encounters,
        campaign.travelog,
        campaign.quests,
        {
          clock: campaign.clock,
          npcs: campaign.npcs,
          handouts: campaign.handouts,
          bestiary: campaign.bestiary,
        },
      ),
    );
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
    // Snapshot the previous save first so Undo can step back to it.
    snapshotCurrentSave();
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
    snapshotCurrentSave();
    if (!persistState(buildCurrentState())) return;
    setDirty(false);
    app.toasts.show('Autosaved.');
  }

  // Undo restores the most recent snapshot (the state before the last save,
  // New, Load example, or Import) and reloads so every module re-initializes
  // from it — the same reload path those actions use.
  mustGetElement('undo-btn').addEventListener('click', async () => {
    const restored = undoHistory();
    if (!restored) {
      app.toasts.show('Nothing to undo.');
      return;
    }
    if (!persistState(restored)) return;
    queueToastAfterReload('Restored the previous save.');
    setDirty(false);
    location.reload();
  });

  // Cross-tab live sync (the minimum-viable multi-device story): when another
  // tab of the same origin writes a new save — e.g. a GM laptop driving a
  // second player-facing tab — reload so this tab re-initializes from it through
  // the normal load path. The browser never fires this for our own saves, so
  // there's no feedback loop. A tab with unsaved local changes is asked first
  // instead of having them silently discarded — but only once: after a decline,
  // further external saves (autosaves especially, which recur every couple of
  // minutes) show a quiet toast instead of a storm of modals, until this tab
  // saves and its state is canonical again.
  let syncPromptOpen = false;
  onExternalSave(async () => {
    if (!dirty) {
      location.reload();
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
    snapshotCurrentSave();
    if (!persistState(state)) return;
    queueToastAfterReload('Campaign imported.');
    setDirty(false);
    location.reload();
  });
}
