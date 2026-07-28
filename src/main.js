/**
 * Composition root. Loads the campaign, builds the shared AppContext (engine
 * objects, mutable campaign state, and the views/actions registries the
 * wiring modules fill in), then hands it to each src/app wiring module in
 * mount order. All cross-module references go through `app` and are read at
 * call time, so a module mounted early can call into one mounted later.
 */
import { TilePalette } from './map/TilePalette.js';
import { MapNavigator } from './map/MapNavigator.js';
import { PartyTracker } from './party/PartyTracker.js';
import { loadInitialCampaignSafe } from './campaign/Campaigns.js';
import { mustGetElement } from './ui/dom.js';
import { mountToasts, flushQueuedToast } from './ui/Toast.js';
import { alertModal } from './ui/Modal.js';
import { mountDiceTray } from './ui/DiceTray.js';
import { wireCampaignActions } from './app/campaignActions.js';
import { wireMapView } from './app/mapWiring.js';
import { wireGenerateAction } from './app/generateAction.js';
import { wireParty } from './app/partyWiring.js';
import { wireEncounters } from './app/encounterWiring.js';
import { wireStory } from './app/storyWiring.js';
import { wireLibrary } from './app/libraryWiring.js';
import { wireSessionControls } from './app/sessionControls.js';
import { wireShortcuts } from './app/shortcuts.js';
import { maybeShowOnboarding } from './app/onboarding.js';
import { isGM } from './view/ViewRole.js';

const palette = new TilePalette();
const { campaign: initial, failed: loadFailed } = loadInitialCampaignSafe();
const toasts = mountToasts(document.body);

// The views/actions registries start empty and are populated synchronously by
// the wiring modules below, before any user event can fire; the cast spares
// every call site an existence check it will never need. It is the one place
// that asserts the invariant, so a module that reads a registry entry while
// wiring is still in progress has to be ordered after the module that puts it
// there — see the mount order below.
const app = /** @type {import('./types/app.js').AppContext} */ (
  /** @type {unknown} */ ({
    palette,
    grid: initial.grid,
    navigator: new MapNavigator(initial.grid, initial.party.nodeId),
    partyTracker: new PartyTracker(initial.grid, initial.party),
    toasts,
    state: {
      characters: initial.characters,
      encounters: initial.encounters,
      travelog: initial.travelog,
      quests: initial.quests,
      clock: initial.clock,
      npcs: initial.npcs,
      handouts: initial.handouts,
      bestiary: initial.bestiary,
      splitParty: initial.splitParty,
      combat: initial.combat,
      mode: 'play',
      // Role is per-tab (sessionStorage, not the tab-shared localStorage) so a
      // follower tab can be Player while the GM's tab is GM.
      role: sessionStorage.getItem('campaign-builder:role') || 'gm',
    },
    views: {},
    actions: {},
  })
);

// The order below is a dependency order, not a preference. Almost every
// cross-module reference resolves when an event fires, long after all of this
// has run, but three modules reach another module's registrations while they
// are still mounting, so those registrations have to be in place first.
wireCampaignActions(app); // dirty flag + header campaign controls; provides markDirty
// The library loads before anything that offers its presets (the item form,
// the enemy gear pickers), so the merged lists are live from the first open.
wireLibrary(app); // Library mode: equipment/bestiary/NPC templates + custom-library file
wireEncounters(app); // encounter + initiative panels, bestiary
wireStory(app); // travelogue (logEvent), NPCs, quests, handouts
wireParty(app); // roster, sheet, inventory, time
// Draws the first map, which also marks the encounter and NPC tiles and
// rebuilds the Build-rail lists those markers share a node scope with — so the
// two modules that own those lists are wired above.
const mapEnv = wireMapView(app); // canvas, trees, inspector, palette, fog, map tools
wireGenerateAction(app, mapEnv); // shares the map's context rather than routing through actions
// Rolls live in the travelogue (the tray shows only the latest), tagged by
// which side of the screen rolled them — by name when the tab is bound to a
// character, "A player" for a spectator tab.
function rollerName() {
  if (isGM(app.state.role)) return 'The GM';
  const boundId = app.actions.getBoundCharacterId();
  return app.state.characters.find((c) => c.id === boundId)?.name ?? 'A player';
}
const diceTray = mountDiceTray(mustGetElement('dice-tray-container'), {
  onRoll: (text) => app.actions.logEvent('roll', `${rollerName()} rolls ${text}.`),
});
// Lets a weapon attack load and roll the tray (d20 + modifier vs the
// defender's AC) so the roll is visible where every other roll happens.
app.actions.rollDice = (selection, target) => diceTray.rollSelection(selection, target);
// Last, and it has to be: mounting the role switch applies the starting role
// straight away, which refreshes four panels and re-points the character sheet,
// so everything it touches must already be registered.
wireSessionControls(app); // mode/role switches (applies the initial role), tabs, sidebar
wireShortcuts(app);

// Show any confirmation queued by a pre-reload action (Undo, Import, New, ...).
flushQueuedToast(toasts);

// A save the loader could not read leaves the app running on a blank campaign,
// which needs saying out loud — and Undo, which restores the previous save, is
// the way back.
if (loadFailed) {
  void alertModal(
    'The saved campaign could not be read, so this session started blank. Nothing has been overwritten: press Undo to restore the previous save, and export a backup before making changes.',
    { title: 'Could not load the saved campaign' },
  );
}

maybeShowOnboarding(app);
