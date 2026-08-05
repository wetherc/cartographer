import type {
  Condition,
  EncounterLocation,
  EnemyArmor,
  EnemyWeapon,
  EnemyTier,
  ResourcePool,
  Spellbook,
  StatModifier,
} from './entities.js';

/** The attitude a creature holds toward the party. */
export type Disposition = 'friendly' | 'neutral' | 'hostile';

/**
 * One creature in the campaign: a foe, a townsperson, or anything between.
 * The disposition decides which side it fights on. Hostile creatures fight
 * the party. All other creatures stand with the party. Every creature is a
 * full combatant, with hit points, an AC in its stat block, and optional
 * gear.
 *
 * The gear fields are always explicit. A null weapon means the creature is
 * unarmed on purpose. A null armor means the creature is unarmored on
 * purpose. The create and edit paths write the level or tier default into
 * the stored value, so no read path derives gear from the level.
 */
export interface Creature {
  id: string;
  name: string;
  disposition: Disposition;
  /** Hit points. At 0 current HP, the creature is out of the fight. A
   * creature rolls no death saves. */
  maxHP: number;
  currentHP: number;
  /** The six ability scores plus AC. AC defaults to 10 plus the DEX
   * modifier. */
  stats: Record<string, number>;
  /** Where the creature stands. Null means unplaced: the creature shows at
   * every location. */
  location: EncounterLocation | null;
  /** Active status conditions (empty on older saves). */
  conditions: Condition[];
  /** Exhaustion, 0 to 6. Each level costs 2 on every d20 test, and 6 is
   * death. Absent on older saves, which load unexhausted. A creature has no
   * rest, so only the GM moves this. */
  exhaustion?: number;
  /** True after the party lands on the creature's tile. The first landing
   * writes one travelogue line. A placed non-hostile creature stays hidden
   * from the players until met. An unplaced creature is always known. */
  met: boolean;
  /** What the creature swings, or null for an unarmed creature. */
  weapon: EnemyWeapon | null;
  /** What the creature wears, or null for an unarmored creature. Its
   * `acBonus` adds to the AC of the stat block. */
  armor: EnemyArmor | null;
  /** Authoring level. It picks the default stats and gear for a new foe.
   * Absent on a creature that was never authored as a foe. */
  level?: number;
  /** Authoring tier. It has meaning only next to `level`. */
  tier?: EnemyTier;
  /** Free-text role or faction, for example "Innkeeper". */
  role?: string;
  notes?: string;
  /** Timed stat adjustments. Each combat round reduces them by one. */
  statMods?: StatModifier[];
  /** Spellcaster class id (see Classes.js). A present value that names a
   * caster class lets this creature cast. Absent marks a non-caster. */
  class?: string;
  /** The chosen subclass id, if any. */
  subclass?: string;
  /** Caster level, which drives the slot maxima and the save DC. It
   * defaults to `level`, or to 1 when the creature has no level. */
  casterLevel?: number;
  /** Learned cantrips and spells (spell ids). Present only on casters. */
  spellbook?: Spellbook;
  /** Spell-slot pools (`slots-1` through `slots-9`). Present only on
   * casters. */
  resources?: ResourcePool[];
}

/**
 * A reusable creature blueprint, saved to the campaign bestiary or to the
 * campaign-independent library. A template is a Creature minus identity,
 * placement, and live state. The gear fields follow the same explicit rule
 * as Creature. The app rebuilds slot pools from class and casterLevel on
 * spawn, so the template stores no resources.
 */
export interface CreatureTemplate {
  id: string;
  name: string;
  disposition: Disposition;
  maxHP: number;
  stats: Record<string, number>;
  weapon: EnemyWeapon | null;
  armor: EnemyArmor | null;
  level?: number;
  tier?: EnemyTier;
  role?: string;
  notes?: string;
  class?: string;
  subclass?: string;
  casterLevel?: number;
  spellbook?: Spellbook;
}
