import { promptModal } from '../ui/Modal.js';
import { materialCheck } from '../entities/Casting.js';
import { spellSource } from '../entities/Character.js';
import { unproficientWear } from '../entities/Armor.js';
import { spellSaveDC, hasRitualCasting } from '../entities/Classes.js';
import { castableSlotLevels } from '../entities/SpellSlots.js';
import { toCaster } from '../entities/Caster.js';
import { replaceById } from '../entities/Roster.js';
import { castingCost, formatCastingTime, parseCastingTime } from '../entities/SpellTiming.js';
import { COST_LABELS, canSpend } from '../combat/ActionBudget.js';
import { activeCreatureByName } from '../library/Library.js';
import {
  findCombatant,
  targetSaveBonus,
  targetConditions,
  targetFeatRiders,
  targetArmorPenalty,
} from './combatants.js';
import { combatTargets, rosterTargets, targetFree, prefillTarget } from './spellTargets.js';
import { castFields, castChangeHandler, castCap, startingSlotLevel } from './spellCastFields.js';
import { resolveCast } from './spellCastResolve.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').CastPlan} CastPlan */
/** @typedef {import('../types/cast.js').CastRefused} CastRefused */

/**
 * Casting a spell, from the button the GM presses to the dialog and back.
 * The two entry points are `castSpellAction` for a combatant on their turn
 * and `castSpellOutOfCombat` for a character on the roster. Both assemble a
 * cast plan, ask the GM to fill it in, and hand the answers to
 * `spellCastResolve.js`.
 *
 * The plan is what makes one cast readable: it holds the caster, the
 * targets, the fields, and the write-back, so the dialog code below has no
 * rules of its own. The rules live in `entities/`, the targets in
 * `spellTargets.js`, and the field list in `spellCastFields.js`.
 */

/**
 * Cast a spell for the active combatant. This mirrors `weaponAttack`. The
 * targets come from the initiative order: foes for an attack or save, the
 * party for a heal. Then `runCast` runs the pre-roll dialog, resolves the
 * cast, and applies the result. The caster is the combatant that holds the
 * participant's id, found by the shared `findCombatant` function. Its
 * `store` function writes the spent slot back to that combatant's own collection.
 * @param {AppContext} app
 * @param {CombatState} combat
 * @param {Participant} participant
 * @param {Spell} spell
 * @param {{ targetId?: string | null }} [options] a target already picked on
 *   the combat board pre-fills the dialog target field
 */
export async function castSpellAction(app, combat, participant, spell, { targetId = null } = {}) {
  const targets = combatTargets(app, combat, participant, spell);
  const found = findCombatant(app, participant.id);
  if (!found) return;
  await runCast(
    app,
    found.entity,
    spell,
    targets,
    /** @type {(next: any) => void} */ (found.store),
    found.kind === 'character',
    targetId,
  );
}

/**
 * Cast a spell from a character's sheet outside of combat. The targets come
 * from the roster and nearby foes, with no initiative order. Then `runCast`
 * handles the dialog, the resolution, and the application, the same way the
 * combat path does.
 * @param {AppContext} app
 * @param {import('../types/entities.js').Character} caster
 * @param {Spell} spell
 */
export async function castSpellOutOfCombat(app, caster, spell) {
  await runCast(
    app,
    caster,
    spell,
    rosterTargets(app, spell),
    (next) => {
      app.state.characters = replaceById(app.state.characters, next);
      app.actions.refreshSelectedCharacter();
    },
    true,
  );
}

/**
 * Work out the pre-dialog half of a cast: the caster view, the targets with
 * their save bonuses filled in, the spendable slot levels, the save DC, the
 * target cap, the component check, and the field list for the dialog. Nothing
 * here touches the DOM, so the whole decision is testable. A refusal comes
 * back as `{ ok: false, message }` and the caller shows the message.
 *
 * A caster with no spell ability falls back to a flat DC 10. The caster
 * entity is read through `toCaster`, so a party Character and a Creature
 * resolve the same way.
 * A caster from a class with ritual casting is offered the ritual box, which
 * trades the slot for extra time.
 * @param {AppContext} app
 * @param {any} entity the real combatant that casts the spell
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget[]} offered
 * @returns {CastPlan | CastRefused}
 */
