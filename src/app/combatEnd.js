import { confirmModal, promptModal } from '../ui/Modal.js';
import { addItem, addXP } from '../entities/Character.js';
import { addGold } from '../entities/Purse.js';
import { countNoun, slugify } from '../util/text.js';
import {
  FOE_FATES,
  fightEnd,
  partyAward,
  sortFates,
  splitCaption,
  xpSplit,
} from '../combat/FightEnd.js';
import { removeById } from '../entities/Roster.js';
import { clampInt } from '../util/num.js';
import { standDown } from '../entities/CreatureMap.js';
import { combatLabels, commitCreatures, findCombatant } from './combatants.js';
import { endCasterEffects } from './combatantWrites.js';

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
 * did not lose, a character is alive to earn, and there is XP to share, a
 * standing foe whose fate the GM picks, or gear that a defeated foe drops.
 * @param {FightEnd} end
 */
export const opensXPDialog = (end) =>
  end.outcome !== 'defeat' &&
  end.earners.length > 0 &&
  (end.xp > 0 || end.standingFoes.length > 0 || end.loot.length > 0);

/** The caption of the coin field. @param {number} gp @param {number} count */
const coinCaption = (gp, count) => partyAward('total', gp, count).caption.replace(/XP/g, 'gp');

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
 *
 * The loot fields follow. **Loot** lists the weapons and armor of the
 * defeated foes, **Loot goes to** names the character who takes the ticked
 * items, and **Coins found** is a total of gold pieces split evenly among
 * the earners through `partyAward`.
 * @param {FightEnd} end
 * @param {{ prompt?: typeof promptModal, nameOf?: (id: string) => string }} [opts]
 *   `prompt` renders the dialog, and a test passes its own. `nameOf` names
 *   an earner in the loot select.
 * @returns {Promise<Record<string, string | number | boolean> | 'none' | null>}
 *   the answers, 'none' when the fight has nothing to award and no dialog
 *   opens, or null when the GM goes back to the fight
 */
export async function askFightXP(end, { prompt = promptModal, nameOf = (id) => id } = {}) {
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
      ...(end.loot.length
        ? [
            {
              name: 'loot',
              label: 'Loot',
              type: /** @type {const} */ ('multiselect'),
              options: end.loot.map(({ value, label }) => ({ value, label })),
              value: '',
            },
            {
              name: 'lootTo',
              label: 'Loot goes to',
              type: /** @type {const} */ ('select'),
              options: end.earners.map((id) => ({ value: id, label: nameOf(id) })),
              value: end.earners[0],
            },
          ]
        : []),
      {
        name: 'gold',
        label: coinCaption(0, count),
        type: 'number',
        value: 0,
        min: 0,
      },
    ],
    {
      message: foes.length ? standingMessage(foes.length) : undefined,
      submitLabel: 'End and award',
      cancelLabel: 'Back to the fight',
      onChange: (name, form) => {
        if (name === 'gold') {
          form.setLabel('gold', coinCaption(Number(form.get('gold')) || 0, count));
          return;
        }
        if (name === 'amount' || name === 'loot' || name === 'lootTo') return;
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
  applyLoot(app, end, values);
  const amount = clampInt(values.amount, 0);
  if (amount <= 0) return;
  const count = end.earners.length;
  const earners = new Set(end.earners);
  app.state.characters = app.state.characters.map((c) =>
    earners.has(c.id) ? addXP(c, amount) : c,
  );
  app.actions.refreshSelectedCharacter();
  app.actions.markDirty();
  app.actions.logEvent('note', `The party receives ${amount} XP each for the fight.`);
  app.toasts.show(`Awarded ${amount} XP to ${countNoun(count, 'character')}.`);
}

/**
 * Hand out the loot answers of askFightXP. The ticked items join the
 * inventory of the chosen earner, stacking with a matching item, and the
 * coins split evenly among the earners, rounded down. Each part logs one
 * travelogue line.
 * @param {AppContext} app
 * @param {FightEnd} end
 * @param {Record<string, string | number | boolean>} values
 */
export function applyLoot(app, end, values) {
  const picked = new Set(
    String(values.loot ?? '')
      .split(',')
      .filter(Boolean),
  );
  const items = end.loot.filter((l) => picked.has(l.value)).map((l) => l.item);
  const carrierId = String(values.lootTo ?? end.earners[0] ?? '');
  const earners = new Set(end.earners);
  const gp = partyAward('total', clampInt(values.gold, 0), earners.size).each;
  const carrier = app.state.characters.find((c) => c.id === carrierId && earners.has(c.id));
  const giving = carrier && items.length > 0;
  if (!giving && gp <= 0) return;
  app.state.characters = app.state.characters.map((c) => {
    let next = earners.has(c.id) ? addGold(c, gp) : c;
    if (giving && c.id === carrier.id) {
      next = items.reduce(
        (ch, item) => addItem(ch, { ...item, id: slugify(item.name) || 'item' }),
        next,
      );
    }
    return next;
  });
  app.actions.refreshSelectedCharacter();
  app.actions.markDirty();
  if (giving) {
    const names = items.map((i) => i.name).join(', ');
    app.actions.logEvent('note', `${carrier.name} takes ${names} from the fallen foes.`);
  }
  if (gp > 0) app.actions.logEvent('note', `The party splits the coins found: ${gp} gp each.`);
}

/**
 * Remove the foes that fled from the campaign, with one log line each. The
 * write goes through commitCreatures, so Undo brings them back.
 * @param {AppContext} app
 * @param {import('../combat/FightEnd.js').StandingFoe[]} fled
 */
function removeFled(app, fled) {
  if (fled.length === 0) return;
  const gone = app.state.creatures.filter((c) => fled.some((foe) => foe.id === c.id));
  app.state.creatures = fled.reduce((list, foe) => removeById(list, foe.id), app.state.creatures);
  for (const foe of gone) endCasterEffects(app, foe);
  commitCreatures(app);
  for (const foe of fled) app.actions.logEvent('combat', `${foe.name} flees.`);
}
