import type { Ability } from './spell.js';

/** A class's spellcasting progression. Full casters gain 9th-level slots
 * (Wizard, Cleric, Bard, Druid, Sorcerer). Half casters top out at 5th level
 * (Paladin, Ranger). Third casters top out at 4th level (Eldritch Knight,
 * Arcane Trickster). Pact is the Warlock's short-rest slots. 'none' marks a
 * non-caster. */
export type CasterType = 'full' | 'half' | 'third' | 'pact' | 'none';

/** How a class manages its leveled spells. A prepared caster swaps its list
 * on a rest (Cleric, Druid, Paladin, Wizard). A known caster fixes its list
 * as it levels (Bard, Ranger, Sorcerer, Warlock). Non-casters are 'none'. */
export type SpellKnownRule = 'prepared' | 'known' | 'none';

/** An armor proficiency category. */
export type ArmorProficiency = 'light' | 'medium' | 'heavy' | 'shield';

/** A weapon proficiency category (specific weapons are named individually). */
export type WeaponCategory = 'simple' | 'martial';

/** A "choose N skills from this list" grant. `from` holds skill ids from
 * data/skills.js. An empty list means the player can choose from any skill. */
export interface SkillChoice {
  choose: number;
  from: string[];
}

/** Ability-score minimums that gate multiclassing into or out of a class, as
 * alternatives. Meeting every minimum in any one entry satisfies the
 * requirement (Fighter needs STR 13 or DEX 13; Paladin needs STR 13 and CHA
 * 13). An empty list means no requirement. */
export type ClassPrereq = Record<string, number>[];

/** The reduced proficiency grant for taking this class as a class beyond the
 * first (the PHB multiclassing table): no saving throws, and only a subset
 * of the class's armor, weapon, and tool grants. `skillChoice`, when
 * present, is the grant's "choose one skill" pick, left to the player. */
export interface MulticlassGrant {
  armor: ArmorProficiency[];
  weaponCategories: WeaponCategory[];
  weaponNamed: string[];
  tools: string[];
  skillChoice?: SkillChoice;
}

/** A playable class's mechanical spine: the fields that the spell system
 * reads to gate learning, derive slots, and compute the save DC and attack
 * bonus, plus the character-foundation fields (proficiencies, skill
 * choices, subclass and ASI schedule, features by level). A non-caster
 * class carries casterType 'none' and no spellAbility. */
export interface ClassDef {
  id: string;
  name: string;
  /** The die rolled for hit points at each level (6, 8, 10, 12). */
  hitDie: number;
  casterType: CasterType;
  /** The ability that powers this class's spells. Absent for non-casters. */
  spellAbility?: Ability;
  /** The spell-list id the class draws from, usually its own id. Absent for
   * non-casters. */
  spellListId?: string;
  knownRule: SpellKnownRule;
  /** True for a class with ritual casting (Bard, Cleric, Druid, Wizard),
   * which can cast a ritual spell without spending a slot. Absent means the
   * class cannot. */
  ritual?: boolean;
  /** Cantrips known by character level, where index 0 is level 1. Empty for
   * a class that knows no cantrips. A level past the array's end uses the
   * last entry. */
  cantripsKnown: number[];
  /** The two abilities the class is proficient in saving with. */
  savingThrows: Ability[];
  armor: ArmorProficiency[];
  weaponCategories: WeaponCategory[];
  /** Specific weapon names granted beyond the categories (lowercase). */
  weaponNamed: string[];
  skillChoice: SkillChoice;
  /** The level the class picks its subclass at. */
  subclassLevel: number;
  /** What the class calls its subclass ("Sacred Oath", "Arcane Tradition"). */
  subclassLabel?: string;
  /** The levels that grant an ability score improvement, or later a feat. */
  asiLevels: number[];
  /** Ability-score minimums required to multiclass into or out of this class. */
  multiclassPrereq: ClassPrereq;
  /** The reduced proficiencies gained when this class is taken as a class
   * beyond the first. */
  multiclassGrant: MulticlassGrant;
  /** Feature names unlocked at each level. These are display names only,
   * not yet given a mechanical effect. */
  featuresByLevel: Record<number, string[]>;
}

/** One of a character's class memberships: which class, at what level, in
 * which subclass. A single-class character has one of these. The list shape
 * leaves room for future multiclass work without a later schema change. */
export interface ClassRef {
  classId: string;
  level: number;
  subclass?: string;
}
