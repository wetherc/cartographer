import { MapNode, PartyPosition } from './map';
import { Character, Encounter } from './entities';

export interface CampaignState {
  nodes: MapNode[];
  party: PartyPosition | null;
  characters: Character[];
  encounters: Encounter[];
}
