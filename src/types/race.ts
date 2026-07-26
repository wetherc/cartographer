import type { Ability } from './spell.js';

/** A creature size category (SRD playable races are small or medium). */
export type Size = 'small' | 'medium';

/** A playable race's mechanical spine: fixed ability-score increases, size and
 * speed, darkvision, innate damage resistances, and the proficiencies it
 * grants, plus a trait-name scaffold for everything narrative or choice-based
 * (a half-elf's two floating +1s, a dwarf's tool-proficiency pick). Characters
 * store a race id plus a snapshot of these applied traits, so a definition
 * that later disappears from the library still round-trips. */
export interface RaceDef {
  id: string;
  name: string;
  /** Fixed ability increases; choice-based increases live in `traits`. */
  abilityIncreases: Partial<Record<Ability, number>>;
  size: Size;
  /** Walking speed in feet. */
  speed: number;
  /** Darkvision range in feet; 0 means none. */
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
  /** Racial trait names — a display scaffold, not yet mechanically
   * interpreted (same posture as ClassDef.featuresByLevel). */
  traits: string[];
}
