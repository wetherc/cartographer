/**
 * This is the composition root. It loads the campaign, builds the shared
 * AppContext (engine objects, mutable campaign state, and the views/actions
 * registries the wiring modules fill in), then hands it to each src/app
 * wiring module in mount order. All cross-module references go through
 * `app` and are read at call time, so a module mounted early can call into
 * one mounted later.
 */
import { TilePalette } from './map/TilePalette.js';
import { MapNavigator } from './map/MapNavigator.js';
import { PartyTracker } from './party/PartyTracker.js';
import { loadInitialCampaignSafe } from './campaign/Campaigns.js';
import { mountToasts, flushQueuedToast } from './ui/Toast.js';
import { mountTooltips } from './ui/Tooltip.js';
import { alertModal } from './ui/Modal.js';
import { wireCampaignActions } from './app/campaignActions.js';
import { wireMapView } from './app/mapWiring.js';
import { wireGenerateAction } from './app/generateAction.js';
import { wireParty } from './app/partyWiring.js';
import { wireEncounters } from './app/encounterWiring.js';
import { wireCombatScreen } from './app/combatWiring.js';
import { wireStory } from './app/storyWiring.js';
import { wireLibrary } from './app/libraryWiring.js';
import { wireSessionControls } from './app/sessionControls.js';
import { wireShortcuts } from './app/shortcuts.js';
import { wireDiceTray } from './app/diceWiring.js';
import { maybeShowOnboarding } from './app/onboarding.js';

const palette = new TilePalette();
const { campaign: initial, failed: loadFailed } = loadInitialCampaignSafe();
const toasts = mountToasts(document.body);
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
    navigator: new MapNavigator(initial.grid, initial.party.nodeId),
    partyTracker: new PartyTracker(initial.grid, initial.party),
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
wireParty(app); // roster, sheet, inventory, time
// This call draws the first map, which also marks the encounter and NPC
// tiles and rebuilds the Build-rail lists those markers share a node scope
// with. The two modules that own those lists are wired above.
const mapEnv = wireMapView(app); // canvas, trees, inspector, palette, fog, map tools
wireGenerateAction(app, mapEnv); // shares the map's context rather than routing through actions
wireDiceTray(app); // dice tray + the roll entries it writes to the travelogue
// This must run last: mounting the role switch applies the starting role
// straight away. That refreshes four panels and re-points the character
// sheet, so everything it touches must already be registered.
wireSessionControls(app); // mode/role switches (applies the initial role), tabs, sidebar
wireShortcuts(app);

// A reload that finds a fight running resumes it on the combat screen, for
// any role. A player takes their turn there too. The ribbon's Back to map
// control lets anyone who prefers to watch the map leave the combat screen.
if (app.state.combat !== null) app.actions.setMode('combat');

// Show any confirmation queued by a pre-reload action (Undo, Import, New, and more).
flushQueuedToast(toasts);

// A save the loader cannot read leaves the app running on a blank
// campaign. The app must report this. Undo restores the previous save and
// gives the GM a way back.
if (loadFailed) {
  void alertModal(
    'The saved campaign could not be read, so this session started blank. Nothing has been overwritten: press Undo to restore the previous save, and export a backup before making changes.',
    { title: 'Could not load the saved campaign' },
  );
}

maybeShowOnboarding(app);
