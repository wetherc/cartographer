import { confirmModal } from '../ui/Modal.js';
import { reactionSpells } from '../combat/Reactions.js';
import { canSpend } from '../combat/ActionBudget.js';
import { acOf, isDowned, mayActOn } from '../combat/CombatView.js';
import { canReact } from '../entities/ConditionEffects.js';
import { buffCondition } from '../entities/Casting.js';
import { blockerOf } from '../entities/ChipMods.js';
import { createCondition } from '../entities/Conditions.js';
import { wardTurns, wardedOutcome } from '../entities/CastRolls.js';
import { isGM } from '../view/ViewRole.js';
import { findCombatant, logName, spellsOf } from './combatants.js';
import { combatTargets, rosterTargets } from './spellTargets.js';
import { castPlan } from './spellCast.js';
import { resolveCast } from './spellCastResolve.js';

/**
 * The pause before an attack hits a defender that can raise its AC with a
 * reaction, as Shield does. The attack rolls first. When the roll hits, and
 * a higher AC would turn it into a miss, the tab that rolled asks whether
 * the defender casts the spell. A yes casts it through the normal cast path,
 * which spends the reaction and the slot and lays down the chip, and the
 * attack is then checked again against the new AC. The weapon path in
 * `weaponAttack.js` and the spell path in `spellCastResolve.js` both use it.
 *
 * The question goes only to a viewer who may act for the defender: the GM
 * for anyone, and a player for the character their tab is bound to. An
 * attack that a player tab rolls against a foe never pauses, and the GM
 * casts the foe's Shield by hand from the reaction control.
 */

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').CastPlan} CastPlan */

/**
 * The question the ward asks, answered true to cast. `confirmModal` asks it
 * in the browser, and a test passes its own answer.
 * @typedef {(message: string, options: {
 *   title: string, confirmLabel: string, cancelLabel: string,
 * }) => Promise<boolean>} WardAsk
 */

/**
 * One defender's ready reaction: the spell, the AC it adds once its chip
 * joins the defender's other chips, whether it stops the attacking spell
 * outright, and the cast plan that would cast it on the defender.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   spell: Spell,
 *   bonus: number,
 *   blocks: boolean,
 *   plan: CastPlan,
 *   store: (next: any) => void,
 * }} Ward
 */

/**
 * The AC a buff spell's chip adds, or 0 for a spell whose chip adds none.
 * @param {Spell} spell
 * @returns {number}
 */
function acBonus(spell) {
  return spell.effect.kind === 'buff' ? (spell.effect.mods?.ac ?? 0) : 0;
}

/**
 * The chip that a buff spell lays on its target, with only its mods.
 * @param {Spell} spell
 * @returns {import('../types/entities.js').Condition}
 */
function buffChip(spell) {
  const mods = spell.effect.kind === 'buff' ? spell.effect.mods : undefined;
  return createCondition(buffCondition(spell), null, mods ? { mods } : {});
}

/**
 * How much the defender's AC goes up once the spell's chip joins its other
 * chips. A floor such as Barkskin's 16 can take up part of a flat bonus, so
 * Shield on a defender with a base AC of 12 and Barkskin raises the AC from
 * 16 to 17, which is 1 and not 5.
 * @param {import('../combat/CombatView.js').ResolvedCombatant} found
 * @param {Spell} spell
 * @returns {number}
 */
export function wardRaise(found, spell) {
  const conditions = [...(found.entity.conditions ?? []), buffChip(spell)];
  const next = /** @type {any} */ ({ ...found, entity: { ...found.entity, conditions } });
  return (acOf(next) ?? 0) - (acOf(found) ?? 0);
}

/**
 * The reaction that the defender could cast against an attack from
 * `attackerId`, or null when it has none. The defender needs to be able to
 * act, have its reaction unspent while a fight runs, know a reaction spell
 * whose chip adds AC and that it does not already hold, and have what the
 * cast costs: a slot, the components, and armor it is trained in. The spell
 * has to raise the defender's real AC (see `wardRaise`), or stop the
 * attacking spell outright when `attackSpellId` names one that its chip
 * blocks. When it knows more than one such spell, the one that adds the
 * most AC wins.
 * @param {AppContext} app
 * @param {string} defenderId
 * @param {string} attackerId
 * @param {string} [attackSpellId] the id of the attacking spell, if any
 * @returns {Ward | null}
 */