export function castPlan(app, entity, spell, offered) {
  // The pure spell helper functions take a `SpellCaster`: a caster's class,
  // level, stats, resources, and spellbook. This is exactly what `toCaster`
  // returns. The helpers read this view, and the code writes back only to
  // the real entity.
  const caster = toCaster(entity);
  if (!targetFree(spell.effect.kind) && offered.length === 0) {
    return { ok: false, message: 'No target available.' };
  }
  // A summons is only as good as the template it names. The check runs here so
  // a spell whose template was renamed or removed refuses before the dialog
  // opens, which is before a slot is spent.
  if (spell.effect.kind === 'summons' && !activeCreatureByName(spell.effect.creature)) {
    return {
      ok: false,
      message: `No creature template named "${spell.effect.creature}" in the library.`,
    };
  }
  // Each target of a save spell gets its own bonus where the app can read
  // one. The dialog shows what a target will add, and the resolver rolls it.
  // This happens once here, not in the two target assemblies, because the
  // saved ability is a property of the spell, not of the target.
  // A target's own chips ride the same save, so they travel with the bonus.
  // Both are read when the dialog opens, not when it is submitted, so a chip
  // that lands on a target while the dialog sits open misses this cast. The
  // GM opens and submits a cast in one motion, and re-reading the roster
  // under an open dialog would let the numbers on screen go stale instead.
  const saveAbility = spell.effect.kind === 'save' ? spell.effect.saveAbility : null;
  // Untrained armor slants a STR or DEX save, so a character target in such
  // armor carries the penalty flag alongside its bonus and chips.
  const physical = saveAbility === 'STR' || saveAbility === 'DEX';
  const targets = saveAbility
    ? offered.map((t) => {
        const bonus = targetSaveBonus(app, t.id, saveAbility);
        const conditions = targetConditions(app, t.id);
        const riders = targetFeatRiders(app, t.id);
        const penalized = physical && targetArmorPenalty(app, t.id);
        if (bonus === undefined && conditions.length === 0 && riders.length === 0 && !penalized) {
          return t;
        }
        return {
          ...t,
          ...(bonus === undefined ? {} : { saveBonus: bonus }),
          ...(conditions.length > 0 ? { conditions } : {}),
          ...(riders.length > 0 ? { riders } : {}),
          ...(penalized ? { armorPenalty: true } : {}),
        };
      })
    : offered;

  // A leveled spell casts from a slot at or above its level that still has a
  // charge, leveled or pact. The picker offers each such level.
  const slotLevels = spell.level > 0 ? castableSlotLevels(caster, spell.level) : [];
  // A multiclass caster's DC and attack bonus use the class the spell was
  // learned under. Without a recorded source, they fall back to the first
  // caster class.
  const sourceClass = spellSource(caster, spell.id) ?? undefined;
  const dc = spellSaveDC(caster, sourceClass) ?? 10;
  // Both caps read the level the picker starts on: the lowest slot the
  // caster can spend. This is also the level submitted if the GM does not
  // change it. The projectile allocation then follows the picked level,
  // because it must add up exactly. The target checkboxes stay at the
  // starting cap, and a cast above it drops the extra targets. `castSpell`
  // reports the dropped targets back.
  const cap = castCap(spell, startingSlotLevel(spell, slotLevels), caster.level ?? 1);
  // The check reads the real entity, not the caster view, because the
  // caster view has no inventory. A combatant with no inventory is never
  // asked for a component. Only a Character has an inventory. The check's
  // contract is that an entity without one needs nothing, so all three
  // combatant shapes go through the same check.
  const material = materialCheck(
    /** @type {{ inventory?: import('../types/entities.js').InventoryItem[] }} */ (
      /** @type {unknown} */ (entity)
    ),
    spell,
  );
  // Ritual casting is a class feature. A caster can cast a spell with a
  // ritual as a ritual only as a bard, cleric, druid, or wizard.
  const ritualOffered = spell.ritual && spell.level > 0 && hasRitualCasting(caster);
  // The 5e armor proficiency rule stops a cast in armor the caster is not
  // trained for. Only a Character wears tracked gear, so a creature never
  // hits this. The dialog offers a GM opt-out beside the component one.
  const armor = unproficientWear(entity);
  // A cast spends part of the caster's turn while a fight runs. The participant
  // holds the budget, so a caster outside the running order, casting from the
  // sheet, spends nothing. An entry with no casting time reads as an action,
  // which is what almost every spell costs.
  const participant = app.state.combat?.order.find((p) => p.id === entity.id) ?? null;
  const castingTime = spell.castingTime
    ? parseCastingTime(spell.castingTime)
    : /** @type {import('../types/spell.js').CastingTime} */ ({ kind: 'action' });
  const cost = castingCost(castingTime);
  // What this cast takes off the turn. There is nothing to take outside a
  // fight, and nothing a turn can pay toward a ten-minute casting time.
  const actionCost = participant ? cost : null;
  // Two things block a cast: a turn that already spent this part of itself, and
  // a casting time no turn can hold. Both offer the same opt-out.
  const actionBlocked = Boolean(participant && (cost === null || !canSpend(participant, cost)));
  const fields = castFields(spell, targets, slotLevels, dc, cap, {
    material: material.required,
    ritual: ritualOffered,
    armor: armor.length > 0,
    actionLabel: !actionBlocked
      ? ''
      : actionCost === null
        ? `Ignore casting time (${formatCastingTime(castingTime)})`
        : `Ignore action cost (${COST_LABELS[actionCost].toLowerCase()} already used)`,
  });
  if (!fields) {
    return { ok: false, message: `No level ${spell.level}+ slot left for ${spell.name}.` };
  }
  return {
    ok: true,
    entity,
    spell,
    caster,
    targets,
    saveAbility,
    slotLevels,
    sourceClass,
    dc,
    material,
    armor,
    actionCost,
    actionBlocked,
    castingTime,
    fields,
  };
}

