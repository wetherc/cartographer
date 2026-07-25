import type { DamagePart } from './entities.js';

/** The six ability scores, the keys of a character's stat block. */
export type Ability = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

/** The eight schools of magic. */
export type SpellSchool =
  | 'abjuration'
  | 'conjuration'
  | 'divination'
  | 'enchantment'
  | 'evocation'
  | 'illusion'
  | 'necromancy'
  | 'transmutation';

/** A spell attack roll resolved against the target's AC, dealing damage on a
 * hit (crit doubles the dice). */
export interface SpellAttackEffect {
  kind: 'attack';
  damage: DamagePart[];
}

/** A saving throw the target rolls against the caster's spell save DC. On a
 * failure the full damage lands (and any condition is imposed); on a success
 * the target takes half when halfOnSave, else nothing. */
export interface SpellSaveEffect {
  kind: 'save';
  saveAbility: Ability;
  damage: DamagePart[];
  halfOnSave: boolean;
  /** A condition name imposed on a failed save (e.g. 'Frightened'). */
  condition?: string;
}

/** Restorative magic: healing dice applied to the target. */
export interface SpellHealEffect {
  kind: 'heal';
  healing: DamagePart[];
}

/** A spell with no roll to resolve — its rules live in the description text. */
export interface SpellUtilityEffect {
  kind: 'utility';
}

export type SpellEffect =
  SpellAttackEffect | SpellSaveEffect | SpellHealEffect | SpellUtilityEffect;

/** How a spell grows when cast with a higher-level slot (leveled spells) or as
 * the caster levels up (cantrips scale at levels 5/11/17). */
export interface SpellScaling {
  /** Extra damage or healing dice added per slot level above the spell's base
   * level (leveled spells), or at each cantrip breakpoint (cantrips). */
  damagePerLevel?: DamagePart[];
  /** Extra targets gained per slot level above base (e.g. Magic Missile). */
  targetsPerLevel?: number;
}

/** A single spell, identical in shape whether it is a built-in default or a
 * GM-authored/imported entry. */
export interface Spell {
  id: string;
  name: string;
  /** 0 for a cantrip; 1-9 for a leveled spell. */
  level: number;
  school: SpellSchool;
  /** Class ids that can learn the spell (its spell lists). */
  classes: string[];
  castingTime: string;
  range: string;
  /** Component letters present, e.g. ['V', 'S', 'M']. */
  components: string[];
  duration: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
  effect: SpellEffect;
  /** How the spell scales with slot level or caster level; absent = no scaling. */
  scaling?: SpellScaling;
}
