import type { Ability } from './spell.js';

/** A class's spellcasting progression: full casters gain 9th-level slots
 * (Wizard, Cleric, Bard, Druid, Sorcerer), half casters top out at 5th
 * (Paladin, Ranger), third casters at 4th (Eldritch Knight, Arcane Trickster),
 * pact is Warlock's short-rest slots, and 'none' is a non-caster. */
export type CasterType = 'full' | 'half' | 'third' | 'pact' | 'none';

/** How a class manages its leveled spells: prepared casters swap their list on
 * a rest (Cleric, Druid, Paladin, Wizard), known casters fix it as they level
 * (Bard, Ranger, Sorcerer, Warlock). Non-casters are 'none'. */
export type SpellKnownRule = 'prepared' | 'known' | 'none';

/** A playable class's mechanical spine: the fields the spell system reads to
 * gate learning, derive slots, and compute save DC / attack bonus. Non-caster
 * classes carry casterType 'none' and no spellAbility. */
export interface ClassDef {
  id: string;
  name: string;
  /** The die rolled for hit points at each level (6, 8, 10, 12). */
  hitDie: number;
  casterType: CasterType;
  /** The ability that powers this class's spells; absent for non-casters. */
  spellAbility?: Ability;
  /** The spell-list id the class draws from (usually its own id); absent for
   * non-casters. */
  spellListId?: string;
  knownRule: SpellKnownRule;
  /** Cantrips known by character level (index 0 = level 1); empty for classes
   * that know no cantrips. Values past the array's end use the last entry. */
  cantripsKnown: number[];
}
