import { mustGetElement } from '../ui/dom.js';
import { runStepsWhenIdle } from '../util/idle.js';
import { setTip } from '../ui/Tooltip.js';
import { buildState, packState, warmPackSteps } from '../storage/SaveManager.js';
import {
  footprintTooltip,
  footprintWarning,
  historyLoss,
  historyLossMessage,
  saveOutcome,
} from '../storage/SaveNotices.js';
import { saveCampaign } from '../storage/HistoryLog.js';
import { shouldAutosave, AUTOSAVE_POLL_MS } from '../storage/Autosave.js';
import { isGM } from '../view/ViewRole.js';
import { saveStatusText } from '../view/SaveStatus.js';
import { wirePlayerPatches } from './playerPatches.js';
import { savesHeld } from '../storage/ShortenedLoad.js';
import { confirmSaveWhileHeld } from './shortenedLoadPrompts.js';
import { mirrorActive } from '../storage/AssetMirror.js';
import { createAssetWait } from './assetWait.js';
import { wireExternalSaves } from './externalSaves.js';
import { refreshHistoryButtons, wireHistorySteps } from './historySteps.js';
import { wireReplaceActions } from './replaceActions.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Wires campaign persistence: the dirty flag (Save button indicator and
 * leave-page guard), Save, autosave, and the combat flush. This function
 * owns `dirty` and registers `markDirty` on `app.actions` for every other
 * module's mutations. It wires the modules beside it with the parts of that
 * state they read: `externalSaves.js` for another tab's saves,
 * `historySteps.js` for Undo and Redo, and `replaceActions.js` for New,
 * Load example, Export, and Import.
 * @param {AppContext} app
 */
