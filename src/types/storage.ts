import { MapNode, PartyPosition } from './map';
import { Character, Encounter, EncounterTemplate } from './entities';
import { LogEntry } from './log';
import { Quest } from './quest';
import { GameClock } from './time';
import { NPC } from './npc';
import { Handout } from './handout';
import { CombatState } from './combat';

/** A save as parsed from JSON, before validation: any shape at all. */
export type RawSave = Record<string, any>;

/** One migration step: a version-n raw save in, a version-n+1 one out. */
export type MigrationStep = (state: RawSave) => RawSave;

/**
 * One reversible edit between two campaign states, as produced by `diffState`.
 * `p` is the path of keys (and, inside an id-keyed collection, element ids) from
 * the state root. An absent `t` is a removal and an absent `f` an insertion, so
 * inverting an op is a swap of the two.
 */
export interface DiffOp {
  p: (string | number)[];
  /** The value before this op, absent when the op inserts. */
  f?: unknown;
  /** The value after this op, absent when the op removes. */
  t?: unknown;
  /**
   * For an insertion or removal inside an id-keyed collection, the element's
   * index in whichever of the two states contains it — so inverting the op puts
   * it back where it was rather than appending it.
   */
  i?: number;
  /**
   * `'order'` marks a permutation of an id-keyed collection, where `f` and `t`
   * are the whole id sequences. Absent on every value op.
   */
  k?: 'order';
}

export interface CampaignState {
  /**
   * Schema version of the on-disk shape, stamped by `buildState` and read by
   * `deserialize` to pick the migration steps a stored save still needs. Absent
   * on saves written before it existed, which read as version 0.
   */
  version: number;
  nodes: MapNode[];
  party: PartyPosition | null;
  characters: Character[];
  encounters: Encounter[];
  /** Auto-recorded party travelogue (empty on older saves). */
  travelog: LogEntry[];
  /** GM-authored quest/session log (empty on older saves). */
  quests: Quest[];
  /** In-game clock; null on older saves (and until first advanced). */
  clock: GameClock | null;
  /** Non-combatant NPCs (empty on older saves). */
  npcs: NPC[];
  /** GM-authored lore/read-aloud handouts (empty on older saves). */
  handouts: Handout[];
  /** Reusable encounter templates (empty on older saves). */
  bestiary: EncounterTemplate[];
  /** Whether the GM currently allows the party to split up (false on older saves). */
  splitParty: boolean;
  /** A running combat (order, round, current turn), or null when none is
   * active — so refreshing the page mid-fight resumes it. Null on older saves. */
  combat: CombatState | null;
}
