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
  downloadState,
  readStateFromFile,
  onExternalSave,
} from '../storage/SaveManager.js';
import {
  footprintTooltip,
  footprintWarning,
  historyLoss,
  historyLossMessage,
  saveOutcome,
} from '../storage/SaveNotices.js';
import { saveCampaign, undoCampaign, redoCampaign, historyDepth } from '../storage/HistoryLog.js';
import { shouldAutosave, AUTOSAVE_POLL_MS } from '../storage/Autosave.js';
import { followerMode } from '../view/CombatMode.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Wires campaign persistence and the header's campaign management controls.
 * These controls are the dirty flag (Save button indicator, leave-page
 * guard, external sync prompt), Save, Undo, New, Load example, Export,
 * Import, and the cross-tab reload-on-save sync. This function owns `dirty`
 * and registers `markDirty` on `app.actions` for every other module's
 * mutations.
 * @param {AppContext} app
 */
export function wireCampaignActions(app) {
  /** True when the live campaign has mutations that Save has not yet written. */
  let dirty = false;
  /** The time of the most recent mutation. This time drives the autosave idle window. */
  let lastMutationAt = 0;
  /** The time when the campaign first became dirty after the last save. */
  let dirtySince = 0;
  /** True when this tab declined an external save reload. This suppresses re-prompts. */
  let syncPromptDeclined = false;
  /** The footprint at the last near-quota warning. This stops the toast from repeating on every autosave. */
  let warnedFootprint = 0;
  /**
   * The last undo-history degradation reported. This stops the notice from
   * repeating on every autosave, because a full origin degrades on every push.
   * @type {'' | 'shortened' | 'cleared'}
   */
  let reportedHistoryLoss = '';
  /**
   * The autosave poll. It runs only while unsaved changes exist to write.
   * @type {ReturnType<typeof setInterval> | null}
   */
  let autosaveTimer = null;

  /**
   * Starts polling the autosave policy. The dirty flag controls this instead
   * of starting the poll at wiring time. A tab that never becomes dirty never
   * polls: this covers every player tab, because it is read-only and nothing
   * can mark it dirty, including a tab locked to the Player view. It also
   * covers a GM tab between saves. The poll also queries the DOM for an open
   * dialog, so running it in a tab that can never save wastes resources.
   */
  function startAutosavePolling() {
    if (autosaveTimer === null) autosaveTimer = setInterval(autosaveTick, AUTOSAVE_POLL_MS);
  }

  /** Stops the autosave poll. Nothing is left to write. */
  function stopAutosavePolling() {
    if (autosaveTimer !== null) clearInterval(autosaveTimer);
    autosaveTimer = null;
  }

  /** @param {boolean} next */
  function setDirty(next) {
    if (next && !dirty) dirtySince = Date.now();
    // After this tab saves or intentionally reloads, its state becomes
    // canonical again. A future external save then gets a fresh prompt.
    if (!next) syncPromptDeclined = false;
    dirty = next;
    // Autosave has no work while the campaign is clean. The poll runs only
    // between the first unsaved change and the write that clears it.
    if (dirty) startAutosavePolling();
    else stopAutosavePolling();
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
      saveBtn.classList.toggle('btn--attention', dirty);
      saveBtn.textContent = dirty ? 'Save •' : 'Save';
    }
  }

  /** True when a fight was running at the previous mutation. */
  let sawFight = app.state.combat !== null;

  /**
   * Marks the campaign as having unsaved changes. Every mutation calls this
   * function.
   *
   * A mutation made while a fight is running also flushes to storage right
   * away instead of waiting for the autosave window. A player watching the
   * fight on another tab, or a table display, sees the turn and the damage
   * only after a save lands. The ten-second idle window plus the five-second
   * poll made each turn arrive up to fifteen seconds late.
   */
  function markDirty() {
    lastMutationAt = Date.now();
    if (!dirty) setDirty(true);
    // The mutation that ends a fight leaves no fight behind to test for, but a
    // follower needs it most: a tab left on the combat screen has nothing to
    // show once the fight ends. The write that clears `combat` flushes on the
    // strength of the fight that was there a moment before.
    const fight = app.state.combat !== null;
    if (fight || sawFight) flushSoon();
    sawFight = fight;
  }

  app.actions.markDirty = markDirty;

  /**
   * The pending flush. This makes a burst of mutations (an attack stores the
   * target, logs the roll, and logs the damage) write only once.
   * @type {ReturnType<typeof setTimeout> | null}
   */
  let flushTimer = null;

  /** The wait time for a flush. This time is long enough to combine one action's writes. */
  const FLUSH_DELAY_MS = 250;

  /**
   * Writes the campaign as soon as the current action finishes writing to
   * state. This flush stays silent, unlike autosave: a fight writes several
   * times a minute, and a toast for each turn buries the log. An open
   * dialog is not a reason to wait, unlike for autosave, because everything
   * written here is already committed to state and nothing is mid-edit.
   */
  function flushSoon() {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (!dirty) return;
      if (!persistState(buildCurrentState())) return;
      setDirty(false);
    }, FLUSH_DELAY_MS);
  }

  // Warn before the tab closes or reloads with unsaved changes. Intentional
  // reload flows (Undo, Import, replace) clear the flag first and stay quiet.
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  /**
   * Reports what happened to the undo history. A full origin degrades the
   * history instead of throwing an error, and a silent shallow Undo is worse
   * than a reported one. The notice fires when the state first degrades, and
   * again if it worsens, but not on every write. Autosave writes every ten
   * seconds while the campaign is dirty, and an over-quota origin degrades on
   * every one of those writes.
   * @param {{ ok: boolean, evictedAll: boolean }} history
   */
  function reportHistory(history) {
    const loss = historyLoss(history);
    const message = historyLossMessage(loss, reportedHistoryLoss);
    reportedHistoryLoss = loss;
    if (message) app.toasts.show(message);
  }

  /**
   * Shows the outcome of a write instead of failing silently. A quota-full
   * write gets an error toast and reports failure, so reload flows can stop.
   * A near-quota write gets a warning that tells the GM to trim data:-URL
   * images before saves start to fail.
   *
   * Image payloads are stored apart from the campaign, so a full origin can
   * lose them while the campaign itself still lands. This reports as a save,
   * because it is one: the map, the party, and every entity are stored. The
   * GM must know the pictures are not stored, or a later load looks like
   * corruption.
   * @param {{ ok: boolean, assetsOk: boolean, footprint: number }} result
   * @returns {boolean} whether the write landed
   */
  function reportSave(result) {
    const { landed, message } = saveOutcome(result);
    if (message) app.toasts.show(message);
    if (!landed) return false;
    reportFootprint(result.footprint);
    return true;
  }

  /**
   * Persists a campaign and records the history step that produced it, and
   * reports both outcomes. The step is recorded after the campaign write. A
   * failed write then leaves the history describing exactly what is stored.
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
   * Greys out Undo and Redo when there is nothing in that direction. This
   * makes the depth of the history visible instead of something the GM finds
   * by clicking. Both buttons keep their handler's no-op message as a
   * backstop, because another tab can save between a refresh and a click.
   */
  function refreshHistoryButtons() {
    const { undo, redo } = historyDepth();
    const undoBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('undo-btn'));
    const redoBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('redo-btn'));
    if (undoBtn) undoBtn.disabled = undo === 0;
    if (redoBtn) redoBtn.disabled = redo === 0;
  }

  /**
   * Shows how much of the origin's storage quota is spent. This always
   * appears on the Save button's tooltip, and as a toast once the footprint
   * passes the warning threshold. The toast repeats only after the footprint
   * grows by a real amount. Autosave writes every ten seconds while the
   * campaign is dirty, and a simple threshold check otherwise nags on
   * every write.
   * @param {number} footprint
   */
  function reportFootprint(footprint) {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.title = footprintTooltip(footprint);
    const warning = footprintWarning(footprint, warnedFootprint);
    warnedFootprint = warning.warnedAt;
    if (warning.message) app.toasts.show(warning.message);
  }

  /**
   * Builds the live campaign into a state that can serialize for save or
   * export. The whole of `state` goes in, so `buildState` persists a new
   * top-level field as soon as it knows about it. This function adds the two
   * fields the app tracks outside `state`: the grid and the party's position.
   */
  function buildCurrentState() {
    return buildState({
      ...app.state,
      grid: app.grid,
      party: app.partyTracker.getPosition(),
    });
  }

  /**
   * Replaces the whole campaign. This persists the given campaign and
   * reloads, so every module re-initializes from the same
   * loadFromLocalStorage path that a normal page load takes. The import flow
   * uses the same pattern.
   * @param {import('../campaign/Campaigns.js').Campaign} campaign
   * @param {string} [toastMessage]
   */
  function replaceCampaign(campaign, toastMessage = 'Campaign replaced.') {
    const ok = persistState(buildState(campaign));
    if (!ok) return; // The error toast already explained the failure. Reloading here would use a stale state.
    queueToastAfterReload(toastMessage);
    setDirty(false); // This reload is intentional and must not trip the beforeunload guard.
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

  // Autosave polls the pure policy and writes through the same snapshot-then-
  // save path as the Save button. It fires once the GM pauses editing, or
  // once changes sit unsaved past the hard cap. It fires only while the
  // campaign is dirty, so an idle table does not rewrite the save, and
  // follower tabs see nothing.
  function autosaveTick() {
    const now = Date.now();
    if (!shouldAutosave({ dirty, now, lastMutationAt, dirtySince })) return;
    // Skip autosave under an open dialog. The GM is mid-edit, and a modal's
    // pending form values are not yet in the state.
    if (document.querySelector('dialog[open]')) return;
    if (!persistState(buildCurrentState())) return;
    setDirty(false);
    app.toasts.show('Autosaved.');
  }

  // Undo and Redo walk the recorded history one step at a time. A step is one
  // save, New, Load example, or Import. Both reload so every module
  // re-initializes from the restored state, the same reload path those actions
  // use. Both persist through the history log instead of `persistState`,
  // because stepping the cursor is not an edit. Recording it as an edit
  // pushes the inverse of the undo and leaves Undo toggling between two
  // states forever.
  /**
   * @param {() => { save: Parameters<typeof reportSave>[0] } | null} apply
   * @param {string} nothingToDo
   * @param {string} restored
   */
  function stepHistory(apply, nothingToDo, restored) {
    const step = apply();
    if (!step) {
      // Nothing exists in that direction, or the log was unreadable and got
      // dropped. Either way, nothing exists to restore, and the campaign stands.
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

  // Redo is reachable only right after an Undo. Saving from a stepped-back
  // cursor is a new edit, and it drops everything ahead of it.
  mustGetElement('redo-btn').addEventListener('click', () => {
    stepHistory(redoCampaign, 'Nothing to redo.', 'Reapplied the undone change.');
  });

  refreshHistoryButtons();

  // This is cross-tab live sync, the minimum multi-device setup. When another
  // tab of the same origin writes a new save, for example a GM laptop that
  // drives a second player-facing tab, this tab takes that campaign as its
  // own. The browser never fires this event for its own saves, so no feedback
  // loop can occur. Autosave keeps a follower current while the GM plays, so
  // these writes are adopted instead of filtered out. What changed is that
  // adopting a write no longer costs a page load. A tab with unsaved local
  // changes is asked first, instead of having them silently discarded, but
  // only once. After a decline, further external saves, autosaves especially,
  // which recur every few minutes, show a quiet toast instead of a storm of
  // modals. This continues until this tab saves and its state becomes
  // canonical again.
  /**
   * Takes another tab's save without reloading the page. This reads the save
   * through the ordinary load path and writes it over the live campaign. A
   * reload costs this tab its scroll position, its open panel, the map's
   * pan and zoom, and anything staged in the dice tray, on every ten seconds
   * of GM editing.
   *
   * This applies only in Play mode and combat mode. Build mode carries
   * authoring state that a re-hydrate leaves pointing at a world that no
   * longer exists: the stroke history holds pre-stroke nodes by reference, and
   * the tile inspector holds a tile from one of them. Library mode returns
   * to Play with stale panels. Both modes, and any failure to adopt the
   * campaign, fall back to the reload this function replaces, so the worst
   * case matches the previous behavior. Combat mode holds nothing but a
   * projection of the fight, which is exactly what the save carries.
   * Reloading a tab that watches a fight was the worst version of this
   * problem: mode is per-tab and never restored, so the tab returned to the
   * map, and someone had to reopen the fight on every turn.
   *
   * `followerMode` decides whether the tab then moves between Play and combat.
   * @returns {boolean} whether the tab re-hydrated instead of reloading
   */
  function adoptExternalSave() {
    if (app.state.mode !== 'play' && app.state.mode !== 'combat') return false;
    const hadFight = app.state.combat !== null;
    try {
      rehydrateCampaign(app, loadInitialCampaign());
    } catch (error) {
      console.error('Could not adopt the campaign another tab saved; reloading.', error);
      return false;
    }
    const next = followerMode(app.state.mode, { hadFight, hasFight: app.state.combat !== null });
    if (next) app.actions.setMode(next);
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
    // Clear the input before anything else can fail. A file input fires
    // `change` only when the selection differs from the current value. If the
    // value stays set, re-picking the same file becomes a silent no-op,
    // including the retry a GM makes after a failed import.
    importInput.value = '';
    if (!file) return;
    /** @type {import('../types/storage.js').CampaignState} */
    let state;
    try {
      state = await readStateFromFile(file);
    } catch {
      // No data was written yet, so a plain toast states the fact.
      app.toasts.show('That file is not a readable campaign JSON.');
      return;
    }
    // This is the simplest correct way to apply an imported campaign. It
    // persists the campaign, then reloads so every module re-initializes from
    // the same loadFromLocalStorage path that a normal page load takes. This
    // avoids re-wiring every closure above.
    if (!persistState(state)) return;
    queueToastAfterReload('Campaign imported.');
    setDirty(false);
    location.reload();
  });
}
