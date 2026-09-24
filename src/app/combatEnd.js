import { confirmModal, promptModal } from '../ui/Modal.js';
import { addXP } from '../entities/Character.js';
import { fightEnd } from '../combat/FightEnd.js';
import { clampInt } from '../util/num.js';
import { findCombatant } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../combat/FightEnd.js').FightEnd} FightEnd */

/**
 * Ask before End combat drops a fight that hostile creatures still stand
 * in. The button sits next to Next turn, so one stray click would otherwise
 * throw away a live fight. A won or lost fight closes with no question.
 * @param {AppContext} app
 * @returns {Promise<FightEnd | null>} the fight's summary, or null when the
 *   GM keeps the fight or no fight is running
 */
export async function confirmFightEnd(app) {
  const combat = app.state.combat;
  if (!combat) return null;
  const end = fightEnd(combat, (id) => findCombatant(app, id));
  if (end.standing === 0 || end.outcome === 'defeat') return end;
  const n = end.standing;
  const ok = await confirmModal(
    `${n} ${n === 1 ? 'foe is' : 'foes are'} still standing. End the fight anyway?`,
    { title: 'End combat', confirmLabel: 'End combat', variant: 'danger' },
  );
  // The fight can end in another tab while the dialog is open.
  return ok && app.state.combat ? end : null;
}

/**
 * After a victory, offer the experience points of the defeated foes to the
 * characters still alive. The GM can change the amount or cancel. Each
 * earner gets the amount through addXP, so a new level becomes pending the
 * usual way.
 * @param {AppContext} app
 * @param {FightEnd} end
 */
export async function offerFightXP(app, end) {
  if (end.outcome !== 'victory' || end.share <= 0) return;
  const count = end.earners.length;
  const values = await promptModal(
    'Award XP for the fight',
    [
      {
        name: 'amount',
        label: `XP per character (${end.xp} XP split ${count} ${count === 1 ? 'way' : 'ways'})`,
        type: 'number',
        value: end.share,
        min: 1,
      },
    ],
    { submitLabel: 'Award' },
  );
  const amount = clampInt(values?.amount, 0);
  if (!values || amount <= 0) return;
  const earners = new Set(end.earners);
  app.state.characters = app.state.characters.map((c) =>
    earners.has(c.id) ? addXP(c, amount) : c,
  );
  app.actions.refreshSelectedCharacter();
  app.actions.markDirty();
  app.actions.logEvent('note', `The party is awarded ${amount} XP each for the fight.`);
  app.toasts.show(`Awarded ${amount} XP to ${count} character${count === 1 ? '' : 's'}.`);
}
