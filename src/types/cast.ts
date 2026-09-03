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
  /** The character or combatant casting. The write-back decides its shape. */
  entity: any;
  spell: Spell;
  caster: SpellCaster;
  targets: CombatTarget[];
  saveAbility: Ability | null;
  slotLevels: number[];
  sourceClass: string | undefined;
  dc: number;
  material: ReturnType<typeof import('../entities/Casting.js').materialCheck>;
  armor: string[];
  actionCost?: ActionCost | null;
  actionBlocked?: boolean;
  castingTime?: CastingTime;
  fields: ModalField[];
}
