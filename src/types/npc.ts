import { EncounterLocation, ResourcePool, Spellbook } from './entities';

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
  /**
   * Whether the party has landed on the NPC's tile. Placed NPCs stay hidden
   * from the players' Story sidebar until met; unplaced NPCs are always known.
   */
  met: boolean;
  /** Spellcaster class id (see Classes.js). Present (and a caster class) makes
   * this NPC able to cast; absent = a non-caster. */
  class?: string;
  /** Caster level driving slot maxima and save DC; defaults to 1 when a caster
   * class is assigned without an explicit value (an NPC has no fighting level). */
  casterLevel?: number;
  /** Learned cantrips/spells (spell ids); present only on casters. */
  spellbook?: Spellbook;
  /** Spell-slot pools (`slots-1` .. `slots-9`); present only on casters. */
  resources?: ResourcePool[];
}
