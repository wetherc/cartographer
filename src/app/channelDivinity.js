import { promptModal } from '../ui/Modal.js';
import { offerResistance } from './legendaryResistance.js';
import { spendResource } from '../entities/Character.js';
import { classLevelOf } from '../entities/Multiclass.js';
import { spellSaveDC } from '../entities/Classes.js';
import { creatureTypeOf } from '../entities/CreatureType.js';
import { resolveSave } from '../entities/Checks.js';
import { rollMode } from '../entities/ConditionEffects.js';
import { CHANNEL_DIVINITY_ID } from '../entities/PoolIds.js';
import { isGone } from '../combat/CombatView.js';
import {
  checkAllocation,
  preserveLifeBudget,
  preserveLifeCap,
  turnVerdict,
} from '../combat/ChannelDivinity.js';
import { combatantSaveBonus, combatantsAsTargets, findCombatant, hpOf } from './combatants.js';
import { applyConditionToTarget, applyToTarget } from './combatantWrites.js';
import { slayCombatant } from './slay.js';
import { splitTrimmedList } from '../util/text.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * The Channel Divinity options of a cleric in a fight. Each one opens its
 * dialog first, and spends the use and the action only on confirm, so a
 * cancel keeps both. The pure rules live in `combat/ChannelDivinity.js`.
 */

/**
 * Turn Undead. The dialog lists every undead combatant, all ticked, because
 * the range (30 ft) and "can see or hear" are the GM's call. Each ticked
 * undead rolls a WIS save against the cleric's spell save DC. A failure adds
 * a Turned chip for 1 minute that damage ends, or destroys the undead when
 * Destroy Undead reaches its CR.
 * @param {AppContext} app
 * @param {{ entity: Character, label: string, store: (next: Character) => void }} found
 * @param {{
 *   prompt?: typeof promptModal,
 *   rng?: RandomFn,
 *   ask?: import('./shieldWard.js').WardAsk,
 * }} [opts] `ask` is the legendary resistance question (see `offerResistance`).
 * @returns {Promise<boolean>} whether the use went through
 */
export async function turnUndead(
  app,
  found,
  { prompt = promptModal, rng = Math.random, ask } = {},
) {
  const cleric = found.entity;
  const undead = (app.state.combat?.order ?? [])
    .map((p) => findCombatant(app, p.id))
    .filter(
      (c) =>
        c?.kind === 'creature' && creatureTypeOf('creature', c.entity) === 'undead' && !isGone(c),
    );
  if (undead.length === 0) {
    app.toasts.show('No undead in the fight to turn.');
    return false;
  }
  const values = await prompt(
    'Turn Undead',
    [
      {
        name: 'targets',
        label: 'Undead that can see or hear the cleric within 30 feet',
        type: 'multiselect',
        full: true,
        value: undead.map((c) => c?.entity.id).join(','),
        options: undead.map((c) => ({ value: c?.entity.id ?? '', label: c?.label ?? '' })),
      },
    ],
    { submitLabel: 'Turn Undead' },
  );
  if (!values) return false;
  if (app.actions.spendBudget && !app.actions.spendBudget(cleric.id, 'action')) {
    app.toasts.show(`${found.label} has no action left this turn.`);
    return false;
  }
  found.store(spendResource(cleric, CHANNEL_DIVINITY_ID, 1));
  app.actions.markDirty();
  const dc = spellSaveDC(cleric, 'cleric') ?? 10;
  const level = classLevelOf(cleric, 'cleric');
  app.actions.logEvent('combat', `${found.label} uses Channel Divinity: Turn Undead (DC ${dc}).`);
  for (const id of splitTrimmedList(String(values.targets ?? ''))) {
    const target = findCombatant(app, id);
    if (!target) continue;
    // Turn Resistance or Turn Defiance gives the save advantage, which folds
    // with the slants of the target's own chips under the cancel rule.
    const resists = target.kind === 'creature' && target.entity.turnResistance === true;
    const conditions = target.entity.conditions;
    const mode = rollMode({ roller: conditions, kind: 'save', ability: 'WIS' }, [
      resists ? 'advantage' : null,
    ]);
    const save = resolveSave(combatantSaveBonus(target, 'WIS'), dc, {
      mode: mode ?? 'normal',
      conditions,
      rng,
    });
    // A legendary creature can turn a failed save into a success.
    const saved =
      save.success ||
      (await offerResistance(
        app,
        id,
        `${target.label} fails the WIS save against Turn Undead (DC ${dc}).`,
        { ask },
      ));
    const cr = target.kind === 'creature' ? target.entity.cr : undefined;
    const verdict = turnVerdict(saved, cr, level);
    const rolled = `(WIS save ${save.total} vs DC ${dc})`;
    if (verdict === 'unaffected') {
      app.actions.logEvent('combat', `${target.label} resists the turning ${rolled}.`);
    } else if (verdict === 'destroyed') {
      app.actions.logEvent('combat', `${target.label} is destroyed ${rolled}.`);
      slayCombatant(app, id);
    } else {
      app.actions.logEvent('combat', `${target.label} is turned ${rolled}.`);
      applyConditionToTarget(app, id, 'Turned', 10, {
        spellId: 'turn-undead',
        spellName: 'Turn Undead',
        casterId: cleric.id,
        casterName: found.label,
        endsOnDamage: true,
      });
    }
  }
  return true;
}

