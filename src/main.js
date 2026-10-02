/**
 * This is the composition root. It loads the campaign, builds the shared
 * AppContext (engine objects, mutable campaign state, and the views/actions
 * registries the wiring modules fill in), then hands it to each src/app
 * wiring module in mount order. All cross-module references go through
 * `app` and are read at call time, so a module mounted early can call into
 * one mounted later.
 */
import { TilePalette } from './map/TilePalette.js';
import { loadInitialCampaignSafe } from './campaign/Campaigns.js';
import { mountToasts, flushQueuedToast } from './ui/Toast.js';
import { mountTooltips } from './ui/Tooltip.js';
import { alertModal } from './ui/Modal.js';
import { loadFailedMessage } from './storage/SaveNotices.js';
import { historyDepth } from './storage/HistoryLog.js';
import { wireCampaignActions } from './app/campaignActions.js';
import { wireMapView } from './app/mapWiring.js';
import { wireGenerateAction } from './app/generateAction.js';
import { wireParty } from './app/partyWiring.js';
import { takeReloadView } from './view/ReloadView.js';
import { wireEncounters } from './app/encounterWiring.js';
import { wireCombatScreen } from './app/combatWiring.js';
import { wireStory } from './app/storyWiring.js';
import { wireLibrary } from './app/libraryWiring.js';
import { wireSessionControls } from './app/sessionControls.js';
import { wireHeaderMenu } from './app/headerMenu.js';
import { wirePhoneViews } from './app/phoneViews.js';
import { wireShortcuts } from './app/shortcuts.js';
import { wireDiceTray } from './app/diceWiring.js';
import { maybeShowOnboarding } from './app/onboarding.js';
import { holdShortenedBoot } from './app/shortenedLoadPrompts.js';
import { openAssetMirror } from './storage/AssetMirror.js';
import { sightRadius } from './party/Sight.js';
import { openIndexedDbAssets } from './storage/IndexedDbAssets.js';

// Image payloads live in IndexedDB, and every reader of a stored campaign
// reads them from an in-memory copy (`storage/AssetMirror.js`). The copy is
// filled once, before the campaign loads, and nothing else waits here. The
// production bundle is an IIFE, which has no top-level await, so the rest of
// the boot runs in `start`.
void openAssetMirror(openIndexedDbAssets).then(start);

