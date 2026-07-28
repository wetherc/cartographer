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
import type { Character, Encounter, EncounterLocation, EncounterTemplate } from './entities.js';
import type { LogEntry, LogEntryKind } from './log.js';
import type { Quest } from './quest.js';
import type { GameClock } from './time.js';
import type { NPC } from './npc.js';
import type { Handout } from './handout.js';
import type { CombatState } from './combat.js';
import type { ViewRole } from './view.js';
import type { PartyPosition } from './map.js';
import type { DiceResult, DiceSelection } from './dice.js';
import type { ModalField } from './modal.js';
import type { TilePalette } from '../map/TilePalette.js';
import type { TileGrid } from '../map/TileGrid.js';
import type { MapNavigator } from '../map/MapNavigator.js';
import type { MapCanvas } from '../map/MapCanvas.js';
import type { PartyTracker } from '../party/PartyTracker.js';

export type AppMode = 'play' | 'build' | 'library';

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
  /** GM toggle: whether characters may hold their own positions on the map. */
  splitParty: boolean;
  /** The running fight (order, round, current turn), or null when none is
   * active. Persisted so a page refresh resumes combat rather than dropping it. */
  combat: CombatState | null;
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
  regionTree: Updatable;
  encounterPanel: Updatable;
  /** Build-rail encounter authoring list, scoped to the node being viewed. */
  buildEncounters: Updatable;
  /** Build-rail NPC authoring list, scoped to the node being viewed. */
  buildNPCs: Updatable;
  initiativePanel: Updatable;
  npcPanel: Updatable;
  questPanel: Updatable;
  handoutPanel: Updatable;
  travelogPanel: Updatable;
  /** Roster, sheet, equipment, inventory, spellbook, clock, split toggle. */
  partyPanels: Updatable;
}

/** Cross-module operations, registered by the module that owns the state they
 * touch (comments name the provider). */
export interface AppActions {
  // campaignActions
  markDirty(): void;
  // storyWiring
  logEvent(kind: LogEntryKind, message: string): void;
  // partyWiring: re-point the sheet/inventory/roster at the currently selected
  // character after an out-of-band character mutation (e.g. condition ticks).
  refreshSelectedCharacter(): void;
  // partyWiring: the character this tab is bound to (Player view), or null.
  getBoundCharacterId(): string | null;
  // encounterWiring: defaults to the party's position and "The party"; a
  // player moving their own token passes that character's tile and name.
  maybeTriggerEncounter(position?: PartyPosition, subject?: string): void;
  // encounterWiring: the Build-mode right-click menu for a tile of the viewed
  // node — create an encounter there, or edit one already staged there —
  // floated at the pointer's screen position.
  openEncounterContextMenu(x: number, y: number, clientX: number, clientY: number): void;
  // encounterWiring: drop a deleted entity out of the running initiative
  // order. Every delete path calls this rather than writing `state.combat`,
  // since encounterWiring holds the live copy of the combat.
  removeCombatant(id: string): void;
  // mapWiring
  syncPartyMarker(): void;
  syncEncounterMarkers(): void;
  syncNPCMarkers(): void;
  // mapWiring: mark placed NPCs on the party's tile as met (GM tabs only),
  // logging each introduction; run wherever the party lands somewhere new.
  meetNPCs(): void;
  refreshMapDescription(): void;
  // mapWiring: re-read the node in view and every location view from the grid,
  // for a caller that replaced the world underneath them.
  resyncMap(): void;
  // mapWiring: the Build-mode selected tile id, or null — the default spot
  // for authoring flows that place something "here".
  getSelectedTileId(): string | null;
  // mapWiring: navigate to and centre the map on a staged location, selecting
  // its tile (the Build encounter list's "show on map").
  focusLocation(location: EncounterLocation): void;
  undoStroke(): void;
  onModeChanged(mode: AppMode): void;
  onRoleChanged(role: ViewRole): void;
  // sessionControls
  setMode(mode: AppMode): void;
  // main.js: load a selection (and optional target number) into the dice tray
  // and roll it there — weapon attacks route through this so the roll shows
  // where every other roll happens.
  rollDice(selection: DiceSelection, target?: number | null): { result: DiceResult; text: string };
}

/** The `AppState` lists whose panels are built by `app/entityList.js`. A new
 * such list adds its state key here. */
export type EntityListKey = 'quests' | 'handouts';

/** The entry type of one such list, so a spec's callbacks are typed by the
 * state key alone. */
export type EntityListEntry<K extends EntityListKey> = AppState[K][number];

/** What one campaign list tells `wireEntityList` about itself: where it lives,
 * what its dialogs are called, what they ask for, and how a submitted record
 * becomes a new or edited entry. `titleKey` names the required text field, the
 * one the id is slugged from and the delete confirmation quotes. */
export interface EntityListSpec<K extends EntityListKey> {
  key: K;
  /** Lowercase singular, e.g. "quest" -> "New quest" / "Edit quest". */
  noun: string;
  fields: (entity: EntityListEntry<K> | null) => ModalField[];
  create: (id: string, title: string, values: Record<string, string>) => EntityListEntry<K>;
  patch: (
    entity: EntityListEntry<K>,
    title: string,
    values: Record<string, string>,
  ) => EntityListEntry<K>;
  titleKey?: string;
  /** Extra `promptModal` options for the edit dialog only. */
  editOptions?: { submitLabel?: string; wide?: boolean };
  prompt?: (
    title: string,
    fields: ModalField[],
    options?: { submitLabel?: string; wide?: boolean },
  ) => Promise<Record<string, string> | null>;
  confirm?: (name: string) => Promise<boolean>;
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