export function wireCampaignActions(app) {
  /** True when the live campaign has mutations that Save has not yet written. */
  let dirty = false;
  /** The time of the most recent mutation. This time drives the autosave idle window. */
  let lastMutationAt = 0;
  /** The time when the campaign first became dirty after the last save. */
  let dirtySince = 0;
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
   * True after a write failed on a full origin, until the next mutation.
   * Autosave does not retry in that time. The same write fails again, and
   * each attempt packs, diffs, and stringifies the whole campaign every five
   * seconds.
   */
  let waitForMutation = false;
  /** True once an automatic write reported a failure. A later automatic failure stays quiet until a write lands. */
  let failureShown = false;
  /**
   * The saves that wait on an image put (`app/assetWait.js`). The campaign
   * stays dirty while one waits, so the leave-page guard still asks. A page
   * that closes then keeps its previous save, because an unload cannot wait
   * for the put.
   */
  const assetWait = createAssetWait();

  /**
   * Starts polling the autosave policy. The dirty flag controls this instead
   * of starting the poll at wiring time. A tab that never becomes dirty never
   * polls: this covers a spectator tab and a GM tab between saves. A player
   * tab becomes dirty too, because a dice roll, a sheet action, or a token
   * move changes the campaign. With no GM tab open, its writes go through
   * the same check against another tab's save as the GM's. The poll also
   * queries the DOM for an open dialog, so running it in a tab that can
   * never save wastes resources.
   */
  function startAutosavePolling() {
    if (autosaveTimer === null) autosaveTimer = setInterval(autosaveTick, AUTOSAVE_POLL_MS);
  }

  /** Stops the autosave poll. Nothing is left to write. */
  function stopAutosavePolling() {
    if (autosaveTimer !== null) clearInterval(autosaveTimer);
    autosaveTimer = null;
  }

  /** @type {number | null} epoch ms of the last write from this tab, or null before one */
  let savedAt = null;
  const saveStatus = document.getElementById('save-status');
  function showSaveStatus() {
    if (saveStatus) saveStatus.textContent = saveStatusText(dirty, savedAt, Date.now());
  }
  // The minute count beside Save goes stale while the table plays, so it
  // refreshes twice a minute.
  setInterval(showSaveStatus, 30_000);
  showSaveStatus();

  /** @param {boolean} next */
  function setDirty(next) {
    if (next && !dirty) dirtySince = Date.now();
    if (!next) externalSaves.resetPrompts();
    dirty = next;
    // Autosave has no work while the campaign is clean. The poll runs only
    // between the first unsaved change and the write that clears it.
    if (dirty) startAutosavePolling();
    else stopAutosavePolling();
    if (!next) savedAt = Date.now();
    document.getElementById('save-btn')?.classList.toggle('btn--attention', dirty);
    showSaveStatus();
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
    waitForMutation = false;
    if (!dirty) setDirty(true);
    // The mutation that ends a fight leaves no fight behind to test for, but a
    // follower needs it most: a tab left on the combat screen has nothing to
    // show once the fight ends. The write that clears `combat` flushes on the
    // strength of the fight that was there a moment before.
    // A player tab's patch goes out at once too, so the GM tab merges it
    // before its own next save instead of up to fifteen seconds later.
    const fight = app.state.combat !== null;
    if (fight || sawFight || patches.active()) flushSoon();
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
      if (!dirty || !writeOut()) return;
      setDirty(false);
    }, FLUSH_DELAY_MS);
  }

  /** Flushes the campaign when it has changes left to write. */
  function flushIfDirty() {
    if (dirty) flushSoon();
  }

  /**
   * The write that autosave and the flush share. A player tab sends only its
   * own edit while a GM tab is open, and the GM tab merges and saves it. A
   * whole-campaign write from each tab loses one tab's change whenever both
   * change the campaign in the same window. Every other tab writes the
   * campaign, after the check against another tab's save. Nothing is written
   * while a shortened load keeps saves on hold (`storage/ShortenedLoad.js`),
   * or while a save waits on an image put and writes the latest state once
   * the put settles.
   * @returns {boolean} whether the write landed
   */
  function writeOut() {
    if (patches.active()) return patches.send();
    if (savesHeld()) return false;
    if (assetWait.waiting()) return false;
    if (externalSaves.externalWriteBlocks()) return false;
    return persistState(buildCurrentState(), true);
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
   *
   * An automatic write (autosave or the combat flush) reports a failure once.
   * The next automatic failures stay quiet until a write lands, because a
   * fight flushes after every action and each flush fails the same way.
   * @param {{ ok: boolean, assetsOk: boolean, footprint: number }} result
   * @param {boolean} [automatic]
   * @returns {boolean} whether the write landed
   */
  function reportSave(result, automatic = false) {
    const { landed, message } = saveOutcome(result, mirrorActive());
    const quiet = !landed && automatic && failureShown;
    if (message && !quiet) app.toasts.show(message, { level: landed ? 'status' : 'error' });
    failureShown = !landed && (automatic || failureShown);
    if (!landed) return false;
    reportFootprint(result.footprint);
    return true;
  }

  /**
   * Persists a campaign and records the history step that produced it, and
   * reports both outcomes. The step is recorded after the campaign write. A
   * failed write then leaves the history describing exactly what is stored.
   * A failed write also makes autosave wait for the next mutation.
   *
   * A save that adds an image writes nothing until the put commits, and
   * then `again` runs. By default that is a flush of the latest state.
   * @param {import('../types/storage.js').CampaignState} state
   * @param {boolean} [automatic] whether autosave or the combat flush asked for the write
   * @param {() => void} [again] the action to run once a pending image put settles
   * @returns {boolean} whether the write landed
   */
  function persistState(state, automatic = false, again = flushIfDirty) {
    const result = saveCampaign(state);
    if (assetWait.after(result.pending, again)) return false;
    if (!reportSave(result, automatic)) {
      waitForMutation = true;
      reportHistory(result.history);
      return false;
    }
    externalSaves.noteWritten(result.json, result.mark);
    patches.rebase();
    reportHistory(result.history);
    refreshHistoryButtons();
    return true;
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
    if (saveBtn) setTip(saveBtn, footprintTooltip(footprint, mirrorActive()));
    const warning = footprintWarning(footprint, warnedFootprint, mirrorActive());
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

  const patches = wirePlayerPatches(app, {
    buildCurrentState,
    onMerged: () => {
      markDirty();
      flushSoon();
      // A Player tab move can bring the party onto a hidden handout.
      app.actions.cueHandouts();
    },
  });
  app.actions.mergeQueuedPatches = patches.mergeQueued;

  const isDirty = () => dirty;
  const externalSaves = wireExternalSaves(app, { isDirty, setDirty, buildCurrentState, patches });
  wireHistorySteps(app, { isDirty, setDirty, reportSave, assetWait, buildCurrentState });
  wireReplaceActions(app, { buildCurrentState, setDirty, assetWait });

  // The pack caches key on the identity of a node and an entity, and a load
  // hands every one of them a fresh object. The first save of a session
  // therefore packs and encodes the whole world, which is about 110 ms at
  // 200 nodes, and the GM pays it on their first edit. Doing that pack now,
  // while nothing else is happening, fills the caches so the real save is a
  // lookup. The steps run a node or an entity at a time across idle
  // callbacks, because one 110 ms pack blocks input for its whole length. The
  // last step packs the live state whole, for the asset hoist and anything
  // edited since the steps were built. The results are thrown away: only the
  // caches matter. A Player view tab skips this. A spectator tab never
  // saves, and a bound player tab writes only after its own actions. This is work the app can skip, so a failure
  // here must not reach the session.
  if (isGM(app.state.role)) {
    /** @param {() => unknown} step */
    const quietly = (step) => () => {
      try {
        step();
      } catch {
        // The next real save reports its own failure, with a toast the GM sees.
      }
    };
    const steps = [...warmPackSteps(buildCurrentState()), () => packState(buildCurrentState())];
    runStepsWhenIdle(steps.map(quietly));
  }

  mustGetElement('save-btn').addEventListener('click', async () => {
    if (await confirmSaveWhileHeld()) saveNow();
  });

  /** The Save button's write, run again by itself when it waits on an image put. */
  function saveNow() {
    if (!persistState(buildCurrentState(), false, saveNow)) return;
    setDirty(false);
    app.toasts.show('Campaign saved.');
  }

  // Autosave polls the pure policy and writes through the same snapshot-then-
  // save path as the Save button. It fires once the GM pauses editing, or
  // once changes sit unsaved past the hard cap. It fires only while the
  // campaign is dirty, so an idle table does not rewrite the save, and
  // follower tabs see nothing. After a failed write it waits for the next
  // mutation instead of retrying the same write on every poll.
  function autosaveTick() {
    const now = Date.now();
    if (waitForMutation) return;
    if (!shouldAutosave({ dirty, now, lastMutationAt, dirtySince })) return;
    // Skip autosave under an open dialog. The GM is mid-edit, and a modal's
    // pending form values are not yet in the state.
    if (document.querySelector('dialog[open]')) return;
    if (!writeOut()) return;
    setDirty(false);
    app.toasts.show('Autosaved.');
  }
}
