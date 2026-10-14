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
import type { LogEntry, LogEntryKind, LogOptions } from './log.js';
import type { Quest } from './quest.js';
import type { GameClock } from './time.js';
import type { Handout } from './handout.js';
import type { ActionCost, CombatState, Participant, TurnFlag } from './combat.js';
import type { ViewRole } from './view.js';
import type { PartyPosition } from './map.js';
import type { DiceResult, DiceSelection, TrayRollOptions } from './dice.js';
import type { CampaignFieldKey } from './storage.js';
import type { ModalField } from './modal.js';
import type { TilePalette } from '../map/TilePalette.js';
import type { TileGrid } from '../map/TileGrid.js';
import type { MapNavigator } from '../map/MapNavigator.js';
import type { MapCanvas } from '../map/MapCanvas.js';
import type { PartyTracker } from '../party/PartyTracker.js';

export type AppMode = 'play' | 'build' | 'library' | 'combat';

/** The campaign data that a save serializes, plus the two view switches. */
export interface AppState {
  /** The parent tile each traveler entered each child node through, keyed by
   * traveler and then by child node id. `map/EntryMemory.js` reads and writes
   * it, and the ways out of a node and the return landing both depend on
   * it. */
  entryTiles: Record<string, Record<string, string>>;
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

/** Resolves to true only when A and B are the same union of keys. */
type SameKeys<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** A type error here means `AppState` and `CampaignState` list different campaign fields. */
type AssertTrue<T extends true> = T;
export type AppStateFieldsMatch = AssertTrue<
  SameKeys<Exclude<keyof AppState, 'mode' | 'role'>, CampaignFieldKey>
>;

export interface Updatable {
  update: () => void;
}

/** A panel that mounts on first use. `update` does nothing until `mount` runs. */
export interface DeferredView extends Updatable {
  mount: () => Updatable;
  readonly mounted: boolean;
}

/** Mounted panels that other modules refresh. Each wiring module registers
 * its own entries during init. Every entry exists once wiring completes. */
export interface AppViews {
  mapCanvas: MapCanvas;
  regionTree: Updatable;
  encounterPanel: Updatable;
  /** Build-rail foe authoring list, scoped to the node in view. It mounts on
   * the first switch to Build mode. */
  buildFoes: DeferredView;
  /** Build-rail NPC authoring list, scoped to the node in view. It mounts on
   * the first switch to Build mode. */
  buildNPCs: DeferredView;
  initiativePanel: Updatable;
  /** The combat mode's full-width board. */
  combatScreen: Updatable;
  npcPanel: Updatable;
  questPanel: Updatable;
  handoutPanel: Updatable;
  travelogPanel: Updatable;
  /** Roster, sheet, equipment, inventory, spellbook, clock, split toggle. */
  partyPanels: Updatable;
  /** The Time panel alone. A fight that starts or ends refreshes it, because
   * its buttons lock while a fight runs. */
  timePanel: Updatable;
}

/** Cross-module operations, registered by the module that owns the state
 * they touch. Comments name the provider. */
export interface AppActions {
  // campaignActions
  markDirty(): void;
  // storyWiring
  logEvent(kind: LogEntryKind, message: string, options?: LogOptions): void;
  // handoutWiring: open the new-handout dialog with one tile of a node as
  // its place. The tile inspector calls this.
  addHandoutAt(nodeId: string, tileId: string): Promise<void>;
  // partyWiring: point the sheet, inventory, and roster back at the selected
  // character after an out-of-band character change, for example a
  // condition tick. It does nothing in combat mode, where the combat screen
  // covers those panels. Leaving combat mode calls it once.
  refreshSelectedCharacter(): void;
  // partyWiring: the character this tab is bound to (Player view), or null.
  getBoundCharacterId(): string | null;
  // partyWiring: the character selected in the roster, or null for an empty
  // party. The GM's map clicks move this character while the party is split.
  getSelectedCharacterId(): string | null;
  // partyWiring: move the in-game clock on by the minutes a party walk
  // took, tick timed effects for any watch the walk finished, and redraw
  // the clock readout.
  passTravelTime(minutes: number): void;
  // encounterPanels: defaults to the party's position and "The party". A
  // player who moves their own token passes that character's tile and name.
  maybeTriggerEncounter(position?: PartyPosition, subject?: string): Promise<void>;
  // encounterPanels: the Build-mode right-click menu for a tile of the node
  // in view. It creates a creature there, or edits one already staged
  // there, and floats at the pointer's screen position.
  openEncounterContextMenu(x: number, y: number, clientX: number, clientY: number): void;
  // fightState: remove a deleted entity from the running initiative
  // order. Every delete path calls this function instead of writing
  // `state.combat` directly, because fightState is the only writer of
  // `state.combat`.
  removeCombatant(id: string): void;
  // fightState: put a new combatant into the running order, which is how
  // a creature that a spell summons mid-fight joins it. It does nothing when
  // no fight is running.
  addCombatant(participant: Participant): void;
  // fightState: advance the running fight's turn, with the round-wrap
  // ticks, or end the fight. The combat screen and the sidebar panel share
  // these actions.
  advanceCombatTurn(): void;
  endCombat(): Promise<void>;
  // turnOrder: the GM's corrections to a running order. Previous turn moves
  // the pointer back one turn, setCombatInitiative gives one combatant a new
  // initiative and sorts the order again, and Delay moves the combatant who
  // holds the turn to just after the next row.
  retreatCombatTurn(): void;
  setCombatInitiative(id: string, initiative: number): void;
  delayCombatTurn(): void;
  // fightState: spend part of one combatant's turn, which is how an
  // attack or a cast pays for itself. 'attack' is the weapon swing, which
  // spends the Attack action and banks the extra swings of Extra Attack.
  // 'sneak' is the once-per-turn Sneak Attack flag, which costs no part of the
  // turn. 'legendary' spends one legendary action of a creature, and reads
  // `legendaryActions` from the options.
  // The return value is false when the budget no longer holds the cost,
  // and the caller then offers the GM the way past it.
  spendBudget(
    id: string,
    cost: ActionCost | TurnFlag | 'attack' | 'legendary',
    options?: {
      attacksPerAction?: number;
      extraAction?: boolean;
      lightAttack?: boolean;
      legendaryActions?: number;
    },
  ): boolean;
  // fightState: the GM's override on one cost of a turn. A free cost
  // becomes spent and a spent one becomes free. The return value is true
  // when the cost is spent afterward, and null when the id is not in a
  // running fight.
  toggleBudget(id: string, cost: ActionCost): boolean | null;
  // fightState: give one combatant one more action for Action Surge.
  // False when the turn already surged.
  surgeBudget(id: string): boolean;
  // fightState: drop the running fight when nothing is staged on the
  // party's tile any more, because the party walked off or the last
  // creature there was deleted. Only the paths that change those two facts
  // call this function, never a plain panel refresh, so a refresh can never
  // write state.
  syncCombatLocation(): void;
  // mapWiring
  syncPartyMarker(): void;
  // mapWiring: recompute the ways out of the node in view. The arrows show
  // by distance in sight radii, so a change of watch reruns this.
  syncExits(): void;
  syncCreatureMarkers(): void;
  /** Cue the GM about each hidden handout on the party tile (see handoutCue.js). */
  cueHandouts(): void;
  // mapWiring: mark placed creatures on the party's tile as met, on GM tabs
  // only, and log each introduction. This runs wherever the party lands
  // somewhere new.
  meetCreatures(): void;
  refreshMapDescription(): void;
  // mapWiring: rewrite the Build tool chip, for a change of tool that the
  // palette does not make (a map pick that starts or ends).
  syncToolChip(): void;
  // mapWiring: open a map by node id, framed to fit the view.
  goToNode(nodeId: string): void;
  // mapWiring: reread the node in view and every location view from the
  // grid, for a caller that replaced the world underneath them. The view
  // keeps its pan and zoom while the node in view keeps its id and size.
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
  undoStroke(): Promise<void>;
  redoStroke(): Promise<void>;
  // generateAction: go to the root node and open the Generate dialog on the
  // world archetype with every level of sub-maps. Resolves to null when the
  // GM cancels, and otherwise tells whether the party moved to the start of
  // the new world.
  generateWorld(): Promise<{ partyStart: boolean } | null>;
  onModeChanged(mode: AppMode): void;
  // libraryWiring: mount the Library lists on the first visit to Library mode.
  showLibrary(): void;
  // mapWiring: mount the Build rail on the first visit to Build mode.
  showBuild(): void;
  onRoleChanged(role: ViewRole): void;
  // sessionControls
  setMode(mode: AppMode): void;
  // campaignActions: merge the player tab edits that arrived while the GM
  // tab was in Build or Library mode.
  mergeQueuedPatches(): void;
  // diceWiring: load a selection, and an optional target number, into the dice
  // tray and roll it there. Weapon attacks route through this function, so
  // the roll shows where every other roll happens. With `keep`, a sheet check
  // borrows the tray and leaves the GM's setup in place.
  rollDice(
    selection: DiceSelection,
    target?: number | null,
    options?: TrayRollOptions,
  ): { result: DiceResult; text: string; target?: number | null };
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
    options?: { submitLabel?: string; wide?: boolean; submitRequires?: string[] },
  ) => Promise<Record<string, string> | null>;
  confirm?: (name: string) => Promise<boolean>;
}

export interface AppContext {
  palette: TilePalette;
  grid: TileGrid;
  navigator: MapNavigator;
  partyTracker: PartyTracker;
  toasts: {
    show(
      message: string,
      options?: { level?: 'status' | 'error'; action?: { label: string; onClick: () => void } },
    ): void;
  };
  state: AppState;
  views: AppViews;
  actions: AppActions;
}
