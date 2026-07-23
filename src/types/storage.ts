import { MapNode, PartyPosition } from './map';
import { Character, Encounter, EncounterTemplate } from './entities';
import { LogEntry } from './log';
import { Quest } from './quest';
import { GameClock } from './time';
import { NPC } from './npc';
import { Handout } from './handout';

export interface CampaignState {
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
}