/** Load the campaign, build the AppContext, and mount every wiring module. */
function start() {
  const palette = new TilePalette();
  const {
    campaign: initial,
    navigator,
    partyTracker,
    failed: loadFailed,
    truncated,
  } = loadInitialCampaignSafe();
  const toasts = mountToasts(document.body, {
    anchor: () => document.querySelector('#breadcrumb-container .breadcrumb'),
    follow: [document.querySelector('header'), document.getElementById('breadcrumb-container')],
  });
  // One tooltip for the whole page. Its listeners are delegated, so a widget
  // built later gains a tooltip just by carrying the attribute `setTip` writes.
  mountTooltips(document.body);

  // The views/actions registries start empty. The wiring modules below fill
  // them in synchronously, before any user event can fire. The cast below
  // spares every call site an existence check it will never need. This is the
  // one place that asserts that invariant. A module that reads a registry
  // entry while wiring is still in progress must be ordered after the module
  // that puts it there. See the mount order below.
  const app = /** @type {import('./types/app.js').AppContext} */ (
    /** @type {unknown} */ ({
      palette,
      grid: initial.grid,
      navigator,
      partyTracker,
      toasts,
      state: {
        entryTiles: initial.entryTiles,
        characters: initial.characters,
        creatures: initial.creatures,
        travelog: initial.travelog,
        quests: initial.quests,
        clock: initial.clock,
        handouts: initial.handouts,
        bestiary: initial.bestiary,
        splitParty: initial.splitParty,
        combat: initial.combat,
        mode: 'play',
        // Role is per-tab (sessionStorage, not the tab-shared localStorage), so
        // a follower tab can be Player while the GM's tab is GM.
        role: sessionStorage.getItem('campaign-builder:role') || 'gm',
      },
      views: {},
      actions: {},
    })
  );

  // Fog clears farther on an outdoor map in daylight than at night.
  partyTracker.setSight((node) => sightRadius(node, app.state.clock));

  // The order below is a dependency order, not a preference. Almost every
  // cross-module reference resolves when an event fires, long after all of
  // this has run. Three modules reach another module's registrations while
  // they are still mounting, so those registrations must be in place first.
  wireCampaignActions(app); // dirty flag + header campaign controls; provides markDirty
  // The library loads before anything that offers its presets (the item form,
  // the enemy gear pickers), so the merged lists are live from the first open.
  wireLibrary(app); // Library mode: equipment/bestiary/NPC templates + custom-library file
  // The combat screen mounts before the encounters module, because that
  // module's refresh paths reach `views.combatScreen` while it is still
  // mounting.
  wireCombatScreen(app); // combat mode's full-width board
  wireEncounters(app); // encounter + initiative panels, bestiary
  wireStory(app); // travelogue (logEvent), NPCs, quests, handouts
  // An Undo or Redo reloads the page and keeps the selected character and the
  // open tabs for this start.
  const reloadView = takeReloadView(sessionStorage);
  wireParty(app, reloadView); // roster, sheet, inventory, time
  // This call draws the first map, which also marks the encounter and NPC
  // tiles and rebuilds the Build-rail lists those markers share a node scope
  // with. The two modules that own those lists are wired above.
  const mapEnv = wireMapView(app); // canvas, trees, inspector, palette, fog, map tools
  wireGenerateAction(app, mapEnv); // shares the map's context rather than routing through actions
  wireDiceTray(app); // dice tray + the roll entries it writes to the travelogue
  wireHeaderMenu();
  // This must run last: mounting the role switch applies the starting role
  // straight away. That refreshes four panels and re-points the character
  // sheet, so everything it touches must already be registered.
  wireSessionControls(app); // mode/role switches (applies the initial role), tabs, sidebar
  wirePhoneViews(); // phone bottom bar; follows the sidebar tabs wired just above
  wireShortcuts(app);
  // A Player tab bound to one character opens on that character's sheet, so
  // the player sees the map and their sheet side by side. A reload below
  // still restores the tab the player had open.
  if (document.body.classList.contains('role-player') && app.actions.getBoundCharacterId()) {
    document.getElementById('tab-character')?.click();
  }
  // The mode comes first, so a tab of the Build rail opens on a shown rail.
  if (reloadView?.mode) app.actions.setMode(reloadView.mode);
  // A click selects a tab through the strip's own handler, so the panel and
  // the roving tabindex follow as they do for a GM's click.
  for (const tabId of reloadView?.tabs ?? []) document.getElementById(tabId)?.click();

  // A loaded save can carry a fight the party no longer stands in, because
  // the campaign was edited elsewhere. The reconcile runs once here, after
  // every module is wired, because it logs the end of the fight through
  // `logEvent` (from `wireStory`) and leaves combat mode through `setMode`
  // (from `wireSessionControls`). A call inside `wireEncounters` throws on
  // the missing `logEvent` and stops the rest of the mount.
  app.actions.syncCombatLocation();

  // A reload that finds a fight running resumes it on the combat screen, for
  // any role. A player takes their turn there too. The ribbon's Back to map
  // control lets anyone who prefers to watch the map leave the combat screen.
  if (app.state.combat !== null) app.actions.setMode('combat');

  // Show any confirmation queued by a pre-reload action (Undo, Import, New, and more).
  flushQueuedToast(toasts);

  // A save the loader cannot read leaves the app running on a blank
  // campaign, and the GM who is not told takes the blank map for data loss.
  // When the history has a step, Undo restores the previous save.
  if (loadFailed) {
    void alertModal(loadFailedMessage(historyDepth().undo), {
      title: 'Could not load the saved campaign',
    });
  }

  // A save past the decode limits loads shortened, and the next autosave
  // stores the shortened map over the full one. Saving waits for the GM.
  if (truncated) void holdShortenedBoot(truncated);

  maybeShowOnboarding(app);
}
