import { canCast } from '../entities/Casting.js';
import { materialCheck } from '../entities/MaterialCheck.js';
import { spellSource } from '../entities/Character.js';
import { unproficientWear } from '../entities/Armor.js';
import { spellSaveDC, hasRitualCasting } from '../entities/Classes.js';
import { castableSlotLevels, pactSlotLevels } from '../entities/SpellSlots.js';
import { toCaster } from '../entities/Caster.js';
import { isRitualOnly } from '../entities/SpellView.js';
import { heldRepeat } from '../entities/SpellRepeat.js';
import { invokedSpell } from '../entities/Invocations.js';
import { warlockCast } from '../entities/MysticArcanum.js';
import { tomeRituals } from '../entities/PactTome.js';
import { rollsNoSave } from '../entities/SpellFields.js';
import { castingCost, formatCastingTime, parseCastingTime } from '../entities/SpellTiming.js';
import { COST_LABELS, budgetOf, canSpend } from '../combat/ActionBudget.js';
import { spellRuleBlock, spellRuleFlag } from '../combat/SpellRule.js';
import { activeCreatureByName } from '../library/Library.js';
import {
  targetSaveBonus,
  targetConditions,
  targetFeatRiders,
  targetArmorPenalty,
} from './combatants.js';
import { targetFree } from './spellTargets.js';
import { castFields, castCap, startingSlotLevel } from './spellCastFields.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').CastPlan} CastPlan */
/** @typedef {import('../types/cast.js').CastRefused} CastRefused */

/**
 * The cast plan, the part of a cast that comes before the dialog. It lives
 * apart from the dialog code in `spellCast.js` and does not import the
 * resolver in `spellCastResolve.js`. The reaction pauses build a plan for
 * the defender's spell through `reactionGate.js`, and the resolver imports
 * those pauses, so an import of the resolver here would make a cycle.
 */

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
 * A spell that a warlock casts through an invocation reads as the invocation
 * changes it (see `Invocations.invokedSpell`), and it needs no spellbook entry.
 * @param {AppContext} app
 * @param {any} entity the real combatant that casts the spell
 * @param {Spell} listed the spell as the spell list offers it
 * @param {import('./combatants.js').CombatTarget[]} offered
 * @param {import('../types/cast.js').CastRoute | null} [route] the way to pay
 *   that the GM picked, for a spell with more than one (see `castRoutes`)
 * @returns {CastPlan | CastRefused}
 */
