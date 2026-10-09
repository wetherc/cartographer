import type { CombatTarget } from '../app/combatants.js';
import type { ActionCost } from './combat.js';
import type { SpellCaster } from './entities.js';
import type { ModalField } from './modal.js';
import type { Ability, CastingTime, Spell } from './spell.js';

/** Why a cast cannot go ahead. The caller shows the message and stops.
 * There are two reasons: nothing to target, and no slot high enough for a
 * leveled spell. */
export interface CastRefused {
  ok: false;
  message: string;
}

/** Everything a cast needs, worked out before the dialog opens. This is the
 * contract between the four cast modules: `spellCast.js` builds it,
 * `spellCastFields.js` restates its fields when one changes, and
 * `spellCastResolve.js` rolls and applies it.
 *
 * `actionCost` is what the cast takes off the caster's turn. It is null when
 * nothing does: no fight is running, or the casting time is longer than a
 * turn. `actionBlocked` is true when the turn cannot pay for the cast, which
 * the opt-out in the dialog is the way past. */
export interface CastPlan {
  ok: true;
  /** The party character or creature that casts the spell. */
  entity: import('./entities.js').Character | import('./creature.js').Creature;
  spell: Spell;
  caster: SpellCaster;
  targets: CombatTarget[];
  saveAbility: Ability | null;
  slotLevels: number[];
  /** True for a Wizard's unprepared ritual, which casts only as a ritual. */
  ritualOnly?: boolean;
  sourceClass: string | undefined;
  dc: number;
  material: ReturnType<typeof import('../entities/MaterialCheck.js').materialCheck>;
  armor: string[];
  actionCost?: ActionCost | null;
  actionBlocked?: boolean;
  /** Why the bonus action spell rule blocks this cast, or null (see `SpellRule.js`). */
  ruleBlock?: string | null;
  /** The turn flag this cast sets for the rule, or null. */
  spellFlag?: import('./combat.js').TurnFlag | null;
  castingTime?: CastingTime;
  /** Present for a cast that spends no slot because an earlier turn paid for
   * it: a repeat of a spell the caster still keeps open. */
  free?: CastFree | null;
  /** Present for a cast through a warlock invocation: at will with no slot,
   * or once per long rest with a slot. */
  invocation?: import('./invocation.js').InvocationCast | null;
  fields: ModalField[];
}

/** A cast that costs no slot. It resolves at `slotLevel`, the level the first
 * cast used. `repeat` marks a repeat of a spell still open from an earlier
 * turn, which needs no concentration of its own and no component. A cast at
 * will through an invocation has no `repeat` and resolves at the spell's own
 * level. */
export interface CastFree {
  slotLevel: number;
  repeat?: boolean;
}

/** How the GM picked to pay for a cast that has more than one way (see
 * `CastRoute.castRoutes`): repeat an open spell for free or cast it anew, or
 * cast an invocation's spell at will or with a slot. */
export type CastRoute = 'repeat' | 'anew' | 'invocation' | 'slot';

type CastTarget = import('../entities/Casting.js').CastTarget;
type DamageRoll = ReturnType<typeof import('../dice/DiceRoller.js').rollDamage>;
type TargetSave = ReturnType<typeof import('../entities/CastRolls.js').targetSave>;
type DamagePart = import('./entities.js').DamagePart;

/** A cast target that the app built from a combatant, which always has an id
 * and a name. The app reads outcomes with this target type. */
export type NamedCastTarget = CastTarget & { id: string; name: string };

/** What the caster's rider chips added to one roll, or null when it held none. */
export type CastRider = TargetSave['rider'];

/** The save or chip that a hit brings with it (`SpellOnHit`). With no save,
 * only the chip is named. With a save, `condition` is null when the save kept
 * the chip off. */
export type OnHitOutcome =
  | { condition: string; save?: undefined }
  | {
      save: TargetSave['roll'];
      dc: number;
      saved: boolean;
      rider: CastRider;
      autoFailedBy: string | null;
      condition: string | null;
    };

