import { EncounterLocation } from './entities';

export type Disposition = 'friendly' | 'neutral' | 'hostile';

/** A non-combatant campaign character: named, placed, and dispositioned, with no HP. */
export interface NPC {
  id: string;
  name: string;
  /** Free-text role/faction, e.g. "Innkeeper" or "Thieves' Guild". */
  role: string;
  disposition: Disposition;
  notes: string;
  /** Where the NPC is found; null = unplaced. */
  location: EncounterLocation | null;
}
