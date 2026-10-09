/**
 * Creature save actions, such as a breath weapon. An action names a save
 * ability, a DC, damage, and whether a save halves the damage. A recharge
 * action is spent after one use and comes back on a d6 roll at the start of
 * the creature's turn. The cast dialog resolves an action as a level 0 save
 * spell (`actionSpell`), so the save, the damage defenses, and the log follow
 * the save-spell resolver.
 */

import { ABILITY_SCORES } from './Modifiers.js';
import { normalizeParts } from './SpellFields.js';
import { slugify } from '../util/text.js';

/** @typedef {import('../types/creature.js').CreatureAction} CreatureAction */
/** @typedef {import('../types/spell.js').Spell} Spell */

/** The recharge faces the form offers: 6, 5-6, and 4-6. */
export const RECHARGE_FACES = [6, 5, 4];

/** The prefix of the spell id that `actionSpell` gives an action. */
const ACTION_PREFIX = 'action:';

/**
 * A stored action list, with each entry repaired. An entry with no name is
 * dropped. A DC outside 1 to 30 moves to the nearer end, an unknown save
 * ability reads as DEX, and a recharge face other than 4, 5, or 6 reads as no
 * recharge. A repeated id gets a numbered suffix, so a use marks one action.
 * @param {unknown} value
 * @returns {CreatureAction[]}
 */
export function actionList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {CreatureAction[]} */
  const out = [];
  const ids = new Set();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (raw);
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    const base = (typeof r.id === 'string' && r.id) || slugify(name) || 'action';
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    const dc = Math.round(Number(r.dc));
    const saveAbility = ABILITY_SCORES.includes(/** @type {string} */ (r.saveAbility))
      ? /** @type {import('../types/spell.js').Ability} */ (r.saveAbility)
      : 'DEX';
    const recharge = RECHARGE_FACES.includes(/** @type {number} */ (r.recharge))
      ? /** @type {number} */ (r.recharge)
      : undefined;
    out.push({
      id,
      name,
      saveAbility,
      dc: Number.isFinite(dc) ? Math.min(30, Math.max(1, dc)) : 10,
      damage: normalizeParts(r.damage),
      halfOnSave: r.halfOnSave === true,
      ...(recharge ? { recharge } : {}),
      ...(recharge && r.spent === true ? { spent: true } : {}),
    });
  }
  return out;
}

/**
 * The optional `actions` field of a creature or template: present only when
 * the list has an entry.
 * @param {unknown} value
 * @returns {{ actions?: CreatureAction[] }}
 */
export function actionFields(value) {
  const actions = actionList(value);
  return actions.length > 0 ? { actions } : {};
}

/**
 * The action as a level 0 save spell for the cast dialog. The spell keeps the
 * action's DC under `creatureAction`, which the cast plan reads in place of a
 * spell save DC.
 * @param {CreatureAction} action
 * @returns {Spell & { creatureAction: { id: string, dc: number } }}
 */
export function actionSpell(action) {
  return {
    id: `${ACTION_PREFIX}${action.id}`,
    name: action.name,
    level: 0,
    school: 'evocation',
    classes: [],
    castingTime: { kind: 'action' },
    range: 'Self',
    components: [],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: actionSummary(action),
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: action.saveAbility,
      damage: action.damage,
      halfOnSave: action.halfOnSave,
    },
    creatureAction: { id: action.id, dc: action.dc },
  };
}

/**
 * The actions a creature can use now, as spells for the cast dialog. A spent
 * recharge action stays off the list until it recharges.
 * @param {{ actions?: CreatureAction[] }} creature
 * @returns {Spell[]}
 */
export function readyActionSpells(creature) {
  return (creature.actions ?? []).filter((a) => !a.spent).map(actionSpell);
}

/**
 * The action id behind a spell from `actionSpell`, or null for a real spell.
 * @param {object} spell
 * @returns {string | null}
 */
export function actionIdOf(spell) {
  return /** @type {{ creatureAction?: { id: string } }} */ (spell).creatureAction?.id ?? null;
}

/**
 * The creature after one use of an action. A recharge action becomes spent.
 * Any other action, or an unknown id, leaves the creature unchanged.
 * A party character has no actions, so it comes back unchanged too.
 * @template {object} T
 * @param {T} creature
 * @param {string} actionId
 * @returns {T}
 */
export function spendAction(creature, actionId) {
  const list = /** @type {{ actions?: CreatureAction[] }} */ (creature).actions ?? [];
  const hit = list.find((a) => a.id === actionId);
  if (!hit?.recharge || hit.spent) return creature;
  return {
    ...creature,
    actions: list.map((a) => (a === hit ? { ...a, spent: true } : a)),
  };
}

/**
 * The recharge rolls at the start of the creature's turn. Each spent action
 * rolls a d6 and comes back on its recharge face or higher. The result lists
 * one log line per roll. A creature with nothing spent comes back as the
 * same object with no lines.
 * @template {{ name: string, actions?: CreatureAction[] }} T
 * @param {T} creature
 * @param {() => number} [rng]
 * @returns {{ creature: T, lines: string[] }}
 */
export function rollRecharges(creature, rng = Math.random) {
  const list = creature.actions ?? [];
  if (!list.some((a) => a.spent)) return { creature, lines: [] };
  /** @type {string[]} */
  const lines = [];
  const actions = list.map((a) => {
    if (!a.spent) return a;
    const face = 1 + Math.floor(rng() * 6);
    const back = face >= (a.recharge ?? 7);
    lines.push(
      `${creature.name}'s ${a.name} ${back ? 'recharges' : 'does not recharge'} (d6: ${face}).`,
    );
    if (!back) return a;
    const { spent: _spent, ...ready } = a;
    return ready;
  });
  return { creature: { ...creature, actions }, lines };
}

/**
 * The creature with every action ready again, as after a fight ends.
 * @template {{ actions?: CreatureAction[] }} T
 * @param {T} creature
 * @returns {T}
 */
export function refreshActions(creature) {
  const list = creature.actions ?? [];
  if (!list.some((a) => a.spent)) return creature;
  return {
    ...creature,
    actions: list.map(({ spent: _spent, ...a }) => a),
  };
}

/**
 * A one-line summary of an action, such as "DC 12 DEX save, 4d8 cold, half on
 * save, recharge 5-6".
 * @param {CreatureAction} action
 * @returns {string}
 */
export function actionSummary(action) {
  const damage = action.damage
    .map((p) => `${p.count}d${p.sides}${p.bonus ? `+${p.bonus}` : ''} ${p.damageType}`)
    .join(' + ');
  const recharge = action.recharge
    ? `recharge ${action.recharge === 6 ? '6' : `${action.recharge}-6`}`
    : '';
  return [
    `DC ${action.dc} ${action.saveAbility} save`,
    damage,
    damage && action.halfOnSave ? 'half on save' : '',
    recharge,
  ]
    .filter(Boolean)
    .join(', ');
}