/**
 * Preserve Life. The dialog has one amount per ally in the fight, each capped
 * so the ally reaches at most half its max HP. Undead and constructs get no
 * row. The amounts share 5 x the cleric level, and a share-out over a cap or
 * the budget is refused with a toast before anything is spent.
 * @param {AppContext} app
 * @param {{ entity: Character, label: string, store: (next: Character) => void }} found
 * @param {{ prompt?: typeof promptModal }} [opts]
 * @returns {Promise<boolean>} whether the use went through
 */
export async function preserveLife(app, found, { prompt = promptModal } = {}) {
  const cleric = found.entity;
  const combat = app.state.combat;
  const self = combat?.order.find((p) => p.id === cleric.id);
  if (!combat || !self) return false;
  const budget = preserveLifeBudget(classLevelOf(cleric, 'cleric'));
  /** @type {Record<string, number>} */
  const caps = {};
  /** @type {{ id: string, label: string }[]} */
  const rows = [];
  for (const t of combatantsAsTargets(app, combat, self, { allies: true })) {
    const ally = findCombatant(app, t.id);
    const hp = ally && hpOf(ally.kind, ally.entity);
    if (!ally || !hp || isGone(ally)) continue;
    const type = ally.kind === 'creature' ? creatureTypeOf('creature', ally.entity) : 'humanoid';
    const cap = preserveLifeCap(hp, type);
    if (cap <= 0) continue;
    caps[t.id] = cap;
    rows.push({ id: t.id, label: ally.label });
  }
  if (rows.length === 0) {
    app.toasts.show('No ally is below half its max HP.');
    return false;
  }
  const values = await prompt(
    'Preserve Life',
    rows.map((r) => ({
      name: r.id,
      label: `${r.label} (up to ${caps[r.id]})`,
      type: 'number',
      value: 0,
      min: 0,
      max: caps[r.id],
    })),
    { message: `Share out up to ${budget} HP.`, submitLabel: 'Preserve Life' },
  );
  if (!values) return false;
  /** @type {Record<string, number>} */
  const amounts = {};
  for (const r of rows) amounts[r.id] = Number(values[r.id] ?? 0);
  const check = checkAllocation(amounts, caps, budget);
  if (!check.ok) {
    app.toasts.show(check.message);
    return false;
  }
  if (app.actions.spendBudget && !app.actions.spendBudget(cleric.id, 'action')) {
    app.toasts.show(`${found.label} has no action left this turn.`);
    return false;
  }
  found.store(spendResource(cleric, CHANNEL_DIVINITY_ID, 1));
  app.actions.markDirty();
  app.actions.logEvent(
    'combat',
    `${found.label} uses Channel Divinity: Preserve Life (${check.total} of ${budget} HP).`,
  );
  for (const r of rows) if (amounts[r.id] > 0) applyToTarget(app, r.id, amounts[r.id], true);
  return true;
}
