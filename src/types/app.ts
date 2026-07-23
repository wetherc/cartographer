/**
 * The shared application context threaded through the src/app wiring modules.
 *
 * main.js constructs one AppContext and hands it to each wiring factory in
 * turn. Everything on it is read at call time (inside event handlers), never
 * captured, so a module mounted early can safely reference views and actions a
 * later module registers — the same late-binding rule nodeActions relies on.
 * `state` holds the mutable campaign data the save file is assembled from;
 * per-module UI state (selected tile, active brush, combat, dirty flag...)
 * stays private inside the module that owns it.
 */
import type { Character, Encounter, EncounterTemplate } from './entities.js';
import type { LogEntry, LogEntryKind } from './log.js';
import type { Quest } from './quest.js';
import type { GameClock } from './time.js';
import type { NPC } from './npc.js';
import type { Handout } from './handout.js';
import type { ViewRole } from './view.js';
import type { MapNode } from './map.js';
import type { TilePalette } from '../map/TilePalette.js';
import type { TileGrid } from '../map/TileGrid.js';
import type { MapNavigator } from '../map/MapNavigator.js';
import type { MapCanvas } from '../map/MapCanvas.js';
import type { PartyTracker } from '../party/PartyTracker.js';

export type AppMode = 'play' | 'build';

/** The campaign data a save serializes, plus the two view switches. */
export interface AppState {
  characters: Character[];
  encounters: Encounter[];
  travelog: LogEntry[];
  quests: Quest[];
  clock: GameClock;
  npcs: NPC[];
  handouts: Handout[];
  bestiary: EncounterTemplate[];
  mode: AppMode;
  role: ViewRole;
}

export interface Updatable {
  update: () => void;
}

/** Mounted panels that other modules refresh. Each wiring module registers its
 * own entries during init; every entry exists once wiring completes. */
export interface AppViews {
  mapCanvas: MapCanvas;
  worldTree: Updatable;
  regionTree: Updatable;
  encounterPanel: Updatable;
  initiativePanel: Updatable;
  npcPanel: Updatable;
  questPanel: Updatable;
  handoutPanel: Updatable;
  travelogPanel: Updatable;
}

/** Cross-module operations, registered by the module that owns the state they
 * touch (comments name the provider). */
export interface AppActions {
  // campaignActions
  setDirty(next: boolean): void;
  markDirty(): void;
  // storyWiring
  logEvent(kind: LogEntryKind, message: string): void;
  // partyWiring: re-point the sheet/inventory/roster at the currently selected
  // character after an out-of-band character mutation (e.g. condition ticks).
  refreshSelectedCharacter(): void;
  // encounterWiring
  maybeTriggerEncounter(): void;
  // mapWiring
  syncPartyMarker(): void;
  syncEncounterMarkers(): void;
  syncNPCMarkers(): void;
  refreshMapDescription(): void;
  clearSelection(): void;
  syncPaletteKind(): void;
  snapshotEdit(...nodes: MapNode[]): void;
  undoStroke(): void;
  onModeChanged(mode: AppMode): void;
  onRoleChanged(role: ViewRole): void;
  // sessionControls
  setMode(mode: AppMode): void;
}

export interface AppContext {
  palette: TilePalette;
  grid: TileGrid;
  navigator: MapNavigator;
  partyTracker: PartyTracker;
  toasts: { show(message: string): void };
  state: AppState;
  views: AppViews;
  actions: AppActions;
}
