import type { DamagePart, RollRider } from './entities.js';

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

/** Several separately rolled projectiles fired by one cast, for example
 * Scorching Ray's rays, Eldritch Blast's beams, or Magic Missile's darts.
 * Each projectile picks its own creature and rolls its own attack. Its
 * presence changes how the effect's `damage` reads: per projectile, not per
 * target. */
export interface SpellProjectiles {
  /** How many the spell fires at its base level. */
  count: number;
  /** How many more per scaling increment: a slot level above the spell's
   * own for a leveled spell, or a cantrip breakpoint for a cantrip. */
  perStep?: number;
  /** True when the projectiles hit without an attack roll (Magic Missile). */
  autoHit?: boolean;
}

/** A spell attack roll resolved against the target's AC, dealing damage on
 * a hit. A critical hit doubles the dice. With `projectiles` the cast rolls
 * once per projectile instead, and `damage` is what one projectile deals. */
export interface SpellAttackEffect {
  kind: 'attack';
  damage: DamagePart[];
  projectiles?: SpellProjectiles;
}

/** A saving throw that the target rolls against the caster's spell save DC.
 * On a failure the full damage lands, and any condition is imposed. On a
 * success the target takes half damage when halfOnSave, or nothing. */
export interface SpellSaveEffect {
  kind: 'save';
  saveAbility: Ability;
  damage: DamagePart[];
  halfOnSave: boolean;
  /** A condition name imposed on a failed save, for example 'Frightened'. */
  condition?: string;
  /** True when the imposed condition lets the target retry the save at the
   * end of each of its turns, ending the effect on a success (Hold Person).
   * Absent means the condition runs for the spell's whole duration. */
  saveEnds?: boolean;
  /** What the imposed condition adds to the target's later rolls (Bane's
   * -1d4). It rides on the chip, so it lasts as long as the chip does. Only
   * meaningful alongside a condition. */
  rider?: RollRider;
}

/** Restorative magic: healing dice applied to the target. */
export interface SpellHealEffect {
  kind: 'heal';
  healing: DamagePart[];
}

/** A spell that puts a condition chip on each willing target, with no roll
 * to resolve. The chip carries the cast's source, so it comes off when the
 * caster stops holding the spell. Bless, Bane's opposite number, and
 * Guidance work this way, as does a chip that only names a state such as
 * Invisible. */
export interface SpellBuffEffect {
  kind: 'buff';
  /** What the chip is called. Absent means the chip carries the spell's own
   * name, which is what a GM who types nothing wants. */
  condition?: string;
  /** What the chip adds to the target's later rolls. Absent means the chip
   * only names a state. */
  rider?: RollRider;
}

/** A spell with no roll to resolve. Its rules live in the description text. */
export interface SpellUtilityEffect {
  kind: 'utility';
}

export type SpellEffect =
  SpellAttackEffect | SpellSaveEffect | SpellHealEffect | SpellBuffEffect | SpellUtilityEffect;

/** How a spell grows when cast with a higher-level slot (leveled spells), or
 * as the caster levels up (cantrips scale at levels 5, 11, and 17). */
export interface SpellScaling {
  /** Extra damage or healing dice added per slot level above the spell's
   * base level (leveled spells), or at each cantrip breakpoint (cantrips). */
  damagePerLevel?: DamagePart[];
  /** Extra targets gained per slot level above base, for example Magic Missile. */
  targetsPerLevel?: number;
}

/** How long a cast takes. `action`, `bonus`, and `reaction` are the three
 * in-combat costs. `minutes` and `hours` carry an `amount`. `special` holds
 * text that neither the parser nor the form can read as any of the above. */
export interface CastingTime {
  kind: 'action' | 'bonus' | 'reaction' | 'minutes' | 'hours' | 'special';
  /** How many minutes or hours, for those two kinds. */
  amount?: number;
  /** What the reaction responds to, for example 'which you take when you
   * see a creature casting a spell'. Only meaningful for `reaction`. */
  trigger?: string;
  /** The original text, for `special`. */
  text?: string;
}

/** How long a spell lasts once cast. The amount-bearing kinds carry
 * `amount`. `upTo` marks a duration that the caster can end early, which is
 * how 'up to 1 minute' differs from a flat '1 minute'. */
export interface SpellDuration {
  kind: 'instantaneous' | 'rounds' | 'minutes' | 'hours' | 'days' | 'until-dispelled' | 'special';
  /** How many rounds, minutes, hours, or days, for those four kinds. */
  amount?: number;
  /** True when the printed duration reads 'up to' the amount. */
  upTo?: boolean;
  /** The original text, for `special`. */
  text?: string;
}

/** The material component that a spell needs, for the spells whose material
 * is worth naming. `text` is the printed component ('diamonds worth 300
 * gp'). `costGP` is that cost as a number, where the spell states one.
 * `consumed` marks a material that the cast destroys. The app enforces only
 * a consumed material against the caster's inventory. An unconsumed
 * material is assumed covered by a component pouch or a spellcasting
 * focus, the same as in play. */
export interface SpellMaterials {
  text: string;
  costGP?: number;
  consumed: boolean;
}

/** A single spell, identical in shape whether it is a built-in default or a
 * GM-authored or imported entry. */
export interface Spell {
  id: string;
  name: string;
  /** 0 for a cantrip. 1 through 9 for a leveled spell. */
  level: number;
  school: SpellSchool;
  /** Class ids that can learn the spell (its spell lists). */
  classes: string[];
  castingTime: CastingTime;
  range: string;
  /** Component letters present, for example ['V', 'S', 'M']. */
  components: string[];
  /** What the M component is, for a spell whose material is worth naming.
   * Absent means the letters are the whole story. */
  materials?: SpellMaterials;
  duration: SpellDuration;
  concentration: boolean;
  ritual: boolean;
  description: string;
  /** How many creatures one cast can resolve against, before scaling adds
   * more. 0 means the spell covers an area instead of a fixed number of
   * creatures, so the caster picks any number of targets. Absent counts as 1. */
  targetCount?: number;
  effect: SpellEffect;
  /** How the spell scales with slot level or caster level. Absent means no
   * scaling. */
  scaling?: SpellScaling;
}
