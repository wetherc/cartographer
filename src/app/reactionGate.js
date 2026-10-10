import { canSpend } from '../combat/ActionBudget.js';
import { isDowned, mayActOn } from '../combat/CombatView.js';
import { canReact } from '../entities/ConditionEffects.js';
import { isGM } from '../view/ViewRole.js';
import { findCombatant } from './combatants.js';
import { combatTargets, rosterTargets } from './spellTargets.js';
import { castPlan } from './castPlan.js';

/**
 * The checks that every reaction pause runs before it asks its question.
 * The Shield pause (`shieldWard.js`), the damage pause (`damageWardPrompt.js`),
 * and the Redirect Attack pause (`redirectWard.js`) all ask
 * `reactionCaster` whether the defender may react, and the two spell pauses
 * ask `reactionPlan` whether the defender can pay for the cast.
 */

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').CastPlan} CastPlan */
/** @typedef {import('./combatants.js').Combatant} Combatant */

/**
 * A defender that may react: its id, its record, the fight and its initiative row. Both
 * `combat` and `participant` are null outside a fight.
 * @typedef {{
 *   id: string,
 *   found: Combatant,
 *   combat: CombatState | null,
 *   participant: Participant | null,
 * }} ReactionCaster
 */

/**
 * The defender of an attack from `attackerId` when it may react, or null.
 * The defender is not the attacker, is not down, has no condition that
 * stops reactions, and has a viewer who may act for it (the GM for anyone,
 * or a player for the character their tab is bound to). In a fight it also
 * needs an initiative row with its reaction unspent. With `fight: true` the
 * answer is null outside a fight.
 * @param {AppContext} app
 * @param {string} defenderId
 * @param {string} attackerId
 * @param {{ fight?: boolean }} [options]
 * @returns {ReactionCaster | null}
 */
export function reactionCaster(app, defenderId, attackerId, { fight = false } = {}) {
  const combat = app.state.combat ?? null;
  if ((fight && !combat) || defenderId === attackerId) return null;
  const found = findCombatant(app, defenderId);
  if (!found || isDowned(found) || !canReact(found.entity.conditions ?? [])) return null;
  const viewer = {
    gm: isGM(app.state.role),
    boundCharacterId: app.actions.getBoundCharacterId?.() ?? null,
  };
  if (!mayActOn(found, viewer, defenderId)) return null;
  const participant = combat?.order.find((p) => p.id === defenderId) ?? null;
  if (combat && (!participant || !canSpend(participant, 'reaction'))) return null;
  return { id: defenderId, found, combat, participant };
}

/**
 * The cast plan for the defender's reaction spell on itself, or null when
 * the spell cannot target the defender or the defender cannot pay for it:
 * no slot, an action cost it cannot spend, armor it is not trained in, or a
 * material component it lacks.
 * @param {AppContext} app
 * @param {ReactionCaster} caster
 * @param {Spell} spell
 * @returns {CastPlan | null}
 */
export function reactionPlan(app, { id, found, combat, participant }, spell) {
  const offered =
    combat && participant
      ? combatTargets(app, combat, participant, spell)
      : rosterTargets(app, spell, id);
  if (!offered.some((t) => t.id === id)) return null;
  const plan = castPlan(app, found.entity, spell, offered);
  if (!plan.ok || plan.actionBlocked || plan.armor.length > 0) return null;
  if (plan.material.required && !plan.material.satisfied) return null;
  return plan;
}
