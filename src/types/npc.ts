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
  /** The six ability scores (default 10s), for derived modifiers like initiative. */
  stats: Record<string, number>;
  /** Where the NPC is found; null = unplaced. */
  location: EncounterLocation | null;
}
