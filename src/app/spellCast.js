import { promptModal } from '../ui/Modal.js';
import { castSpell, maxTargets, scalingSteps } from '../entities/Casting.js';
import { spellSource } from '../entities/Character.js';
import { spellSaveDC, spellAttackBonus } from '../entities/Classes.js';
import { isDefeated } from '../entities/Encounter.js';
import { npcsOnTile } from '../entities/NPC.js';
import { castableSlotLevels } from '../entities/SpellSlots.js';
import { toCaster, withCasterState } from '../entities/Caster.js';
import { replaceById } from '../entities/Roster.js';
import { durationInRounds } from '../entities/SpellTiming.js';
import {
  findCombatant,
  combatantsAsTargets,
  asTarget,
  applyToTarget,
  applyConditionToTarget,
} from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The combatants a spell can target, by effect kind: an attack or a save spell
 * reaches the caster's foes; a heal reaches its own side (allies, including the
 * caster). Utility spells target no one. The list itself comes from the shared
 * `combatantsAsTargets` assembly over combat's running order.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} caster
 * @param {Spell} spell
 * @returns {{ id: string, name: string, ac: number }[]}
 */
function combatTargets(app, combat, caster, spell) {
  const kind = spell.effect.kind;
  if (kind === 'utility') return [];
  return combatantsAsTargets(app, combat, caster, { allies: kind === 'heal' });
}

/**
 * The combatants an out-of-combat cast can reach, with no initiative order to
 * scope by: a heal reaches the whole party (allies, caster included); an attack
 * or save reaches every undefeated encounter plus the NPCs on the party's tile.
 * Utility spells target no one. Same target shape as `combatTargets`.
 * @param {AppContext} app
 * @param {Spell} spell
 * @returns {{ id: string, name: string, ac: number }[]}
 */
function rosterTargets(app, spell) {
  const { state } = app;
  const kind = spell.effect.kind;
  if (kind === 'utility') return [];
  if (kind === 'heal') {
    return state.characters.map((c) => asTarget(c, 'character'));
  }
  const foes = state.encounters.filter((e) => !isDefeated(e)).map((e) => asTarget(e, 'encounter'));
  const npcs = npcsOnTile(state.npcs, app.partyTracker.getPosition()).map((n) =>
    asTarget(n, 'npc'),
  );
  return [...foes, ...npcs];
}

/**
 * The pre-roll dialog fields for a cast: a slot-level picker (leveled spells
 * cast at or above their level from a slot the caster still has), the target or
 * targets, an advantage/disadvantage mode, and — for a save spell — the DC and
 * the target's save bonus. Cantrips omit the slot picker; utility spells add no
 * target. Returns null when the caster has no usable slot for a leveled spell.
 *
 * A spell that reaches one creature keeps a single select, so the common case
 * stays one click. A spell that reaches more gets the checkbox group, capped at
 * what the spell allows — an area spell has no cap, so the GM picks whoever the
 * blast covers.
 * @param {Spell} spell
 * @param {{ id: string, name: string, ac: number }[]} targets
 * @param {number[]} slotLevels available slot levels at or above the spell's
 * @param {number} saveDC
 * @param {number} cap how many targets this cast may reach; Infinity for an area
 * @returns {import('../types/modal.js').ModalField[] | null}
 */
function castFields(spell, targets, slotLevels, saveDC, cap) {
  const kind = spell.effect.kind;
  /** @type {import('../types/modal.js').ModalField[]} */
  const fields = [];
  if (spell.level > 0) {
    if (slotLevels.length === 0) return null;
    fields.push({
      name: 'slot',
      label: 'Cast at level',
      type: 'select',
      value: String(slotLevels[0]),
      options: slotLevels.map((l) => ({ value: String(l), label: `Level ${l}` })),
    });
  }
  if (kind !== 'utility') {
    const noun = kind === 'heal' ? 'Recipient' : 'Target';
    const options = targets.map((t) => ({
      value: t.id,
      label: kind === 'heal' ? t.name : `${t.name} (AC ${t.ac})`,
    }));
    if (cap <= 1) {
      fields.push({ name: 'target', label: noun, type: 'select', full: true, options });
    } else {
      fields.push({
        name: 'targets',
        label: Number.isFinite(cap) ? `${noun}s (up to ${cap})` : `${noun}s in the area`,
        type: 'multiselect',
        full: true,
        options,
        fixedHeight: true,
        ...(Number.isFinite(cap) ? { max: cap } : {}),
      });
    }
  }
  if (kind === 'attack') {
    fields.push({
      name: 'mode',
      label: 'Attack roll',
      type: 'select',
      value: 'normal',
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'advantage', label: 'Advantage' },
        { value: 'disadvantage', label: 'Disadvantage' },
      ],
    });
  }
  if (kind === 'save') {
    fields.push({ name: 'dc', label: 'Save DC', type: 'number', value: saveDC, min: 1 });
    fields.push({ name: 'save-bonus', label: 'Target save bonus', type: 'number', value: 0 });
    fields.push({
      name: 'mode',
      label: 'Save roll',
      type: 'select',
      value: 'normal',
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'advantage', label: 'Advantage' },
        { value: 'disadvantage', label: 'Disadvantage' },
      ],
    });
  }
  return fields;
}

