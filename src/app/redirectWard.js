import { promptModal } from '../ui/Modal.js';
import { canSpend } from '../combat/ActionBudget.js';
import { isDowned, mayActOn } from '../combat/CombatView.js';
import { canReact } from '../entities/ConditionEffects.js';
import { isGM } from '../view/ViewRole.js';
import { combatantsAsTargets, findCombatant } from './combatants.js';

/**
 * The pause when an attack targets a creature with Redirect Attack
 * (`redirectAttack`), such as a goblin boss. The creature can spend its
 * reaction to swap places with an ally, and the ally becomes the target. The
 * pause comes after the attack pays and before the attack roll, so the roll,
 * the AC, the damage, and every effect of the hit use the ally. The weapon
 * path in `weaponAttack.js` and the spell attack path in
 * `spellCastResolve.js` both use it.
 *
 * The fight tracks no positions, and the trait can limit which allies
 * qualify (a goblin boss needs another goblin within 5 feet). So the app
 * offers every ally still standing on the creature's side, and the GM
 * judges who qualifies from the creature's notes.
 *
 * The pause follows the viewer rule of the Shield pause in `shieldWard.js`.
 * Only a viewer who may act for the creature gets the question, so an attack
 * that a player tab rolls against a foe never pauses and names no foe.
 */

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./combatants.js').CombatTarget} CombatTarget */
/** The dialog that asks for the ally. A test passes its own answers. @typedef {typeof promptModal} RedirectPrompt */

/**
 * One creature's ready Redirect Attack: who it is and which allies could take
 * the hit.
 * @typedef {{ id: string, name: string, allies: CombatTarget[] }} Redirect
 */

/**
 * The Redirect Attack that the defender could use against an attack from
 * `attackerId`, or null. It needs a running fight, a defender that has the
 * trait, can act, and holds its reaction, a viewer who may act for it, and at
 * least one ally that is not down. The attacker is never one of the allies.
 * @param {AppContext} app
 * @param {string} defenderId
 * @param {string} attackerId
 * @returns {Redirect | null}
 */
export function pendingRedirect(app, defenderId, attackerId) {
  const combat = app.state.combat;
  if (!combat || defenderId === attackerId) return null;
  const found = findCombatant(app, defenderId);
  if (found?.kind !== 'creature' || found.entity.redirectAttack !== true) return null;
  if (isDowned(found) || !canReact(found.entity.conditions ?? [])) return null;
  const viewer = {
    gm: isGM(app.state.role),
    boundCharacterId: app.actions.getBoundCharacterId?.() ?? null,
  };
  if (!mayActOn(found, viewer, defenderId)) return null;
  const self = combat.order.find((p) => p.id === defenderId);
  if (!self || !canSpend(self, 'reaction')) return null;
  const allies = combatantsAsTargets(app, combat, self, { allies: true }).filter((t) => {
    if (t.id === defenderId || t.id === attackerId) return false;
    const ally = findCombatant(app, t.id);
    return !!ally && !isDowned(ally);
  });
  return allies.length > 0 ? { id: defenderId, name: found.entity.name, allies } : null;
}

/**
 * Ask whether the defender redirects the attack, and to which ally. A pick
 * spends the defender's reaction and logs the swap. The answer is the ally
 * that becomes the target, or null when the defender stays the target.
 * @param {AppContext} app
 * @param {Redirect} redirect
 * @param {string} message who attacks the defender, ahead of the question
 * @param {{ prompt?: RedirectPrompt }} [opts]
 * @returns {Promise<CombatTarget | null>}
 */
export async function offerRedirect(app, redirect, message, { prompt = promptModal } = {}) {
  // Keep target, Escape, and a click outside all resolve to null, so the
  // creature stays the target and keeps its reaction.
  const values = await prompt(
    'Redirect Attack',
    [
      {
        name: 'ally',
        label: 'Ally who becomes the target',
        type: 'select',
        value: redirect.allies[0].id,
        options: redirect.allies.map((a) => ({ value: a.id, label: a.label ?? a.name })),
        full: true,
      },
    ],
    {
      message: `${message} ${redirect.name} can use its reaction to swap places with an ally within 5 feet, and that ally becomes the target. The notes say which allies qualify.`,
      submitLabel: 'Swap places',
      cancelLabel: 'Keep target',
    },
  );
  const ally = redirect.allies.find((a) => a.id === values?.ally);
  if (!ally) return null;
  app.actions.spendBudget?.(redirect.id, 'reaction');
  app.actions.logEvent(
    'combat',
    `${redirect.name} uses Redirect Attack (reaction) and swaps places with ${ally.label ?? ally.name}, who becomes the target.`,
  );
  return ally;
}

/**
 * Offer Redirect Attack to each target of an attack spell, in target order,
 * before the attack rolls. A target that redirects is swapped for the ally
 * in the list. The ally comes from the spell's own target list when it is
 * there, so it keeps the fields that the spell reads, such as its save
 * bonus. The return is null when no target can redirect, so the caller
 * rolls without waiting. Each question waits for the one before it.
 * @template {{ id?: string, name: string }} T
 * @param {AppContext} app
 * @param {string} spellName
 * @param {T[]} chosen the targets of the cast
 * @param {string} casterId
 * @param {T[]} offered every target the spell could pick
 * @param {{ prompt?: RedirectPrompt }} [opts]
 * @returns {Promise<T[]> | null}
 */
export function redirectSpellTargets(app, spellName, chosen, casterId, offered, opts = {}) {
  /** @param {T} t */
  const redirectOf = (t) => (t.id ? pendingRedirect(app, t.id, casterId) : null);
  if (!chosen.some(redirectOf)) return null;
  return (async () => {
    const next = [];
    for (const t of chosen) {
      const redirect = redirectOf(t);
      const ally = redirect
        ? await offerRedirect(app, redirect, `${spellName} targets ${t.name}.`, opts)
        : null;
      next.push(
        ally
          ? (offered.find((o) => o.id === ally.id) ??
              /** @type {T} */ (/** @type {unknown} */ (ally)))
          : t,
      );
    }
    return next;
  })();
}
