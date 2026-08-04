/**
 * The shared application context threaded through the src/app wiring modules.
 *
 * main.js builds one AppContext and passes it to each wiring factory in
 * turn. Every value on it is read at call time, inside event handlers, and
 * never captured. This lets a module mounted early safely reference views
 * and actions that a later module registers, the same late-binding rule that
 * nodeActions relies on. `state` holds the mutable campaign data that the
 * save file is built from. Per-module UI state, for example the selected
 * tile, the active brush, combat, or the dirty flag, stays private inside
 * the module that owns it.
 */
import type { Character, EncounterLocation } from './entities.js';
import type { Creature, CreatureTemplate } from './creature.js';
import type { LogEntry, LogEntryKind } from './log.js';
import type { Quest } from './quest.js';
import type { GameClock } from './time.js';
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

export type AppMode = 'play' | 'build' | 'library' | 'combat';

/** The campaign data that a save serializes, plus the two view switches. */
export interface AppState {
  characters: Character[];
  /** Every creature in the campaign: foes and townsfolk in one list. */
  creatures: Creature[];
  travelog: LogEntry[];
  quests: Quest[];
  clock: GameClock;
  handouts: Handout[];
  bestiary: CreatureTemplate[];
  /** GM toggle. True when characters can hold their own positions on the map. */
  splitParty: boolean;
  /** The running fight (order, round, current turn), or null when no fight is
   * active. The state persists this, so a page refresh resumes combat
   * instead of dropping it. */
  combat: CombatState | null;
  mode: AppMode;
  role: ViewRole;
}

export interface Updatable {
  update: () => void;
}

/** Mounted panels that other modules refresh. Each wiring module registers
 * its own entries during init. Every entry exists once wiring completes. */
export interface AppViews {
  mapCanvas: MapCanvas;
  regionTree: Updatable;
  encounterPanel: Updatable;
  /** Build-rail foe authoring list, scoped to the node in view. */
  buildFoes: Updatable;
  /** Build-rail NPC authoring list, scoped to the node in view. */
  buildNPCs: Updatable;
  initiativePanel: Updatable;
  /** The combat mode's full-width board. */
  combatScreen: Updatable;
  npcPanel: Updatable;
  questPanel: Updatable;
  handoutPanel: Updatable;
  travelogPanel: Updatable;
  /** Roster, sheet, equipment, inventory, spellbook, clock, split toggle. */
  partyPanels: Updatable;
}

/** Cross-module operations, registered by the module that owns the state
 * they touch. Comments name the provider. */
export interface AppActions {
  // campaignActions
  markDirty(): void;
  // storyWiring
  logEvent(kind: LogEntryKind, message: string): void;
  // partyWiring: point the sheet, inventory, and roster back at the selected
  // character after an out-of-band character change, for example a
  // condition tick.
  refreshSelectedCharacter(): void;
  // partyWiring: the character this tab is bound to (Player view), or null.
  getBoundCharacterId(): string | null;
  // partyWiring: the character selected in the roster, or null for an empty
  // party. The GM's map clicks move this character while the party is split.
  getSelectedCharacterId(): string | null;
  // encounterWiring: defaults to the party's position and "The party". A
  // player who moves their own token passes that character's tile and name.
  maybeTriggerEncounter(position?: PartyPosition, subject?: string): void;
  // encounterWiring: the Build-mode right-click menu for a tile of the node
  // in view. It creates a creature there, or edits one already staged
  // there, and floats at the pointer's screen position.
  openEncounterContextMenu(x: number, y: number, clientX: number, clientY: number): void;
  // encounterWiring: remove a deleted entity from the running initiative
  // order. Every delete path calls this function instead of writing
  // `state.combat` directly, because encounterWiring holds the live copy of
  // the combat.
  removeCombatant(id: string): void;
  // encounterWiring: advance the running fight's turn, with the round-wrap
  // ticks, or end the fight. The combat screen and the sidebar panel share
  // these actions.
  advanceCombatTurn(): void;
  endCombat(): void;
  // encounterWiring: drop the running fight when nothing is staged on the
  // party's tile any more, because the party walked off or the last
  // creature there was deleted. Only the paths that change those two facts
  // call this function, never a plain panel refresh, so a refresh can never
  // write state.
  syncCombatLocation(): void;
  // mapWiring
  syncPartyMarker(): void;
  syncCreatureMarkers(): void;
  // mapWiring: mark placed creatures on the party's tile as met, on GM tabs
  // only, and log each introduction. This runs wherever the party lands
  // somewhere new.
  meetCreatures(): void;
  refreshMapDescription(): void;
  // mapWiring: reread the node in view and every location view from the
  // grid, for a caller that replaced the world underneath them.
  resyncMap(): void;
  // mapWiring: the Build-mode selected tile id, or null. This is the default
  // spot for authoring flows that place something "here".
  getSelectedTileId(): string | null;
  // mapWiring: navigate to and center the map on a staged location, and
  // select its tile (the Build foe list's "show on map").
  focusLocation(location: EncounterLocation): void;
  // mapWiring: navigate to and center the map on a position, and leave the
  // Build-mode tile selection alone (the roster follows a split party).
  centerOnLocation(location: EncounterLocation): void;
  undoStroke(): void;
  onModeChanged(mode: AppMode): void;
  onRoleChanged(role: ViewRole): void;
  // sessionControls
  setMode(mode: AppMode): void;
  // main.js: load a selection, and an optional target number, into the dice
  // tray and roll it there. Weapon attacks route through this function, so
  // the roll shows where every other roll happens.
  rollDice(selection: DiceSelection, target?: number | null): { result: DiceResult; text: string };
}

/** The `AppState` lists whose panels are built by `app/entityList.js`. A new
 * list of this kind adds its state key here. */
export type EntityListKey = 'quests' | 'handouts';

/** The entry type of one such list. A spec's callbacks are typed by the
 * state key alone. */
export type EntityListEntry<K extends EntityListKey> = AppState[K][number];

/** What one campaign list tells `wireEntityList` about itself: where it
 * lives, what its dialogs are called, what they ask for, and how a
 * submitted record becomes a new or edited entry. `titleKey` names the
 * required text field: the id is built from this field, and the delete
 * confirmation quotes it. */
export interface EntityListSpec<K extends EntityListKey> {
  key: K;
  /** Lowercase singular, for example "quest" becomes "New quest" or "Edit quest". */
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