export function pendingWard(app, defenderId, attackerId, attackSpellId = '') {
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
  const choices = reactionSpells(spellsOf(app, defenderId))
    .filter((spell) => acBonus(spell) > 0 && !held.has(buffCondition(spell)))
    .map((spell) => ({
      spell,
      bonus: wardRaise(found, spell),
      blocks: Boolean(attackSpellId && blockerOf([buffChip(spell)], attackSpellId)),
    }))
    .filter((c) => c.bonus > 0 || c.blocks)
    .sort((a, b) => b.bonus - a.bonus);
  for (const { spell, bonus, blocks } of choices) {
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
      name: found.label,
      spell,
      bonus,
      blocks,
      plan,
      store: /** @type {(next: any) => void} */ (found.store),
    };
  }
  return null;
}

/**
 * Ask whether the defender casts its ward, and cast it on a yes, at the
 * lowest slot it can spend. The return is how much the defender's AC went
 * up, which is 0 on a no or when the cast did not land.
 * @param {AppContext} app
 * @param {Ward} ward
 * @param {string} message what the attack did, ahead of the question
 * @param {{ ask?: WardAsk }} [opts]
 * @returns {Promise<number>}
 */
export async function offerWard(app, ward, message, { ask = confirmModal } = {}) {
  const name = ward.spell.name;
  const gain = [
    ...(ward.bonus > 0 ? [`+${ward.bonus} AC`] : []),
    ...(ward.blocks ? ['blocks the spell'] : []),
  ].join(', ');
  const yes = await ask(`${message} Cast ${name} as a reaction (${gain})?`, {
    title: 'Reaction',
    confirmLabel: `Cast ${name}`,
    cancelLabel: 'Take the hit',
  });
  const before = findCombatant(app, ward.id);
  if (!yes || !before) return 0;
  const acBefore = acOf(before) ?? 0;
  const slot = ward.plan.slotLevels[0];
  await resolveCast(
    app,
    ward.plan,
    { target: ward.id, ...(slot ? { slot: String(slot) } : {}) },
    { writeBack: ward.store },
  );
  const after = findCombatant(app, ward.id);
  return after ? Math.max(0, (acOf(after) ?? 0) - acBefore) : 0;
}

/**
 * The line that says what an attack spell did to one target, ahead of the
 * ward's question.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {any} o one outcome of the cast
 * @returns {string}
 */
function spellHitMessage(app, spell, o) {
  const name = logName(app, o.target);
  if (!o.shots) return `${spell.name} hits ${name} (${o.attack.total} vs AC ${o.ac}).`;
  const how = o.shots[0]?.attack ? `(AC ${o.ac})` : 'automatically';
  return `${spell.name}: ${o.hits} of ${o.fired} hit ${name} ${how}.`;
}

/**
 * Offer a ward to each target of an attack spell that a higher AC would
 * save from a hit, in target order, and return the cast result with each
 * warded outcome checked again. A target that already holds a chip that
 * blocks the spell (Shield against Magic Missile) takes none of its
 * automatic hits, with no question. The return is null when no target has a
 * ward worth offering and no target blocks the spell, so the caller applies
 * the result without waiting.
 * @template {{ outcomes: object[] }} R
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {R} result
 * @param {string} casterId
 * @param {{ ask?: WardAsk }} [opts]
 * @returns {Promise<R> | null}
 */
export function wardSpellAttack(app, spell, result, casterId, opts = {}) {
  const effect = spell.effect;
  if (effect.kind !== 'attack') return null;
  const blocked = (/** @type {any} */ o) =>
    Boolean(o.target.id && blockerOf(findCombatant(app, o.target.id)?.entity.conditions, spell.id));
  const given = /** @type {any[]} */ (result.outcomes);
  const outcomes = given.map((o) => (blocked(o) ? wardedOutcome(effect, o, 0, true) : o));
  const wards = outcomes.map((o) => {
    const ward = o.target.id ? pendingWard(app, o.target.id, casterId, spell.id) : null;
    return ward && wardTurns(effect, o, ward.bonus, ward.blocks) ? ward : null;
  });
  if (!wards.some(Boolean)) {
    const same = outcomes.every((o, i) => o === given[i]);
    return same ? null : Promise.resolve({ ...result, outcomes });
  }
  return (async () => {
    const checked = [];
    for (const [i, o] of outcomes.entries()) {
      const ward = wards[i];
      const raised = ward ? await offerWard(app, ward, spellHitMessage(app, spell, o), opts) : 0;
      checked.push(ward ? wardedOutcome(effect, o, raised, blocked(o)) : o);
    }
    return { ...result, outcomes: checked };
  })();
}
