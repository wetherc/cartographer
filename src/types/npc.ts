import { Condition, EncounterLocation, ResourcePool, Spellbook } from './entities';

export type Disposition = 'friendly' | 'neutral' | 'hostile';

/** A non-combatant campaign character: named, placed, and given a disposition, with no HP. */
export interface NPC {
  id: string;
  name: string;
  /** Free-text role or faction, for example "Innkeeper" or "Thieves' Guild". */
  role: string;
  disposition: Disposition;
  notes: string;
  /** The six ability scores (default 10s), for derived modifiers like initiative. */
  stats: Record<string, number>;
  /** Where the NPC is found. Null means unplaced. */
  location: EncounterLocation | null;
  /**
   * True when the party lands on the NPC's tile. A placed NPC stays hidden
   * from the players' Story sidebar until met. An unplaced NPC is always known.
   */
  met: boolean;
  /** Active status conditions (empty on older saves). An NPC that joins a
   * fight takes chips the same way a character or a foe does. */
  conditions: Condition[];
  /** Spellcaster class id (see Classes.js). A present value that names a
   * caster class lets this NPC cast. Absent marks a non-caster. */
  class?: string;
  /** Caster level, which drives the slot maxima and the save DC. It defaults
   * to 1 when a caster class is assigned without an explicit value, since an
   * NPC has no fighting level. */
  casterLevel?: number;
  /** Learned cantrips and spells (spell ids). Present only on casters. */
  spellbook?: Spellbook;
  /** Spell-slot pools (`slots-1` through `slots-9`). Present only on casters. */
  resources?: ResourcePool[];
}
