import type { Ability } from './spell.js';

/** A creature size category (SRD playable races are small or medium). */
export type Size = 'small' | 'medium';

/** A playable race's mechanical fields: fixed ability-score increases, size
 * and speed, darkvision, innate damage resistances, the proficiencies it
 * grants, the ability and skill choices it offers, and trait names for
 * everything else, for example a dwarf's tool-proficiency pick. A character
 * stores a race id plus a snapshot of these applied traits, so a definition
 * that later disappears from the library still round-trips. */
export interface RaceDef {
  id: string;
  name: string;
  /** Fixed ability increases. Choice-based increases live in `abilityChoice`. */
  abilityIncreases: Partial<Record<Ability, number>>;
  size: Size;
  /** Walking speed in feet. */
  speed: number;
  /** Darkvision range in feet. 0 means none. */
  darkvision: number;
  /** Damage types resisted innately (lowercase). */
  resistances: string[];
  /** Skill proficiencies granted (ids from data/skills.js). */
  skills: string[];
  /** Weapon proficiencies granted (lowercase weapon names). */
  weapons: string[];
  /** Tool proficiencies granted. */
  tools: string[];
  /** Languages known. */
  languages: string[];
  /** True when armor too heavy for the character's Strength does not cost
   * the character speed (the Dwarf). Absent means the usual 10 ft penalty. */
  keepsSpeedInArmor?: boolean;
  /** Extra maximum HP for each class level the character has (the Hill
   * Dwarf's Dwarven Toughness). Absent means none. */
  hpPerLevel?: number;
  /** A floating ability increase: `count` different abilities, none of them
   * in `exclude`, each gain `amount` (the Half-Elf: two others +1). */
  abilityChoice?: { count: number; amount: number; exclude: Ability[] };
  /** Extra skill proficiencies of the player's choice (the Half-Elf's Skill
   * Versatility). */
  skillChoice?: { count: number };
  /** Race trait names. These are display names only, not yet given a
   * mechanical effect (the same status as ClassDef.featuresByLevel). */
  traits: string[];
}

/** The mechanical fields of a race as applied to a character: everything
 * but the identity. Stored on the character when a catalog race is
 * assigned, so a definition that is later edited or removed leaves the
 * character playable as built. */
export type RaceSnapshot = Omit<RaceDef, 'id' | 'name'> & {
  /** The skills picked through `skillChoice`. `abilityIncreases` already
   * contains the abilities picked through `abilityChoice`. */
  chosenSkills?: string[];
};

/** The player's picks for a race's choices. */
export interface RacePicks {
  abilities?: string[];
  skills?: string[];
}
