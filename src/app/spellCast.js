import { promptModal } from '../ui/Modal.js';
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
import { replaceById } from '../entities/Roster.js';
import { rollsNoSave } from '../entities/SpellFields.js';
import { castingCost, formatCastingTime, parseCastingTime } from '../entities/SpellTiming.js';
import { COST_LABELS, budgetOf, canSpend } from '../combat/ActionBudget.js';
import { spellRuleBlock, spellRuleFlag } from '../combat/SpellRule.js';
import { activeCreatureByName } from '../library/Library.js';
import {
  findCombatant,
  targetSaveBonus,
  targetConditions,
  targetFeatRiders,
  targetArmorPenalty,
} from './combatants.js';
import {
  combatTargets,
  missingTarget,
  rosterTargets,
  targetFree,
  targetValues,
  prefillTarget,
} from './spellTargets.js';
import { castFields, castChangeHandler, castCap, startingSlotLevel } from './spellCastFields.js';
import { resolveCast } from './spellCastResolve.js';
import { castRoutes } from '../entities/CastRoute.js';

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
 * @param {{ targetId?: string | null, prompt?: typeof promptModal }} [options]
 *   a target already picked on the combat board pre-fills the dialog target
 *   field. `prompt` renders the dialogs, and a test passes its own answers.
 */
export async function castSpellAction(
  app,
  combat,
  participant,
  spell,
  { targetId = null, prompt = promptModal } = {},
) {
  const targets = combatTargets(app, combat, participant, spell);
  const found = findCombatant(app, participant.id);
  if (!found) return;
  await runCast(
    app,
    found.entity,
    spell,
    targets,
    /** @type {(next: any) => void} */ (found.store),
    targetId,
    prompt,
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
 * @param {{ prompt?: typeof promptModal }} [options] `prompt` renders the
 *   dialogs, and a test passes its own answers.
 */
export async function castSpellOutOfCombat(app, caster, spell, { prompt = promptModal } = {}) {
  await runCast(
    app,
    caster,
    spell,
    rosterTargets(app, spell, caster.id),
    (next) => {
      app.state.characters = replaceById(app.state.characters, next);
      app.actions.refreshSelectedCharacter();
    },
    null,
    prompt,
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
  // An invocation casts its spell at will with no slot, or once per long rest
  // with a pact slot. A once-per-rest spell that the spellbook also has casts
  // the usual way, which keeps the use for later. A spent one with no
  // spellbook entry refuses until a long rest. A GM who picked the slot cast
  // of an at-will spell casts it the usual way.
  // A Mystic Arcanum casts once per long rest with no slot.
  let invocation = hold || route === 'slot' ? null : warlockCast(entity, listed.id);
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
  const free = hold
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
  const dc = spellSaveDC(caster, sourceClass) ?? 10;
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
 * @param {string | null} [preferredTargetId] a target picked before the
 *   dialog opened, from the combat board selection. The dialog pre-fills
 *   this target where it is offered.
 * @param {typeof promptModal} [prompt] renders the dialogs
 */
async function runCast(
  app,
  entity,
  spell,
  offered,
  writeBack,
  preferredTargetId,
  prompt = promptModal,
) {
  const route = await pickRoute(spell, castRoutes(entity, spell), prompt);
  if (route === undefined) return;
  const plan = castPlan(app, entity, spell, offered, route);
  if (!plan.ok) {
    app.toasts.show(plan.message, { level: 'error' });
    return;
  }
  if (preferredTargetId) prefillTarget(plan.fields, preferredTargetId);
  const verb = plan.free?.repeat ? 'Repeat' : 'Cast';
  const values = await prompt(`${verb} ${spell.name}`, plan.fields, {
    submitLabel: verb,
    wide: true,
    onChange: castChangeHandler(plan),
    // Each opt-out box that the cast would be refused without holds Cast
    // disabled until it is ticked.
    submitRequires: [
      ...(plan.material.required && !plan.material.satisfied ? ['ignore-components'] : []),
      ...(plan.armor.length > 0 ? ['ignore-armor'] : []),
      ...(plan.actionBlocked ? ['ignore-action'] : []),
      ...(plan.ruleBlock ? ['ignore-spell-rule'] : []),
    ],
    // Cast with no target ticked keeps the dialog open, so the GM picks one
    // instead of starting the cast over.
    validate: (get) =>
      missingTarget(spell, plan.targets, targetValues(plan.fields, get))
        ? 'Pick at least one target.'
        : '',
  });
  if (!values) return;
  await resolveCast(app, plan, values, { writeBack });
}

/**
 * Ask the GM how to pay for a spell that has more than one way, before the
 * cast dialog opens. The answer decides the slot picker, the targets, and
 * the components of that dialog, so it comes first. A spell with one way
 * resolves to null with no question.
 * @param {Spell} spell
 * @param {{ id: import('../types/cast.js').CastRoute, label: string }[]} routes
 * @param {typeof promptModal} prompt renders the question
 * @returns {Promise<import('../types/cast.js').CastRoute | null | undefined>}
 *   the picked route, null with nothing to pick, or undefined when the GM
 *   cancels
 */
async function pickRoute(spell, routes, prompt) {
  if (routes.length === 0) return null;
  const values = await prompt(
    `Cast ${spell.name}`,
    [
      {
        name: 'route',
        label: 'How to cast',
        type: 'select',
        value: routes[0].id,
        options: routes.map((r) => ({ value: r.id, label: r.label })),
      },
    ],
    { submitLabel: 'Next' },
  );
  if (!values) return undefined;
  return /** @type {import('../types/cast.js').CastRoute} */ (values.route);
}