/** The fields every hit of an attack spell may bring beyond its damage. */
interface AttackHitExtras {
  /** The dice a hit leaves on the target for later turns. */
  ongoing?: DamagePart[];
  onHit?: OnHitOutcome;
}

/** An attack spell with one attack roll per target. `damage` is null on a
 * miss, unless the spell splashes on a miss, where `halved` is true. */
export interface SingleAttackOutcome<T extends CastTarget = CastTarget> extends AttackHitExtras {
  target: T;
  attack: import('./dice.js').DiceResult | null;
  natural: number;
  crit: boolean;
  hit: boolean;
  ac: number;
  damage: DamageRoll | null;
  rider: CastRider;
  hitNote?: string;
  halved?: boolean;
  shots?: undefined;
}

/** An attack spell with projectiles. Each shot rolls on its own, and
 * `damage` merges the shots that hit, or is null when none did. */
export interface ProjectileAttackOutcome<
  T extends CastTarget = CastTarget,
> extends AttackHitExtras {
  target: T;
  ac: number;
  shots: import('../entities/CastRolls.js').ProjectileShot[];
  fired: number;
  hits: number;
  hit: boolean;
  damage: DamageRoll | null;
}

export type AttackOutcome<T extends CastTarget = CastTarget> =
  SingleAttackOutcome<T> | ProjectileAttackOutcome<T>;

/** A save spell's target that the spell passes over: a type rule skipped
 * it, an HP pool ran out, or its HP is over the limit. */
export interface SaveUnaffectedOutcome<T extends CastTarget = CastTarget> {
  target: T;
  unaffectedBy: string;
  saved: true;
  taken: 0;
  condition: null;
  noRoll?: boolean;
  pool?: HpPoolRoll;
}

/** A save spell's target that rolled its save, or failed it with no roll.
 * `save` is null when nothing rolled, and `autoFailedBy` then names why. */
export interface SaveRolledOutcome<T extends CastTarget = CastTarget> {
  target: T;
  unaffectedBy?: undefined;
  save: TargetSave['roll'];
  dc: number;
  saved: boolean;
  taken: number;
  damage: DamageRoll;
  maxDamage?: boolean;
  rider: CastRider;
  autoFailedBy: string | null;
  condition: string | null;
  conditionRider: import('./entities.js').RollRider | null;
  ongoing?: DamagePart[];
  evaded?: boolean;
  noRoll?: boolean;
  pool?: HpPoolRoll;
}

export type SaveOutcome<T extends CastTarget = CastTarget> =
  SaveUnaffectedOutcome<T> | SaveRolledOutcome<T>;

/** The one roll of an HP pool (Sleep), shared by every outcome of the cast. */
export type HpPoolRoll = ReturnType<typeof import('../entities/HpPool.js').rollHpPool>;

/** A heal spell's target. `unaffectedBy` names the type rule that skipped
 * it, and `healBonus` the flat bonus of a class feature. */
export interface HealOutcome<T extends CastTarget = CastTarget> {
  target: T;
  healing: DamageRoll;
  healBonus?: number;
  unaffectedBy?: string;
}

/** A buff spell's target: the chip it gains, with its rider, mods, hit
 * rider, and the temporary HP the cast rolled. */
export interface BuffOutcome<T extends CastTarget = CastTarget> {
  target: T;
  condition: string;
  rider: import('./entities.js').RollRider | null;
  mods: import('./entities.js').ChipMods | null;
  hit?: import('./entities.js').HitRider;
  tempHP?: { total: number; text: string };
}

/** The one outcome of a summons: which template to spawn, and how many. */
export interface SummonsOutcome {
  creature: string;
  count: number;
}

/** One outcome of `castSpell`. The spell's effect kind decides the member,
 * so a reader that switched on `spell.effect.kind` casts the list to its
 * kind's type. A utility spell gives no outcomes. */
export type CastOutcome<T extends CastTarget = CastTarget> =
  AttackOutcome<T> | SaveOutcome<T> | HealOutcome<T> | BuffOutcome<T> | SummonsOutcome;
