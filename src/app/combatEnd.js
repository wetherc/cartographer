import { confirmModal, promptModal } from '../ui/Modal.js';
import { addXP } from '../entities/Character.js';
import { FOE_FATES, fightEnd, sortFates, splitCaption, xpSplit } from '../combat/FightEnd.js';
import { removeById } from '../entities/Roster.js';
import { clampInt } from '../util/num.js';
import { standDown } from '../entities/CreatureMap.js';
import { combatLabels, commitCreatures, findCombatant } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../combat/FightEnd.js').FightEnd} FightEnd */

/**
 * The summary of the running fight from the live state, or null when no
 * fight runs. The fight keeps running while a dialog is open, and a
 * Player-bound tab can still send turn writes, so a caller reads this again
 * after each await.
 * @param {AppContext} app
 * @returns {FightEnd | null}
 */
export function fightSummary(app) {
  const combat = app.state.combat;
  if (!combat) return null;
  const labels = combatLabels(
    app,
    combat.order.map((p) => p.id),
  );
  return fightEnd(combat, (id) => findCombatant(app, id), labels);
}

/**
 * Ask before End combat drops a fight that hostile creatures still stand
 * in. The button sits next to Next turn, so one stray click would otherwise
 * throw away a live fight. A won or lost fight closes with no question. When
 * the XP dialog opens anyway, it names the standing foes and offers "Back to
 * the fight", so this confirm stays closed and the GM sees one dialog.
 * @param {AppContext} app
 * @param {{ confirm?: typeof confirmModal }} [opts] `confirm` renders the
 *   dialog, and a test passes its own
 * @returns {Promise<FightEnd | null>} the fight's summary, or null when the
 *   GM keeps the fight or no fight is running
 */
export async function confirmFightEnd(app, { confirm = confirmModal } = {}) {
  const end = fightSummary(app);
  if (!end) return null;
  if (end.standing === 0 || end.outcome === 'defeat' || opensXPDialog(end)) return end;
  const n = end.standing;
  const ok = await confirm(
    `${n} ${n === 1 ? 'foe is' : 'foes are'} still standing. End the fight anyway?`,
    { title: 'End combat', confirmLabel: 'End combat', variant: 'danger' },
  );
  // The fight can end in another tab while the dialog is open.
  return ok && app.state.combat ? end : null;
}

/**
 * Turn foes neutral when they stop fighting, after a fight or a parley. The
 * write goes through commitCreatures, so it marks the campaign dirty and
 * undo steps back over it like any other creature edit. The GM can make a
 * foe hostile again in the creature dialog.
 * @param {AppContext} app
 * @param {Set<string>} ids
 */
export function standDownFoes(app, ids) {
  const next = standDown(app.state.creatures, ids);
  if (next === app.state.creatures) return;
  app.state.creatures = next;
  commitCreatures(app);
}

/**
 * Whether askFightXP opens its dialog for this fight. It does when the party
 * did not lose, a character is alive to earn, and there is XP to share or a
 * standing foe whose fate the GM picks.
 * @param {FightEnd} end
 */
export const opensXPDialog = (end) =>
  end.outcome !== 'defeat' && end.earners.length > 0 && (end.xp > 0 || end.standingFoes.length > 0);

/** The line above the fate selects. @param {number} n */
const standingMessage = (n) =>
  `${n} ${n === 1 ? 'foe is' : 'foes are'} still standing. Pick what became of ${n === 1 ? 'it' : 'each one'}.`;

/** The field name of the fate select for one standing foe. */
const fateField = (/** @type {string} */ id) => `fate:${id}`;

/**
 * Ask for the experience points of a fight while the fight still runs, so
 * Cancel returns the GM to the fight with nothing lost. The dialog offers
 * the points of the defeated foes to the characters still alive. A foe that
 * still stands gets a fate select: still hostile, surrendered or captured,
 * or fled. In 5e a foe that surrenders, flees, or is captured is worth its
 * points too, so each of the last two adds that foe's points and restates
 * the per-character amount. The GM can still change the amount.
 * @param {FightEnd} end
 * @param {{ prompt?: typeof promptModal }} [opts] `prompt` renders the dialog, and a test passes its own
 * @returns {Promise<Record<string, string | number | boolean> | 'none' | null>}
 *   the answers, 'none' when the fight has nothing to award and no dialog
 *   opens, or null when the GM goes back to the fight
 */
export async function askFightXP(end, { prompt = promptModal } = {}) {
  if (!opensXPDialog(end)) return 'none';
  const count = end.earners.length;
  const foes = end.standingFoes;
  /** @param {(name: string) => string} get */
  const totalOf = (get) => end.xp + sortFates(foes, (id) => get(fateField(id))).xp;
  const caption = (/** @type {number} */ total) =>
    `XP per character (${splitCaption(total, count)})`;
  return prompt(
    'End the fight and award XP',
    [
      ...foes.map((foe) => ({
        name: fateField(foe.id),
        label: `${foe.name}, ${foe.xp} XP if overcome`,
        type: /** @type {const} */ ('select'),
        options: FOE_FATES,
        value: 'hostile',
      })),
      {
        name: 'amount',
        label: caption(end.xp),
        type: 'number',
        value: end.share,
        min: 0,
      },
    ],
    {
      message: foes.length ? standingMessage(foes.length) : undefined,
      submitLabel: 'End and award',
      cancelLabel: 'Back to the fight',
      onChange: (name, form) => {
        if (name === 'amount') return;
        const total = totalOf(form.get);
        form.setLabel('amount', caption(total));
        form.set('amount', xpSplit(total, count).share);
      },
    },
  );
}

/**
 * Apply the answers of askFightXP after the fight closes. Each earner gets
 * the amount through addXP, so a new level becomes pending the usual way.
 *
 * A foe that surrendered turns neutral (see standDownFoes), so a captive
 * does not start a new encounter each time the party steps onto its tile. A
 * foe that fled leaves the campaign, and the log reads "Gray Wolf 2 flees.",
 * with the label that `end` took before the fight cleared. It does not become
 * unplaced, because an unplaced creature shows on every tile.
 * @param {AppContext} app
 * @param {FightEnd} end
 * @param {Record<string, string | number | boolean>} values
 */
export function applyFightXP(app, end, values) {
  const fates = sortFates(end.standingFoes, (id) => String(values[fateField(id)]));
  standDownFoes(app, fates.surrendered);
  removeFled(app, fates.fled);
  const amount = clampInt(values.amount, 0);
  if (amount <= 0) return;
  const count = end.earners.length;
  const earners = new Set(end.earners);
  app.state.characters = app.state.characters.map((c) =>
    earners.has(c.id) ? addXP(c, amount) : c,
  );
  app.actions.refreshSelectedCharacter();
  app.actions.markDirty();
  app.actions.logEvent('note', `The party is awarded ${amount} XP each for the fight.`);
  app.toasts.show(`Awarded ${amount} XP to ${count} character${count === 1 ? '' : 's'}.`);
}

/**
 * Remove the foes that fled from the campaign, with one log line each. The
 * write goes through commitCreatures, so Undo brings them back.
 * @param {AppContext} app
 * @param {import('../combat/FightEnd.js').StandingFoe[]} fled
 */
function removeFled(app, fled) {
  if (fled.length === 0) return;
  app.state.creatures = fled.reduce((list, foe) => removeById(list, foe.id), app.state.creatures);
  commitCreatures(app);
  for (const foe of fled) app.actions.logEvent('combat', `${foe.name} flees.`);
}