/**
 * Cast a spell for the active combatant, mirroring `weaponAttack`: the targets
 * come from the initiative order (foes for attack/save, the party for heal),
 * then `runCast` runs the pre-roll dialog, resolves, and applies. The caster is
 * whichever combatant holds the participant's id — resolved by the shared
 * `findCombatant`, whose `store` writes the spent slot back to that
 * combatant's own collection.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} participant
 * @param {Spell} spell
 */
export async function castSpellAction(app, combat, participant, spell) {
  const targets = combatTargets(app, combat, participant, spell);
  const found = findCombatant(app, participant.id);
  if (!found) return;
  await runCast(
    app,
    found.entity,
    spell,
    targets,
    /** @type {(next: any) => void} */ (found.store),
  );
}

/**
 * Cast a spell from a character's sheet outside of combat: the targets come
 * from the roster and nearby foes (no initiative order), then `runCast` handles
 * the dialog, resolution, and application exactly as the combat path does.
 * @param {AppContext} app
 * @param {import('../types/entities.js').Character} caster
 * @param {Spell} spell
 */
export async function castSpellOutOfCombat(app, caster, spell) {
  await runCast(app, caster, spell, rosterTargets(app, spell), (next) => {
    app.state.characters = replaceById(app.state.characters, next);
    app.actions.refreshSelectedCharacter();
  });
}

/**
 * The shared cast pipeline behind both entry points, mirroring `weaponAttack`:
 * a pre-roll dialog picks the slot level, target, and situational modes, then
 * the pure `castSpell` resolver rolls the effect and this wiring applies the
 * result and logs it. A caster with no spell ability falls back to a flat DC 10
 * / +0 attack. The caster entity is read through `toCaster` so a party
 * Character, a foe Encounter, and an NPC all resolve the same way; when a slot
 * is spent, `withCasterState` splices it back onto the real entity and the
 * caller's `writeBack` stores it in the right collection. Damage or healing
 * lands on each target the same way a weapon hit does — encounters and
 * characters track HP, an HP-less NPC keeps the log line only.
 * @template {import('../types/entities.js').Character
 *   | import('../types/entities.js').Encounter
 *   | import('../types/npc.js').NPC} T
 * @param {AppContext} app
 * @param {T} entity the real combatant casting
 * @param {Spell} spell
 * @param {{ id: string, name: string, ac: number }[]} targets
 * @param {(next: T) => void} writeBack stores the slot-spent entity
 */
async function runCast(app, entity, spell, targets, writeBack) {
  // The pure spell helpers read a caster's class/level/stats/resources/
  // spellbook — exactly the fields `toCaster` surfaces — so the view stands in
  // for a Character at the type level; runtime only ever touches those fields.
  const caster = /** @type {import('../types/entities.js').Character} */ (
    /** @type {unknown} */ (toCaster(entity))
  );
  if (spell.effect.kind !== 'utility' && targets.length === 0) {
    app.toasts.show('No target available.');
    return;
  }

  // Leveled spells cast from a slot at or above their level that still has a
  // charge — leveled or pact; the picker offers each such level.
  const slotLevels = spell.level > 0 ? castableSlotLevels(caster, spell.level) : [];
  // A multiclass caster's DC/attack use the class the spell was learned
  // under; without a recorded source they fall back to the first caster class.
  const sourceClass = spellSource(caster, spell.id) ?? undefined;
  const dc = spellSaveDC(caster, sourceClass) ?? 10;
  // The target cap is offered at the best slot the caster could spend, since the
  // slot is picked in the same dialog: a spell that gains targets by upcasting
  // has to show them before the level is chosen. Casting at a lower level than
  // the picks assumed drops the extras, which `castSpell` reports back.
  const bestSlot = spell.level > 0 ? (slotLevels[slotLevels.length - 1] ?? spell.level) : 0;
  const cap = maxTargets(spell, scalingSteps(spell, bestSlot, caster.level ?? 1));
  const fields = castFields(spell, targets, slotLevels, dc, cap);
  if (!fields) {
    app.toasts.show(`No level ${spell.level}+ slot left for ${spell.name}.`);
    return;
  }

  const values = await promptModal(`Cast ${spell.name}`, fields, {
    submitLabel: 'Cast',
    wide: true,
  });
  if (!values) return;

  const slotLevel = spell.level > 0 ? Number(values.slot) || spell.level : spell.level;
  const mode = /** @type {import('../types/dice.js').RollMode} */ (values.mode ?? 'normal');
  const saveDC = Number(values.dc) || dc;
  const chosen = chosenTargets(targets, values);
  if (spell.effect.kind !== 'utility' && chosen.length === 0) {
    app.toasts.show(`Pick at least one target for ${spell.name}.`);
    return;
  }
  // Every target rolls its save against the same hand-entered bonus, since only
  // a party character has a save surface to read one from today.
  const castTargets =
    spell.effect.kind === 'save'
      ? chosen.map((t) => ({ ...t, saveBonus: Number(values['save-bonus']) || 0, saveMode: mode }))
      : chosen;

  const result = castSpell(caster, spell, {
    slotLevel,
    casterLevel: caster.level ?? 1,
    targets: castTargets,
    spellAttackBonus: spellAttackBonus(caster, sourceClass) ?? 0,
    saveDC,
    attackMode: spell.effect.kind === 'attack' ? mode : 'normal',
  });
  if (!result.ok) {
    app.toasts.show(`Can't cast ${spell.name}.`);
    return;
  }
  if (result.truncated > 0) {
    app.toasts.show(
      `${spell.name} reaches ${result.targets.length} at level ${result.slotLevel}; ` +
        `${result.truncated} dropped.`,
    );
  }

  // Write the spent slot back to the caster before applying effects, so a slot
  // never lingers if the effect application throws. `withCasterState` splices
  // the decremented slot pools onto the real entity; the caller stores it.
  if (result.spent) {
    writeBack(withCasterState(entity, result.caster));
    app.actions.markDirty();
  }
  const at = result.slotLevel > 0 ? ` at level ${result.slotLevel}` : '';
  app.actions.logEvent('combat', `${caster.name} casts ${spell.name}${at}.`);

  applyOutcomes(app, spell, result);
}

