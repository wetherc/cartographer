import { parseAssignments } from '../ui/ModalFields.js';
import { formatModifier } from '../entities/Modifiers.js';
import { hostileGroup } from '../entities/CreatureMap.js';
import { combatantsAsTargets, asTarget } from './combatants.js';
import { splitTrimmedList } from '../util/text.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * Who a spell can reach, and how the cast dialog names them. This module
 * answers that question from either side of a fight: the running order in
 * combat, or the roster and the party's tile out of it. It also reads the
 * chosen targets back out of the dialog and sums them up for the log.
 *
 * Every function here is pure apart from the two that read the live app for
 * its roster and its combat state.
 */

/**
 * The combatants a spell can target, by effect kind. An attack or a save
 * spell reaches the caster's foes, plus any other creature in the fight,
 * bystanders included. A heal or a buff reaches its own side (allies,
 * including the caster), and one with a range of Self reaches the caster
 * alone. A utility spell targets no one. The list comes from the shared
 * `combatantsAsTargets` function over the combat running order.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} caster
 * @param {Spell} spell
 * @returns {import('./combatants.js').CombatTarget[]}
 */
export function combatTargets(app, combat, caster, spell) {
  const kind = spell.effect.kind;
  if (targetFree(kind)) return [];
  const reached = combatantsAsTargets(app, combat, caster, { allies: aids(spell) });
  return selfOnly(spell) ? reached.filter((t) => t.id === caster.id) : reached;
}

/**
 * Whether a spell reaches only its caster: a heal or a buff with a range of
 * Self, such as Shield or False Life. A Self range with an area after it
 * ("Self (30-foot radius)") reaches others, so only the bare word counts.
 * @param {Spell} spell
 * @returns {boolean}
 */
export function selfOnly(spell) {
  return helps(spell.effect.kind) && spell.range.trim().toLowerCase() === 'self';
}

/**
 * Whether an effect kind reaches the caster's own side. A heal and a buff do.
 * An attack and a save do not.
 * @param {import('../types/spell.js').SpellEffect['kind']} kind
 * @returns {boolean}
 */
export function helps(kind) {
  return kind === 'heal' || kind === 'buff';
}

/**
 * Whether a spell reaches its own side. A buff that marks a foe (Hunter's
 * Mark) is the exception to the rule of `helps`, because its chip goes on a
 * foe and pays off in the caster's hits against it.
 * @param {Spell} spell
 * @returns {boolean}
 */
export function aids(spell) {
  const { effect } = spell;
  return helps(effect.kind) && !(effect.kind === 'buff' && effect.hit?.mark);
}

/**
 * Whether an effect kind picks no creature. A utility spell resolves in the
 * description text. A summons puts new creatures on the map instead of
 * reaching existing ones. Neither gets a target picker, and neither is refused
 * for having nobody to aim at.
 * @param {import('../types/spell.js').SpellEffect['kind']} kind
 * @returns {boolean}
 */
export function targetFree(kind) {
  return kind === 'utility' || kind === 'summons';
}

/**
 * The combatants an out-of-combat cast can reach. There is no initiative
 * order to limit the scope. A heal or a buff reaches the whole party (allies,
 * caster included). An attack or a save spell reaches the foes of the
 * encounter group: the undefeated hostile creatures on the party's tile and
 * the tiles around it. A friendly or neutral bystander is not a foe, so it is
 * never offered. A utility spell targets no one. Each target has the same
 * fields as one from `combatTargets`.
 *
 * The encounter group is the closest range check the app has, because the app
 * cannot measure distance between two tokens. Without this check, a cast
 * offers every foe in the campaign, including foes in regions the party has
 * not reached.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {string} [casterId] the caster, which a Self-range buff reaches alone
 * @returns {import('./combatants.js').CombatTarget[]}
 */
export function rosterTargets(app, spell, casterId) {
  const { state } = app;
  const kind = spell.effect.kind;
  if (targetFree(kind)) return [];
  if (aids(spell)) {
    const party = selfOnly(spell)
      ? state.characters.filter((c) => c.id === casterId)
      : state.characters;
    return party.map((c) => asTarget(c, 'character'));
  }
  const position = app.partyTracker.getPosition();
  return hostileGroup(state.creatures, position).map((c) => asTarget(c, 'creature'));
}