export function castPlan(app, entity, listed, offered, route = null) {
  // The pure spell helper functions take a `SpellCaster`: a caster's class,
  // level, stats, resources, and spellbook. This is exactly what `toCaster`
  // returns. The helpers read this view, and the code writes back only to
  // the real entity.
  const caster = toCaster(entity);
  // A spell the caster still keeps open from an earlier turn repeats for free,
  // unless the GM picked to cast it anew.
  const hold = listed.repeat && route !== 'anew' ? heldRepeat(entity, listed.id) : null;
  // A creature save action (see `CreatureActions.actionSpell`) casts with no
  // slot and uses its own DC.
  const creatureAction =
    /** @type {{ creatureAction?: { id: string, dc: number } }} */ (listed).creatureAction ?? null;
  // An invocation casts its spell at will with no slot, or once per long rest
  // with a pact slot. A once-per-rest spell that the spellbook also has casts
  // the usual way, which keeps the use for later. A spent one with no
  // spellbook entry refuses until a long rest. A GM who picked the slot cast
  // of an at-will spell casts it the usual way.
  // A Mystic Arcanum casts once per long rest with no slot.
  let invocation =
    hold || route === 'slot' || creatureAction ? null : warlockCast(entity, listed.id);
  // A spent arcanum of a spell the spellbook also has casts with a slot.
  if (
    invocation?.oncePerRest &&
    (!invocation.free || invocation.spent) &&
    canCast(caster, listed)
  ) {
    invocation = null;
  }
  const spell = invokedSpell(entity, listed, { atWill: !!invocation && !invocation.oncePerRest });
  if (!targetFree(spell.effect.kind) && offered.length === 0) {
    return { ok: false, message: 'No target available.' };
  }
  // A repeat costs no slot, no component, and no armor check, because the
  // first cast paid all three. A repeat locked to the creatures it hit offers
  // only those.
  const locked = hold?.targetIds;
  const reachable = locked ? offered.filter((t) => locked.includes(t.id)) : offered;
  if (locked && reachable.length === 0) {
    return { ok: false, message: `${spell.name} has lost its target.` };
  }
  if (invocation?.spent) {
    return { ok: false, message: `${invocation.invocation.name} is spent until a long rest.` };
  }
  /** @type {import('../types/cast.js').CastFree | null} */
  const free = creatureAction
    ? { slotLevel: 0 }
    : hold
      ? { slotLevel: hold.slotLevel, repeat: true }
      : invocation && (!invocation.oncePerRest || invocation.free)
        ? { slotLevel: spell.level }
        : null;
  const repeat = !!free?.repeat;
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
  // saved ability is a property of the spell, not of the target. An attack
  // spell whose hit brings a save reads the same numbers for that save.
  // A target's own chips ride the same save, so they travel with the bonus.
  // Both are read when the dialog opens, not when it is submitted, so a chip
  // that lands on a target while the dialog sits open misses this cast. The
  // GM opens and submits a cast in one motion, and re-reading the roster
  // under an open dialog would let the numbers on screen go stale instead.
  // A spell that reads HP in place of a save (Sleep, Power Word Kill) rolls
  // none, so its targets need no bonus.
  const saveAbility =
    spell.effect.kind === 'save'
      ? rollsNoSave(spell.effect)
        ? null
        : spell.effect.saveAbility
      : spell.effect.kind === 'attack'
        ? (spell.effect.onHit?.saveAbility ?? null)
        : null;
  // Untrained armor slants a STR or DEX save, so a character target in such
  // armor carries the penalty flag alongside its bonus and chips.
  const physical = saveAbility === 'STR' || saveAbility === 'DEX';
  const targets = saveAbility
    ? reachable.map((t) => {
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
    : reachable;

  // A leveled spell casts from a slot at or above its level that still has a
  // charge, leveled or pact. The picker offers each such level. A Wizard's
  // unprepared ritual casts only as a ritual, so it offers no slot, and the
  // ritual box opens ticked. A once-per-rest invocation casts with a warlock
  // spell slot, so it offers only the pact slot level.
  const ritualOnly = !free && isRitualOnly(caster, spell);
  const pactOnly = !!invocation?.oncePerRest && !invocation.free;
  const slotLevels =
    spell.level > 0 && !ritualOnly && !free
      ? (pactOnly ? pactSlotLevels : castableSlotLevels)(caster, spell.level)
      : [];
  // A multiclass caster's DC and attack bonus use the class the spell was
  // learned under. Without a recorded source, they fall back to the first
  // caster class. A cast through an invocation, or of a ritual in the Book of
  // Shadows, is a warlock cast.
  const sourceClass =
    invocation || tomeRituals(caster).includes(spell.id)
      ? 'warlock'
      : (spellSource(caster, spell.id) ?? undefined);
  const dc = creatureAction ? creatureAction.dc : (spellSaveDC(caster, sourceClass) ?? 10);
  // Both caps read the level the picker starts on: the lowest slot the
  // caster can spend. This is also the level submitted if the GM does not
  // change it. The projectile allocation and the target checkboxes then
  // follow the picked level. The cap at the highest slot decides whether the
  // dialog needs checkboxes at all, so an upcast Hold Person can name a
  // second creature. A cast over its cap drops the extra targets, and
  // `castSpell` reports them back.
  const cap = castCap(
    spell,
    free ? free.slotLevel : startingSlotLevel(spell, slotLevels),
    caster.level ?? 1,
  );
  const maxCap = free
    ? cap
    : castCap(
        spell,
        slotLevels.length ? Math.max(...slotLevels) : startingSlotLevel(spell, slotLevels),
        caster.level ?? 1,
      );
  // The check reads the real entity, not the caster view, because the
  // caster view has no inventory. A combatant with no inventory is never
  // asked for a component. Only a Character has an inventory. The check's
  // contract is that an entity without one needs nothing, so all three
  // combatant shapes go through the same check.
  const material = repeat
    ? { required: false, satisfied: true, item: null, consumes: false }
    : materialCheck(
        /** @type {{ inventory?: import('../types/entities.js').InventoryItem[] }} */ (
          /** @type {unknown} */ (entity)
        ),
        spell,
      );
  // Ritual casting is a class feature. A caster can cast a spell with a
  // ritual as a ritual only as a bard, cleric, druid, or wizard, or as a
  // warlock with Book of Ancient Secrets for a ritual in its book.
  const ritualOffered =
    !free && spell.ritual && spell.level > 0 && hasRitualCasting(caster, spell.id);
  // The 5e armor proficiency rule stops a cast in armor the caster is not
  // trained for. Only a Character wears tracked gear, so a creature never
  // hits this. The dialog offers a GM opt-out beside the component one.
  const armor = repeat ? [] : unproficientWear(entity);
  // A cast spends part of the caster's turn while a fight runs. The participant
  // holds the budget, so a caster outside the running order, casting from the
  // sheet, spends nothing. An entry with no casting time reads as an action,
  // which is what almost every spell costs.
  const participant = app.state.combat?.order.find((p) => p.id === entity.id) ?? null;
  const castingTime = spell.castingTime
    ? parseCastingTime(spell.castingTime)
    : /** @type {import('../types/spell.js').CastingTime} */ ({ kind: 'action' });
  // A repeat costs what the spell says it costs on later turns, which is the
  // casting time's cost unless the spell names another.
  const cost = repeat ? (spell.repeat?.cost ?? castingCost(castingTime)) : castingCost(castingTime);
  // What this cast takes off the turn. There is nothing to take outside a
  // fight, and nothing a turn can pay toward a ten-minute casting time.
  const actionCost = participant ? cost : null;
  // Two things block a cast: a turn that already spent this part of itself, and
  // a casting time no turn can hold. Both offer the same opt-out.
  const actionBlocked = Boolean(participant && (cost === null || !canSpend(participant, cost)));
  // The bonus action spell rule applies on the caster's own turn alone, so a
  // reaction spell on another turn (Shield) never meets it. A repeat of a spell
  // that an earlier turn paid for is not a new cast, and the rule skips it.
  const onTurn = participant && app.state.combat?.order[app.state.combat.index]?.id === entity.id;
  const ruleCheck = onTurn && !repeat && participant;
  const ruleBlock = ruleCheck
    ? spellRuleBlock(budgetOf(participant.used), spell.level, cost)
    : null;
  const spellFlag = ruleCheck ? spellRuleFlag(spell.level, cost) : null;
  const fields = castFields(spell, targets, slotLevels, dc, cap, {
    maxCap,
    material: material.required,
    materialMissing: material.required && !material.satisfied,
    ritual: ritualOffered,
    free: !!free,
    armor: armor.length > 0,
    actionLabel: !actionBlocked
      ? ''
      : actionCost === null
        ? `Ignore casting time (${formatCastingTime(castingTime)})`
        : `Ignore action cost (${COST_LABELS[actionCost].toLowerCase()} already used)`,
    ruleLabel: ruleBlock ? `Ignore the bonus action spell rule (${ruleBlock})` : '',
  });
  if (!fields) {
    const kind = pactOnly ? 'pact' : `level ${spell.level}+`;
    return { ok: false, message: `No ${kind} slot left for ${spell.name}.` };
  }
  return {
    ok: true,
    entity,
    spell,
    caster,
    targets,
    saveAbility,
    slotLevels,
    ritualOnly,
    sourceClass,
    dc,
    material,
    armor,
    actionCost,
    actionBlocked,
    castingTime,
    ruleBlock,
    spellFlag,
    free,
    invocation,
    fields,
  };
}
