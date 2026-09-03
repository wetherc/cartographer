import { MapNode, PartyPosition } from './map';
import { Character } from './entities';
import { Creature, CreatureTemplate } from './creature';
import { LogEntry } from './log';
import { Quest } from './quest';
import { GameClock } from './time';
import { Handout } from './handout';
import { CombatState } from './combat';
import type { TileGrid } from '../map/TileGrid.js';

/** A save as parsed from JSON, before validation: any shape at all. */
export type RawSave = Record<string, any>;

/** One migration step: a version-n raw save goes in, a version-n+1 save comes out. */
export type MigrationStep = (state: RawSave) => RawSave;

/**
 * One reversible edit between two campaign states, as produced by
 * `diffState`. `p` is the path of keys, and, inside an id-keyed collection,
 * element ids, from the state root. An absent `t` marks a removal, and an
 * absent `f` marks an insertion, so inverting an op is a swap of the two.
 */
export interface DiffOp {
  p: (string | number)[];
  /** The value before this op, absent when the op inserts. */
  f?: unknown;
  /** The value after this op, absent when the op removes. */
  t?: unknown;
  /**
   * For an insertion or removal inside an id-keyed collection, the
   * element's index in whichever of the two states contains it. Inverting
   * the op puts the element back where it was, instead of appending it.
   */
  i?: number;
  /**
   * `'order'` marks a permutation of an id-keyed collection, where `f` and
   * `t` are the whole id sequences. Absent on every value op.
   */
  k?: 'order';
}

export interface CampaignState {
  /**
   * Schema version of the on-disk shape, stamped by `buildState` and read
   * by `deserialize` to pick the migration steps that a stored save still
   * needs. Absent on a save written before this field existed, which reads
   * as version 0.
   */
  version: number;
  nodes: MapNode[];
  party: PartyPosition | null;
  /**
   * The parent tile each child node was entered through, keyed by child node
   * id. This tells a child that two disjoint parent blocks link to which
   * block the party came in by. Empty on older saves. See
   * `map/EntryMemory.js`.
   */
  entryTiles: Record<string, string>;
  characters: Character[];
  /** Every creature in the campaign: foes and townsfolk in one list. */
  creatures: Creature[];
  /** Auto-recorded party travelogue (empty on older saves). */
  travelog: LogEntry[];
  /** GM-authored quest and session log (empty on older saves). */
  quests: Quest[];
  /** In-game clock. Null on older saves, and until first advanced. */
  clock: GameClock | null;
  /** GM-authored lore and read-aloud handouts (empty on older saves). */
  handouts: Handout[];
  /** Reusable creature templates saved to this campaign. */
  bestiary: CreatureTemplate[];
  /** True when the GM currently allows the party to split up (false on older saves). */
  splitParty: boolean;
  /** A running combat (order, round, current turn), or null when no fight
   * is active. This lets refreshing the page mid-fight resume it. Null on
   * older saves. */
  combat: CombatState | null;
}

/**
 * What `buildState` reads a save out of: a tile grid, plus whichever
 * campaign fields the caller holds. Everything but the grid is optional,
 * and falls back to the same empty value that `CampaignState` carries for
 * it, so a caller states only what it has. The runtime `Campaign` satisfies
 * this directly, and so does the live `AppState` once the grid and party
 * position are added to it. Extra fields (`mode`, `role`) are ignored
 * instead of persisted.
 */
export interface CampaignSource extends Partial<Omit<CampaignState, 'nodes' | 'version'>> {
  grid: TileGrid;
}
