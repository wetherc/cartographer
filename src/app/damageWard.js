import { confirmModal } from '../ui/Modal.js';
import { reactionSpells } from '../combat/Reactions.js';
import { canSpend } from '../combat/ActionBudget.js';
import { isDowned, mayActOn } from '../combat/CombatView.js';
import { canReact } from '../entities/ConditionEffects.js';
import { buffCondition } from '../entities/Casting.js';
import { defensesOf } from '../entities/DamageDefenses.js';
import { landingDamage, wardType } from '../entities/DamageWard.js';
import { isGM } from '../view/ViewRole.js';
import { findCombatant, spellsOf } from './combatants.js';
import { combatTargets, rosterTargets } from './spellTargets.js';
import { castPlan } from './spellCast.js';
import { resolveCast } from './spellCastResolve.js';

/**
 * The pause after the damage roll of a weapon hit, a spell attack hit, or a
 * save spell, for a defender that can resist the damage with a reaction
 * spell. The spell is a buff with a reaction casting time whose chip resists
 * a type in the damage, through `mods.resist` or a `resistChoice` pick. A
 * yes casts it through the normal cast path, which spends the reaction and
 * the slot and lays down the chip, and the damage then reads the defender's
 * defenses with the new chip. The pause follows the same viewer rule as the
 * Shield pause in `shieldWard.js`.
 */

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../dice/DiceRoller.js').DamageGroup} DamageGroup */

/**
 * One defender's ready damage reaction: the spell, the damage type it
 * resists in this hit, and the cast plan that casts it on the defender.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   spell: import('../types/spell.js').Spell,
 *   type: string,
 *   plan: import('../types/cast.js').CastPlan,
 *   store: (next: any) => void,
 * }} DamageWard
 */

/**
 * The reaction that the defender could cast against a hit from
 * `attackerId`, or null. The gates match `shieldWard.pendingWard`: the
 * defender can act and holds its reaction, the viewer may act for it, and it
 * can pay for the cast. The spell has to resist a type in the hit that the
 * defender does not resist already.
 * @param {AppContext} app
 * @param {string} defenderId
 * @param {string} attackerId
 * @param {DamageGroup[]} groups the hit's damage, one group per type
 * @param {{ nonmagical?: boolean }} [options] as for `defendedDamage`
 * @returns {DamageWard | null}
 */
export function pendingDamageWard(app, defenderId, attackerId, groups, options = {}) {
  if (defenderId === attackerId) return null;
  const found = findCombatant(app, defenderId);
  if (!found || isDowned(found) || !canReact(found.entity.conditions ?? [])) return null;
  const viewer = {
    gm: isGM(app.state.role),
    boundCharacterId: app.actions.getBoundCharacterId?.() ?? null,
  };
  if (!mayActOn(found, viewer, defenderId)) return null;
  const combat = app.state.combat;
  const participant = combat?.order.find((p) => p.id === defenderId) ?? null;
  if (combat && (!participant || !canSpend(participant, 'reaction'))) return null;
  const held = new Set((found.entity.conditions ?? []).map((c) => c.name));
  const defenses = defensesOf(found.entity, { nonmagical: !!options.nonmagical });
  for (const spell of reactionSpells(spellsOf(app, defenderId))) {
    if (held.has(buffCondition(spell))) continue;
    const type = wardType(spell, groups, defenses);
    if (!type) continue;
    const offered =
      combat && participant
        ? combatTargets(app, combat, participant, spell)
        : rosterTargets(app, spell, defenderId);
    if (!offered.some((t) => t.id === defenderId)) continue;
    const plan = castPlan(app, found.entity, spell, offered);
    if (!plan.ok || plan.actionBlocked || plan.armor.length > 0) continue;
    if (plan.material.required && !plan.material.satisfied) continue;
    return {
      id: defenderId,
      name: found.entity.name,
      spell,
      type,
      plan,
      store: /** @type {(next: any) => void} */ (found.store),
    };
  }
  return null;
}

/**
 * Ask whether the defender casts its damage reaction, and cast it on a yes
 * at the lowest slot it can spend, with the hit's type as the resist pick.
 * @param {AppContext} app
 * @param {DamageWard} ward
 * @param {string} message what the hit did, ahead of the question
 * @param {{ ask?: import('./shieldWard.js').WardAsk }} [opts]
 * @returns {Promise<boolean>} whether the cast went ahead
 */
export async function offerDamageWard(app, ward, message, { ask = confirmModal } = {}) {
  const name = ward.spell.name;
  const yes = await ask(`${message} Cast ${name} as a reaction (resist ${ward.type})?`, {
    title: 'Reaction',
    confirmLabel: `Cast ${name}`,
    cancelLabel: 'Take the damage',
  });
  if (!yes) return false;
  const slot = ward.plan.slotLevels[0];
  await resolveCast(
    app,
    ward.plan,
    { target: ward.id, 'resist-type': ward.type, ...(slot ? { slot: String(slot) } : {}) },
    { writeBack: ward.store },
  );
  return true;
}

/**
 * The line ahead of the question for one outcome of a damage spell.
 * @param {import('../types/spell.js').Spell} spell
 * @param {any} o one outcome of the cast
 * @param {number} total the damage before defenses
 * @returns {string}
 */
function spellDamageMessage(spell, o, total) {
  const name = o.target.name;
  if (spell.effect.kind === 'attack') {
    const hit = o.shots
      ? `${spell.name}: ${o.hits} of ${o.fired} hit ${name}`
      : `${spell.name} hits ${name}`;
    return `${hit} for ${total} damage.`;
  }
  if (o.noRoll) return `${spell.name} deals ${total} damage to ${name}.`;
  const verdict = o.saved ? 'saves' : 'fails the save';
  return `${name} ${verdict} against ${spell.name} and takes ${total} damage.`;
}

/**
 * Offer the damage reaction to each target of an attack or save spell that
 * the spell is about to damage, in target order, before `applyOutcomes`
 * writes the damage. A yes casts the reaction, and the damage then lands
 * through the defenses with the new chip. The return is null when no target
 * has a reaction to offer, so the caller applies the result without
 * waiting. Each question waits for the one before it, and the app looks up
 * each target's reaction again when its question comes, because an earlier
 * cast can change what a later target can do.
 * @template {{ outcomes: object[] }} R
 * @param {AppContext} app
 * @param {import('../types/spell.js').Spell} spell
 * @param {R} result
 * @param {string} casterId
 * @param {{ ask?: import('./shieldWard.js').WardAsk }} [opts]
 * @returns {Promise<R> | null}
 */
export function wardSpellDamage(app, spell, result, casterId, opts = {}) {
  const kind = spell.effect.kind;
  if (kind !== 'attack' && kind !== 'save') return null;
  const outcomes = /** @type {any[]} */ (result.outcomes);
  /** @param {any} o */
  const guardOf = (o) => {
    const { groups, total } = landingDamage(kind, o);
    const ward =
      o.target.id && total > 0 ? pendingDamageWard(app, o.target.id, casterId, groups) : null;
    return ward ? { ward, total } : null;
  };
  if (!outcomes.some(guardOf)) return null;
  return (async () => {
    for (const o of outcomes) {
      const guard = guardOf(o);
      if (guard)
        await offerDamageWard(app, guard.ward, spellDamageMessage(spell, o, guard.total), opts);
    }
    return result;
  })();
}