/**
 * The shared cast pipeline behind both entry points. This mirrors
 * `weaponAttack`: `castPlan` works out what the dialog offers, the dialog
 * takes the slot level, the target, and the situational modes, and
 * `resolveCast` rolls and applies the cast. The dialog is the only part of
 * the pipeline that needs a browser.
 * @template {import('../types/entities.js').Character
 *   | import('../types/creature.js').Creature} T
 * @param {AppContext} app
 * @param {T} entity the real combatant that casts the spell
 * @param {Spell} spell
 * @param {import('./combatants.js').CombatTarget[]} offered
 * @param {(next: T) => void} writeBack stores the updated entity
 * @param {boolean} concentrates true when this caster can hold a spell open
 * @param {string | null} [preferredTargetId] a target picked before the
 *   dialog opened, from the combat board selection. The dialog pre-fills
 *   this target where it is offered.
 */
async function runCast(app, entity, spell, offered, writeBack, concentrates, preferredTargetId) {
  const plan = castPlan(app, entity, spell, offered);
  if (!plan.ok) {
    app.toasts.show(plan.message, { level: 'error' });
    return;
  }
  if (preferredTargetId) prefillTarget(plan.fields, preferredTargetId);
  const values = await promptModal(`Cast ${spell.name}`, plan.fields, {
    submitLabel: 'Cast',
    wide: true,
    onChange: castChangeHandler(plan),
  });
  if (!values) return;
  resolveCast(app, plan, values, { writeBack, concentrates });
}