/**
 * The targets the GM picked out of the dialog: the multiselect's comma-joined
 * ids, or the single select's one id, resolved back to the target objects in the
 * order they were offered. Unknown ids are dropped rather than trusted.
 * @param {{ id: string, name: string, ac: number }[]} targets
 * @param {Record<string, string>} values
 * @returns {{ id: string, name: string, ac: number }[]}
 */
function chosenTargets(targets, values) {
  const raw = values.targets ?? values.target ?? '';
  const ids = new Set(
    String(raw)
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
  return targets.filter((t) => ids.has(t.id));
}

/**
 * How a cast's targets read in a toast: the one name when a spell reached one
 * creature, a count when it reached several.
 * @param {{ name?: string }[]} targets
 * @returns {string}
 */
function targetSummary(targets) {
  if (targets.length === 1) return targets[0].name ?? '';
  return `${targets.length} targets`;
}

/**
 * Apply and log a resolved cast's outcomes: attack hits/misses, save results
 * with full/half/no damage, and healing. Each target gets its own log line, so a
 * multi-target cast is auditable roll by roll; the toast carries the summary.
 * Damage and healing route to the same HP models the weapon path uses.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {{ outcomes: object[], targets: { name?: string }[] }} result
 */
function applyOutcomes(app, spell, result) {
  const kind = spell.effect.kind;
  const summary = targetSummary(result.targets);
  if (kind === 'attack') {
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      const verb = o.crit ? 'critically hits' : o.hit ? 'hits' : 'misses';
      if (!o.hit) {
        app.actions.logEvent(
          'combat',
          `${spell.name}: ${o.attack.total} to hit vs AC ${o.ac} — ${verb} ${o.target.name}.`,
        );
        continue;
      }
      app.actions.logEvent(
        'combat',
        `${spell.name} ${verb} ${o.target.name} for ${o.damage?.detail || '0 damage'}.`,
      );
      applyToTarget(app, o.target.id, o.damage?.total ?? 0, false);
    }
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'save') {
    // A failed save's condition rides for as long as the spell lasts, which the
    // structured duration gives in rounds; an open-ended duration leaves the
    // chip for the GM to clear.
    const rounds = durationInRounds(spell.duration);
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      const verdict = o.saved ? 'saves' : 'fails';
      const imposed = o.condition
        ? applyConditionToTarget(app, o.target.id, o.condition, rounds)
        : false;
      const cond = o.condition ? `, ${o.condition}${imposed ? '' : ' (untracked)'}` : '';
      app.actions.logEvent(
        'combat',
        `${o.target.name} ${verdict} DC ${o.dc} (${o.save.total}) — takes ${o.taken} damage${cond}.`,
      );
      applyToTarget(app, o.target.id, o.taken, false);
    }
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'heal') {
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      app.actions.logEvent(
        'combat',
        `${spell.name} heals ${o.target.name} for ${o.healing.total} HP.`,
      );
      applyToTarget(app, o.target.id, o.healing.total, true);
    }
    app.toasts.show(`${spell.name} heals ${summary}.`);
    return;
  }
  app.toasts.show(`${spell.name} cast.`);
}
