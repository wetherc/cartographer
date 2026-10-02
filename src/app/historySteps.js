import { mustGetElement } from '../ui/dom.js';
import { confirmModal } from '../ui/Modal.js';
import { queueToastAfterReload } from '../ui/Toast.js';
import { historyDepth, redoCampaign, undoCampaign } from '../storage/HistoryLog.js';
import { redoSummary, undoSummary } from '../storage/StepSummary.js';
import { keepViewForReload } from '../view/ReloadView.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {ReturnType<typeof import('./assetWait.js').createAssetWait>} AssetWait */
/** @typedef {import('../types/storage.js').CampaignState} CampaignState */

/** The tab strips of the page whose open tab a history step keeps. */
const TAB_STRIPS = [
  'sidebar-tabs',
  'sheet-tabs',
  'build-tabs',
  'build-encounter-tabs',
  'library-tabs',
];

/**
 * Greys out Undo and Redo when there is nothing in that direction. This
 * makes the depth of the history visible instead of something the GM finds
 * by clicking. Both buttons keep their handler's no-op message as a
 * backstop, because another tab can save between a refresh and a click.
 */
export function refreshHistoryButtons() {
  const { undo, redo } = historyDepth();
  const undoBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('undo-btn'));
  const redoBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('redo-btn'));
  if (undoBtn) undoBtn.disabled = undo === 0;
  if (redoBtn) redoBtn.disabled = redo === 0;
}

/**
 * Wires the header's Undo and Redo buttons (see the history log in
 * `docs/architecture/persistence.md`).
 * @param {AppContext} app
 * @param {{
 *   isDirty: () => boolean,
 *   setDirty: (next: boolean) => void,
 *   reportSave: (result: { ok: boolean, assetsOk: boolean, footprint: number }) => boolean,
 *   assetWait: AssetWait,
 *   buildCurrentState: () => CampaignState,
 * }} hooks `reportSave` shows the outcome of the restored write and answers
 *   whether it landed. `buildCurrentState` gives the campaign before the
 *   step, which the toast compares with the restored one.
 */
export function wireHistorySteps(
  app,
  { isDirty, setDirty, reportSave, assetWait, buildCurrentState },
) {
  // Undo and Redo walk the recorded history one step at a time. A step is one
  // save, New, Load example, or Import. Both reload so every module
  // re-initializes from the restored state, the same reload path those actions
  // use. Both persist through the history log instead of `persistState`,
  // because stepping the cursor is not an edit. Recording it as an edit
  // pushes the inverse of the undo and leaves Undo toggling between two
  // states forever.
  //
  // A step restores a saved state and reloads, so unsaved changes in this tab
  // are lost. While the campaign is dirty, the step asks first. A GM who
  // presses Undo to take back an unsaved paint stroke otherwise loses that
  // stroke and everything else since the last save, and the tab leaves Build.
  /**
   * @typedef {() => { save: import('../storage/SaveManager.js').SaveResult, state: CampaignState } | null} HistoryStep
   */
  /** @typedef {(before: CampaignState, after: CampaignState) => string} StepToast */
  /**
   * @param {HistoryStep} apply
   * @param {string} nothingToDo
   * @param {StepToast} restored the toast after the reload, naming what changed
   * @param {string} verb the confirm label, "Undo" or "Redo"
   */
  async function stepHistory(apply, nothingToDo, restored, verb) {
    if (
      isDirty() &&
      !(await confirmModal(
        `${verb} steps between saves. Your changes since the last save are discarded. Save first to keep them.`,
        { title: `${verb} and discard changes?`, variant: 'danger', confirmLabel: verb },
      ))
    ) {
      return;
    }
    runHistoryStep(apply, nothingToDo, restored);
  }

  /**
   * Takes one step and reloads onto it. A restored state takes its images
   * from the committed copy, so a step does not wait on a put. A step that
   * does wait writes nothing, and it runs again once the put settles.
   * @param {HistoryStep} apply
   * @param {string} nothingToDo
   * @param {StepToast} restored
   */
  function runHistoryStep(apply, nothingToDo, restored) {
    // The live state is still the campaign before the step, because the
    // step writes only to storage until the reload.
    const before = buildCurrentState();
    const step = apply();
    if (!step) {
      // Nothing exists in that direction, or the log was unreadable and got
      // dropped. Either way, nothing exists to restore, and the campaign stands.
      refreshHistoryButtons();
      app.toasts.show(nothingToDo);
      return;
    }
    const again = () => runHistoryStep(apply, nothingToDo, restored);
    if (assetWait.after(step.save.pending, again)) return;
    if (!reportSave(step.save)) return;
    queueToastAfterReload(restored(before, step.state));
    keepViewForReload(sessionStorage, {
      characterId: app.actions.getSelectedCharacterId(),
      mode: app.state.mode === 'combat' ? null : app.state.mode,
      fullSheet: document.body.classList.contains('sheet-full'),
      tabs: TAB_STRIPS.map(
        (id) => document.querySelector(`#${id} [role=tab][aria-selected="true"]`)?.id ?? '',
      ).filter(Boolean),
    });
    setDirty(false);
    location.reload();
  }

  mustGetElement('undo-btn').addEventListener('click', () => {
    void stepHistory(undoCampaign, 'Nothing to undo.', undoSummary, 'Undo');
  });

  // Redo is reachable only right after an Undo. Saving from a stepped-back
  // cursor is a new edit, and it drops everything ahead of it.
  mustGetElement('redo-btn').addEventListener('click', () => {
    void stepHistory(redoCampaign, 'Nothing to redo.', redoSummary, 'Redo');
  });

  refreshHistoryButtons();
}
