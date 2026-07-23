import { MapNode, PartyPosition } from './map';
import { Character, Encounter } from './entities';
import { LogEntry } from './log';
import { Quest } from './quest';
import { GameClock } from './time';
import { NPC } from './npc';

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
}
