import {
  buildBlankCampaign,
  buildExampleCampaign,
  isBlankCampaign,
} from '../campaign/Campaigns.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmModal } from '../ui/Modal.js';
import { queueToastAfterReload } from '../ui/Toast.js';
import { buildState } from '../storage/SaveManager.js';
import {
  downloadCampaignFile,
  readCampaignFromFile,
  libraryImportAction,
} from '../storage/CampaignFile.js';
import { loadCustomLibrary, saveCustomLibrary } from '../storage/LibraryStore.js';
import {
  historyLoss,
  historyLossMessage,
  replacePrompt,
  saveOutcome,
} from '../storage/SaveNotices.js';
import { replaceIsUndoable, saveCampaign } from '../storage/HistoryLog.js';
import { mirrorActive } from '../storage/AssetMirror.js';
import { confirmShortenedImport } from './shortenedLoadPrompts.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/** The confirm line of a replace that Undo can take back. */
const UNDO_NOTE = 'Undo in the header restores the current one.';
/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {ReturnType<typeof import('./assetWait.js').createAssetWait>} AssetWait */

/**
 * Wires the header controls that replace the live campaign (New, Load
 * example, Import) and Export, which writes the live campaign to a file.
 * @param {AppContext} app
 * @param {{
 *   buildCurrentState: () => CampaignState,
 *   setDirty: (next: boolean) => void,
 *   assetWait: AssetWait,
 * }} hooks
 */
export function wireReplaceActions(app, { buildCurrentState, setDirty, assetWait }) {
  /**
   * Persists a campaign that replaces the live one (New, Load example,
   * Import), then reloads, so every module re-initializes from the same
   * load path that a normal page load takes. The save and history notices
   * go into the queued toast, because a toast shown here disappears with
   * the page at once.
   * @param {import('../types/storage.js').CampaignState} state
   * @param {string} toastMessage
   */
  function persistAndReload(state, toastMessage) {
    const result = saveCampaign(state);
    if (assetWait.after(result.pending, () => persistAndReload(state, toastMessage))) return;
    const { landed, message } = saveOutcome(result, mirrorActive());
    if (!landed) {
      // Reloading here would read the stale save that is still stored.
      if (message) app.toasts.show(message, { level: 'error' });
      return;
    }
    const loss = historyLossMessage(historyLoss(result.history), '');
    queueToastAfterReload([toastMessage, message, loss].filter(Boolean).join(' '));
    setDirty(false); // This reload is intentional and must not trip the beforeunload guard.
    location.reload();
  }

  /**
   * True when the live campaign is the untouched blank one. A blank campaign
   * has nothing to lose, so a replace warning would only stand between a
   * first-run GM and the example or their own file.
   */
  function isBlank() {
    return isBlankCampaign(app.grid, app.navigator.getCurrentNode(), app.state.characters);
  }

  // A replace confirm needs the new campaign first, because whether Undo can
  // restore the current one depends on the size of both saves. The example
  // takes about 50 to 90 ms to build, so it is built once, before the
  // confirm, and the same state is saved after it.
  mustGetElement('new-btn').addEventListener('click', async () => {
    const state = buildState(buildBlankCampaign());
    const ok = await confirmModal(
      replacePrompt(
        'Start a new blank campaign? The current campaign is replaced, including anything saved.',
        replaceIsUndoable(state),
        UNDO_NOTE,
      ),
      { title: 'Start a new campaign?', variant: 'danger', confirmLabel: 'New campaign' },
    );
    if (ok) persistAndReload(state, 'Started a new blank campaign.');
  });

  mustGetElement('example-btn').addEventListener('click', async () => {
    const state = buildState(buildExampleCampaign(app.palette));
    const ok =
      isBlank() ||
      (await confirmModal(
        replacePrompt(
          'Load the example campaign? The current campaign is replaced, including anything saved.',
          replaceIsUndoable(state),
          UNDO_NOTE,
        ),
        { title: 'Load the example campaign?', variant: 'danger', confirmLabel: 'Load example' },
      ));
    if (ok) persistAndReload(state, 'Loaded the example campaign.');
  });

  mustGetElement('export-btn').addEventListener('click', () => {
    // The customs read fresh from their key at click time; the library
    // wiring saves them there on every edit.
    downloadCampaignFile(buildCurrentState(), loadCustomLibrary());
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
    /** @type {import('../types/library.js').CustomLibrary | null} */
    let library;
    try {
      ({ state, library } = await readCampaignFromFile(file));
    } catch {
      // No data was written yet, so a plain toast states the fact.
      app.toasts.show('That file is not a readable campaign JSON.', { level: 'error' });
      return;
    }
    // Any JSON record parses as a campaign, and one with no map nodes gives
    // the party and the map view nowhere to start.
    if (state.nodes.length === 0) {
      app.toasts.show('That file has no map, so it is not a campaign file.', { level: 'error' });
      return;
    }
    if (!(await confirmShortenedImport(state))) return;
    // The confirm comes after the read, so a file that is not a campaign
    // gets its error without a question first.
    const replace =
      isBlank() ||
      (await confirmModal(
        replacePrompt(
          'Import this campaign? It replaces the current campaign.',
          replaceIsUndoable(state),
          UNDO_NOTE,
        ),
        { title: 'Import this campaign?', variant: 'danger', confirmLabel: 'Import' },
      ));
    if (!replace) return;
    // A file with a bundled library adopts it into the browser's customs,
    // asking first when that would overwrite existing ones. A decline keeps
    // the browser library and still imports the campaign, the same outcome
    // as a file that carries no library.
    const action = libraryImportAction(library, loadCustomLibrary());
    let adopt = action === 'adopt';
    if (action === 'confirm') {
      adopt = await confirmModal(
        'This campaign file includes library customizations. Replace yours ' +
          'with them? Built-in defaults are unaffected.',
        { title: 'Replace your library?', variant: 'danger', confirmLabel: 'Replace' },
      );
    }
    if (adopt && library && !saveCustomLibrary(library)) {
      app.toasts.show('Storage is full. The campaign imports without its library.', {
        level: 'error',
      });
      adopt = false;
    }
    // The reload makes every module re-initialize from the same
    // loadFromLocalStorage path that a normal page load takes, including the
    // library wiring's fresh read of the customs written above.
    persistAndReload(state, adopt ? 'Campaign and library imported.' : 'Campaign imported.');
  });
}
