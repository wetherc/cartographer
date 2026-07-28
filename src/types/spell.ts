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

/** Several separately-rolled projectiles fired by one cast — Scorching Ray's
 * rays, Eldritch Blast's beams, Magic Missile's darts. Each picks its own
 * creature and rolls its own attack, so its presence changes how the effect's
 * `damage` reads: per projectile rather than per target. */
export interface SpellProjectiles {
  /** How many the spell fires at its base level. */
  count: number;
  /** How many more per scaling increment — a slot level above the spell's own
   * for a leveled spell, a cantrip breakpoint for a cantrip. */
  perStep?: number;
  /** True when the projectiles hit without an attack roll (Magic Missile). */
  autoHit?: boolean;
}

/** A spell attack roll resolved against the target's AC, dealing damage on a
 * hit (crit doubles the dice). With `projectiles` the cast rolls once per
 * projectile instead, and `damage` is what one projectile deals. */
export interface SpellAttackEffect {
  kind: 'attack';
  damage: DamagePart[];
  projectiles?: SpellProjectiles;
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

/** How long a cast takes. `action`, `bonus`, and `reaction` are the three
 * in-combat costs; `minutes` and `hours` carry an `amount`; `special` holds text
 * that neither the parser nor the form could read as any of the above. */
export interface CastingTime {
  kind: 'action' | 'bonus' | 'reaction' | 'minutes' | 'hours' | 'special';
  /** How many minutes or hours, for those two kinds. */
  amount?: number;
  /** What the reaction responds to, e.g. 'which you take when you see a
   * creature casting a spell'. Only meaningful for `reaction`. */
  trigger?: string;
  /** The original text, for `special`. */
  text?: string;
}

/** How long a spell lasts once cast. The amount-bearing kinds carry `amount`;
 * `upTo` marks a duration the caster may end early, which is how 'up to 1
 * minute' differs from a flat '1 minute'. */
export interface SpellDuration {
  kind: 'instantaneous' | 'rounds' | 'minutes' | 'hours' | 'days' | 'until-dispelled' | 'special';
  /** How many rounds, minutes, hours, or days, for those four kinds. */
  amount?: number;
  /** True when the printed duration reads 'up to' the amount. */
  upTo?: boolean;
  /** The original text, for `special`. */
  text?: string;
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
  castingTime: CastingTime;
  range: string;
  /** Component letters present, e.g. ['V', 'S', 'M']. */
  components: string[];
  duration: SpellDuration;
  concentration: boolean;
  ritual: boolean;
  description: string;
  /** How many creatures one cast can resolve against, before scaling adds more.
   * 0 means the spell covers an area rather than a fixed number of creatures, so
   * the caster picks any number of them. Absent counts as 1. */
  targetCount?: number;
  effect: SpellEffect;
  /** How the spell scales with slot level or caster level; absent = no scaling. */
  scaling?: SpellScaling;
}