/**
 * The label a target shows in the picker: the number the cast rolls against.
 * An attack rolls against AC. A save rolls against the target's own bonus in
 * the spell's ability, when the app knows it. The app omits the bonus for a
 * foe whose save the GM must type in. A heal and a buff roll against nothing,
 * so only the name shows.
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget} target
 * @returns {string}
 */
export function targetLabel(spell, target) {
  const kind = spell.effect.kind;
  // The numbered label tells apart two targets that share a name.
  const name = target.label ?? target.name;
  if (helps(kind)) return name;
  if (kind === 'save') {
    if (target.saveBonus === undefined) return name;
    return `${name} (${spell.effect.saveAbility} ${formatModifier(target.saveBonus)})`;
  }
  // A hit that brings a save names the bonus beside the AC.
  // Every kind left here is an attack.
  const onHitSave = /** @type {import('../types/spell.js').SpellAttackEffect} */ (spell.effect)
    .onHit?.saveAbility;
  const save =
    onHitSave && target.saveBonus !== undefined
      ? `, ${onHitSave} ${formatModifier(target.saveBonus)}`
      : '';
  return `${name} (AC ${target.ac}${save})`;
}

/**
 * Point a cast dialog's target field at an already-picked target, in
 * whichever shape `castFields` chose: the single select value, the
 * multiselect one pre-checked box, or the whole allocation moved onto that
 * creature. The grid already opens with everything on its first row, so
 * this only changes which row holds the allocation. When no option offers
 * the id (for example, a picked ally under an attack spell, or a foe
 * defeated since), the field keeps its own default.
 * @param {import('../types/modal.js').ModalField[]} fields
 * @param {string} targetId
 */
export function prefillTarget(fields, targetId) {
  for (const field of fields) {
    if (field.name === 'target' && field.type === 'select') {
      if (field.options.some((o) => o.value === targetId)) field.value = targetId;
    } else if (field.name === 'targets' && field.type === 'multiselect') {
      if (field.options.some((o) => o.value === targetId)) field.value = targetId;
    } else if (field.name === 'allocation' && field.type === 'allocation') {
      if (field.rows.some((r) => r.value === targetId)) {
        field.value = `${targetId}:${field.total}`;
      }
    }
  }
}

/**
 * The targets the GM picked out of the dialog. The source is the allocation
 * grid's per-target projectile counts, the multiselect's comma-joined ids,
 * or the single select's one id. The function resolves these back to the
 * target objects in the order they were offered. It drops unknown ids
 * rather than trusting them. A target allocated no projectile is not a target.
 * The picked targets keep the type they were offered with, so a flag such as
 * `armorPenalty` survives the pick.
 * @template {{ id: string }} T
 * @param {T[]} targets
 * @param {Record<string, string>} values
 * @returns {(T & { projectiles?: number })[]}
 */
export function chosenTargets(targets, values) {
  if (values.allocation !== undefined) {
    const assigned = parseAssignments(values.allocation);
    return targets
      .filter((t) => Number(assigned[t.id]) > 0)
      .map((t) => ({ ...t, projectiles: Number(assigned[t.id]) }));
  }
  const raw = values.targets ?? values.target ?? '';
  const ids = new Set(splitTrimmedList(raw));
  return targets.filter((t) => ids.has(t.id));
}

/**
 * The target fields of an open dialog, read through its `get` handle. Only
 * the fields the dialog has are read, because `chosenTargets` picks its
 * source by which of them is present.
 * @param {{ name: string }[]} fields
 * @param {(name: string) => string} get
 * @returns {Record<string, string>}
 */
export function targetValues(fields, get) {
  const names = ['allocation', 'targets', 'target'];
  return Object.fromEntries(
    fields.filter((f) => names.includes(f.name)).map((f) => [f.name, get(f.name)]),
  );
}

/**
 * Whether a cast that needs a target has none picked. A utility spell or a
 * summons picks no creature, so it is never missing one.
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget[]} targets the offered targets
 * @param {Record<string, string>} values the dialog record
 * @returns {boolean}
 */
export function missingTarget(spell, targets, values) {
  return !targetFree(spell.effect.kind) && chosenTargets(targets, values).length === 0;
}

/**
 * How a cast's targets read in a toast message. The function returns the
 * one name when a spell reached one creature, and a count when it reached
 * several.
 * @param {{ name?: string }[]} targets
 * @returns {string}
 */
export function targetSummary(targets) {
  if (targets.length === 1) return targets[0].name ?? '';
  return `${targets.length} targets`;
}
