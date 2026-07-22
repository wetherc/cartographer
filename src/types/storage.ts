import { MapNode, PartyPosition } from './map';
import { Character, Encounter } from './entities';
import { LogEntry } from './log';

export interface CampaignState {
  nodes: MapNode[];
  party: PartyPosition | null;
  characters: Character[];
  encounters: Encounter[];
  /** Auto-recorded party travelogue (empty on older saves). */
  travelog: LogEntry[];
}
