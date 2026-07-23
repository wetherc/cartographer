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
import { loadInitialCampaign } from './campaign/Campaigns.js';
import { mustGetElement } from './ui/dom.js';
import { mountToasts, flushQueuedToast } from './ui/Toast.js';
import { mountDiceTray } from './ui/DiceTray.js';
import { wireCampaignActions } from './app/campaignActions.js';
import { wireMapView } from './app/mapWiring.js';
import { wireGenerateAction } from './app/generateAction.js';
import { wireParty } from './app/partyWiring.js';
import { wireEncounters } from './app/encounterWiring.js';
import { wireStory } from './app/storyWiring.js';
import { wireSessionControls } from './app/sessionControls.js';
import { wireShortcuts } from './app/shortcuts.js';
import { maybeShowOnboarding } from './app/onboarding.js';

const palette = new TilePalette();
const initial = loadInitialCampaign();
const toasts = mountToasts(document.body);

// The views/actions registries start empty and are populated synchronously by
// the wiring modules below, before any user event can fire; the cast spares
// every call site an existence check it will never need.
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
      mode: 'play',
      // Role is per-tab (sessionStorage, not the tab-shared localStorage) so a
      // follower tab can be Player while the GM's tab is GM.
      role: sessionStorage.getItem('campaign-builder:role') || 'gm',
    },
    views: {},
    actions: {},
  })
);

wireCampaignActions(app); // dirty flag + header campaign controls; provides markDirty
wireMapView(app); // canvas, trees, inspector, palette, fog, map tools
wireGenerateAction(app);
wireParty(app); // roster, sheet, inventory, time
wireEncounters(app); // encounter + initiative panels, bestiary
wireStory(app); // travelogue (logEvent), NPCs, quests, handouts
mountDiceTray(mustGetElement('dice-tray-container'));
wireSessionControls(app); // mode/role switches (applies the initial role), tabs, sidebar
wireShortcuts(app);

// Show any confirmation queued by a pre-reload action (Undo, Import, New, ...).
flushQueuedToast(toasts);

maybeShowOnboarding(app);
