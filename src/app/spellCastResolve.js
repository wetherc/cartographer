import { exhaustionLevel } from '../entities/Exhaustion.js';
import { castSpell } from '../entities/Casting.js';
import { riderSources } from '../entities/FeatChoices.js';
import { pickedRollMode } from './rollModeField.js';
import { autoCrits, combineModes, rollMode, saveOutcome } from '../entities/ConditionEffects.js';
import { removeItem } from '../entities/Character.js';
import { formatInventoryEvent } from '../entities/InventoryLog.js';
import { spellAbilityModifier, spellAttackBonus } from '../entities/Classes.js';
import { toCaster, withCasterState } from '../entities/Caster.js';
import { durationInRounds, formatCastingTime } from '../entities/SpellTiming.js';
import { COST_LABELS } from '../combat/ActionBudget.js';
import { begin as beginConcentration } from '../entities/Concentration.js';
import { applyOutcomes } from './spellOutcomes.js';
import { attackerType } from '../entities/ChipSlants.js';
import { spendOnceChips } from './riderSpend.js';
import { dropRepeat, heldRepeat, opensRepeat, repeatedSpell } from '../entities/SpellRepeat.js';
import { blastPush, markInvocationUsed } from '../entities/Invocations.js';
import { warlockCast } from '../entities/MysticArcanum.js';
import { findCombatant, hpOf, targetConditions } from './combatants.js';
import { hasFeature } from '../entities/Features.js';
import { castTypeFields } from '../entities/CreatureType.js';
import { sourceSlant } from '../entities/SourceSlant.js';
import { applyConditionToTarget, endSpellEffects } from './combatantWrites.js';
import { chosenTargets, missingTarget } from './spellTargets.js';
import { effectiveSlot } from './spellCastFields.js';
import { wardSpellAttack } from './shieldWard.js';
import { redirectSpellTargets } from './redirectWard.js';
import { wardSpellDamage } from './damageWardPrompt.js';
import { resistSpellSaves } from './legendaryResistancePrompt.js';
import { actionIdOf, spendAction } from '../entities/CreatureActions.js';
import { healingBonus } from '../entities/HealingBonus.js';
import { isLucky, raceSaveSlant, spellRaceSave } from '../entities/RaceTraits.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */
/**
 * Stores a caster's updated entity in its collection. The entity is of the
 * kind the cast read, so a combatant's `store` (see `combatants.storeOf`)
 * fits here.
 * @typedef {(next: Character | Creature) => void} WriteBack
 */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').CastPlan} CastPlan */
/** @typedef {import('../types/cast.js').CastOutcome} CastOutcome */
/** @typedef {import('../types/cast.js').AttackOutcome<import('../types/cast.js').NamedCastTarget>} AttackOutcome */

/**
 * What a cast does once the GM has submitted the dialog. `resolveCast` rolls
 * the cast against the chosen targets and returns the outcome.
 * `applyOutcomes` writes that outcome into the world: hit points, condition
 * chips, summoned creatures, spent slots and materials, and the log lines
 * the GM reads afterward.
 *
 * The split matters because the roll is the part worth reading twice. A
 * caller can resolve a cast, show the numbers, and write them separately.
 */

/**
 * Resolve a cast from the dialog's answers, then write back and apply what it
 * did. This is everything the cast does once the GM has submitted, so it runs
 * and is tested without a browser.
 *
 * The pure `castSpell` resolver rolls the effect, and this function applies
 * the result and logs it. The caster is read again by id first, because the
 * plan holds the copy from before the dialog opened, and the entity can
 * change while the dialog is open. When a slot is spent, `withCasterState` splices the
 * change back onto the real entity, and the caller's `writeBack` function
 * stores it in the right collection. Damage or healing lands on each target
 * the same way a weapon hit does: every combatant tracks HP. A ritual spends
 * nothing and writes nothing back. A concentration spell starts the caster,
 * a party character or a creature, concentrating and ends whatever spell it
 * held before.
 * @param {AppContext} app
 * @param {CastPlan} plan
 * @param {Record<string, string>} values the dialog's answers
 * @param {{
 *   writeBack: WriteBack,
 *   rng?: () => number,
 *   ask?: import('./shieldWard.js').WardAsk,
 *   prompt?: import('./redirectWard.js').RedirectPrompt,
 * }} opts
 *   `writeBack` stores the updated entity. `rng` is the
 *   source for every roll the cast makes, injected the way the pure modules
 *   take theirs. `ask` puts the question of a target's ward (Shield, or a
 *   reaction that resists the damage), `prompt` asks which ally a Redirect
 *   Attack picks, and a test passes its own answers.
 * @returns {void | Promise<void>} a promise when a target's ward paused the
 *   cast, which settles once the cast has landed
 */
export function resolveCast(app, plan, values, { writeBack, rng = Math.random, ask, prompt }) {
  const { entity, spell, targets, saveAbility, sourceClass, dc, material, armor } = plan;
  // The plan holds the caster as it was when the dialog opened. The dialog
  // can sit open while a heal lands or another tab adopts a save. The cast
  // reads the caster again by id, so the write-back below never replaces
  // that newer entity with the stale copy plus a spent slot. A caster that
  // left the campaign in the meantime casts nothing and spends nothing.
  const submitted = findCombatant(app, entity.id)?.entity;
  if (!submitted) {
    app.toasts.show(`${entity.name} is no longer in the campaign.`);
    return;
  }
  // An unprepared Wizard ritual has no slot to fall back to, so it casts as
  // a ritual even if the box was unticked.
  const free = plan.free ?? null;
  // A once-per-rest use reads again off the submitted caster, because another tab
  // can spend it while this dialog sits open, and the plan copy would then
  // spend one use twice.
  const invocation = plan.invocation?.oncePerRest
    ? warlockCast(/** @type {any} */ (submitted), spell.id)
    : (plan.invocation ?? null);
  if (plan.invocation?.oncePerRest && (!invocation?.oncePerRest || invocation.spent)) {
    app.toasts.show(`${plan.invocation.invocation.name} is spent until a long rest.`, {
      level: 'error',
    });
    return;
  }
  const asRitual = !free && (values.ritual === '1' || plan.ritualOnly === true);
  const slotLevel = free
    ? free.slotLevel
    : spell.level > 0
      ? effectiveSlot(spell, values.slot, asRitual)
      : spell.level;
  // A repeat with fixed damage resolves as its own automatic hit (see
  // `SpellRepeat.repeatedSpell`). Every other cast resolves the spell itself.
  const resolved = free?.repeat ? repeatedSpell(spell) : spell;
  // A mode picked in the dialog replaces the condition slants, the same as in
  // the weapon attack dialog. Under Auto, the slants fold together.
  const picked = pickedRollMode(values.mode);
  const saveDC = Number(values.dc) || dc;
  let chosen = chosenTargets(targets, values);
  if (missingTarget(resolved, targets, values)) {
    app.toasts.show(`Pick at least one target for ${spell.name}.`);
    return;
  }
  // A missing component blocks the cast before the resolver runs, so a
  // refused cast never spends a slot. The check happens here, not in
  // `castSpell`, because the opt-out is a table ruling, not a rule of the spell.
  const enforce = material.required && values['ignore-components'] !== '1';
  if (enforce && !material.satisfied) {
    // A destroyed or costed material has to be the material itself. A
    // cost-free one names the focus first, because carrying a pouch covers
    // every such component at once.
    app.toasts.show(
      material.consumes || (spell.materials?.costGP ?? 0) > 0
        ? `${spell.name} needs ${spell.materials?.text}.`
        : `${spell.name} needs a component pouch or a focus, or ${spell.materials?.text}.`,
    );
    return;
  }
  // Untrained armor blocks the cast the same way a missing component does:
  // before the resolver runs, so no slot is spent. The opt-out is a table
  // ruling, so the check lives here and not in `castSpell`.
  if (armor.length > 0 && values['ignore-armor'] !== '1') {
    app.toasts.show(
      `${entity.name} cannot cast in ${armor.join(' and ')} without armor proficiency.`,
    );
    return;
  }
  // The turn pays for the cast last of the three refusals, so a cast stopped
  // for a component or for armor still costs nothing. A blocked cast needs the
  // opt-out, and a cast the turn can pay for spends it here, before any roll.
  if (plan.actionBlocked && values['ignore-action'] !== '1') {
    app.toasts.show(
      plan.actionCost
        ? `${entity.name} already used their ${COST_LABELS[plan.actionCost].toLowerCase()} this turn.`
        : `${spell.name} takes ${formatCastingTime(plan.castingTime ?? { kind: 'special', text: '' })}, longer than one turn.`,
    );
    return;
  }
  if (plan.ruleBlock && values['ignore-spell-rule'] !== '1') {
    app.toasts.show(`${entity.name} cannot cast ${spell.name}: ${plan.ruleBlock}.`);
    return;
  }
  // The plan judged the budget when the dialog opened, and the fight can move
  // while it stands there. The spend re-checks, so a cost that something else
  // took in the meantime refuses here the way the attack path refuses.
  if (!plan.actionBlocked && plan.actionCost && app.actions.spendBudget) {
    if (!app.actions.spendBudget(entity.id, plan.actionCost)) {
      app.toasts.show(
        `${entity.name} already used their ${COST_LABELS[plan.actionCost].toLowerCase()} this turn.`,
      );
      return;
    }
  }
  // The cast marks the turn for the bonus action spell rule, also when the GM
  // ticked an opt-out, because the spell was still cast.
  if (plan.spellFlag) app.actions.spendBudget(entity.id, plan.spellFlag);
  // The rest of the cast rolls against the final targets, after any Redirect
  // Attack below has swapped one of them for an ally.
  const rest = () => {
    // The Redirect Attack dialog can sit open the same way, so the caster is
    // read again here, after any pause and before anything is written.
    const live = findCombatant(app, entity.id)?.entity;
    if (!live) {
      app.toasts.show(`${entity.name} is no longer in the campaign.`);
      return;
    }
    const caster = live === entity ? plan.caster : toCaster(live);
    // The caster view carries no conditions, so the chips come off the real
    // combatant. A Bless on the caster rides its spell attack rolls, and a
    // Blinded on it slants them.
    const casterConditions = live.conditions ?? [];
    let castTargets = chosen;
    // An attack's dialog mode applies to the attack roll, so a save that its hit
    // brings rolls with only the target's own slant.
    const savePick = resolved.effect.kind === 'save' ? picked : null;
    if (saveAbility) {
      const raceSave = spellRaceSave(resolved, saveAbility);
      castTargets = chosen.map((t) => {
        // A target's untrained armor slants its STR or DEX save. The slant
        // folds in with the target's chips, so an advantage chip cancels it.
        const found = findCombatant(app, t.id);
        const character = found?.kind === 'character' ? found.entity : null;
        const outcome = saveOutcome(
          t.conditions,
          saveAbility,
          [t.armorPenalty ? 'disadvantage' : null, raceSaveSlant(character, raceSave)],
          found ? exhaustionLevel(found.entity) : 0,
        );
        const evasion = character !== null && hasFeature(character, 'Evasion');
        return {
          ...t,
          ...(evasion ? { evasion: true } : {}),
          ...(isLucky(character) ? { lucky: true } : {}),
          // Every live target carries a derived bonus. A target the roster lost
          // while the dialog sat open carries none and saves on the flat die.
          saveBonus: t.saveBonus ?? 0,
          saveMode: savePick ?? outcome.mode ?? 'normal',
          ...(outcome.failedBy ? { autoFailSave: outcome.failedBy } : {}),
        };
      });
    }
    // A spell with an HP limit or an HP pool reads each target's HP as it is
    // now. A pool also passes over a target by its chips (an Unconscious one),
    // so it reads those as they are now too.
    const effect = resolved.effect;
    if (effect.kind === 'save' && (effect.hpLimit !== undefined || effect.hpPool)) {
      castTargets = castTargets.map((t) => {
        const found = findCombatant(app, t.id);
        const hp = found ? hpOf(found.kind, found.entity) : null;
        return {
          ...t,
          ...(hp ? { hp: hp.current } : {}),
          ...(found && effect.hpPool ? { conditions: found.entity.conditions } : {}),
        };
      });
    }
    // The type rules of a spell read each target's creature type and condition
    // immunities, as the roster keeps them now.
    if ((effect.kind === 'save' || effect.kind === 'heal') && effect.typeRules) {
      castTargets = castTargets.map((t) => {
        return { ...t, ...castTypeFieldsOf(app, t.id) };
      });
    }
    if (resolved.effect.kind === 'attack') {
      // A melee spell attack says so. Otherwise a touch spell reaches as far as
      // a melee weapon does, which is the split Prone needs, and every other
      // range is a ranged attack.
      const melee = resolved.effect.melee ?? /touch/i.test(spell.range ?? '');
      castTargets = castTargets.map((t) => ({
        ...t,
        // A hit can leave a chip on targets of one type only (Chill Touch on
        // undead), so each target states its type.
        ...castTypeFieldsOf(app, t.id),
        attackMode:
          picked ??
          combineModes([
            rollMode({
              roller: casterConditions,
              target: t.conditions,
              kind: 'attack',
              melee,
              rollerType: attackerType(live),
              tired: exhaustionLevel(live),
            }),
            // A chip that the target's own spell left on the caster (Chill
            // Touch on an undead caster) slants the roll.
            sourceSlant(casterConditions, t.id),
          ]) ??
          'normal',
        // A helpless target turns a melee spell hit into a critical one, the
        // same rule a weapon swing follows.
        autoCrit: autoCrits(t.conditions, { melee }),
      }));
    }

    const result = castSpell(caster, resolved, {
      slotLevel,
      casterLevel: caster.level,
      targets: castTargets,
      spellAttackBonus: spellAttackBonus(caster, sourceClass) ?? 0,
      saveDC,
      spellModifier: spellAbilityModifier(caster, sourceClass) ?? 0,
      attackMode: resolved.effect.kind === 'attack' ? (picked ?? 'normal') : 'normal',
      ritual: asRitual,
      healBonus: healingBonus(live, resolved, slotLevel),
      ...(values['resist-type'] ? { resistPick: values['resist-type'] } : {}),
      ...(free ? { free: { slotLevel } } : {}),
      ...(invocation?.oncePerRest && !invocation.free ? { granted: true, pool: 'pact' } : {}),
      // The caster's feat riders join its chips for the projectile rolls. The
      // mode folds above keep the plain chip lists on both sides, because the
      // condition-effect table matches entries by name, and a feat that shares
      // a condition's name must not slant a roll.
      casterConditions: riderSources(live),
      rng,
    });
    if (!result.ok) {
      // A dialog opened with only the ritual box submits with no slot to
      // spend. Unticking the ritual box is the one way to reach 'no-slot' from here.
      app.toasts.show(
        result.reason === 'no-slot'
          ? `No level ${spell.level}+ slot left for ${spell.name}.`
          : `Can't cast ${spell.name}.`,
        { level: 'error' },
      );
      return;
    }
    // The cast rolled its own dice, so the tray's last result belongs to an
    // earlier roll.
    app.actions.clearDiceResult();
    if (result.truncated > 0) {
      app.toasts.show(
        `${spell.name} reaches ${result.targets.length} at level ${result.slotLevel}; ` +
          `${result.truncated} dropped.`,
      );
    }

    // The code writes the spent slot, the consumed component, and the started
    // concentration back to the caster before it applies effects. This
    // prevents any of them from lingering if effect application throws an
    // error. Each change threads onto the same value and stores once:
    // `withCasterState` splices the decremented slot pools onto the real
    // entity, a stack of the material comes off the inventory, and the
    // concentration state and its chip land beside them.
    // Holding the material is not the same as spending it. A costed component
    // must be in hand and stays there.
    const consumed = enforce && material.consumes && material.item ? material.item : null;
    // A repeat keeps the concentration of the first cast. Starting it again would
    // end the spell that the repeat belongs to.
    const holds = spell.concentration && !free?.repeat;
    // A once-per-rest invocation is spent until the next long rest.
    const used = invocation?.oncePerRest ? invocation.invocation.id : null;
    // A recharge action of a creature is spent until a recharge roll brings it back.
    const actionId = actionIdOf(spell);
    const recharges = actionId !== null && spendAction(live, actionId) !== live;
    // A fresh cast of a spell with an open repeat closes the old repeat, so the
    // new cast opens its own at its own slot level and on its own targets.
    const stale = !!spell.repeat && !free?.repeat && heldRepeat(live, spell.id) !== null;
    /** @type {import('../types/entities.js').ConcentrationState | null} */
    let displaced = null;
    if (result.spent || consumed || holds || used || stale || recharges) {
      let next = result.spent ? withCasterState(live, result.caster) : live;
      if (stale) next = dropRepeat(next, spell.id);
      // Only a Character reaches here with an inventory. `materialCheck`
      // already requires one.
      if (consumed) {
        next = removeItem(
          /** @type {import('../types/entities.js').Character} */ (next),
          consumed.id,
          1,
        );
      }
      if (holds) {
        const started = beginConcentration(
          /** @type {import('../types/entities.js').Character} */ (next),
          spell,
          result.slotLevel,
        );
        next = started.character;
        displaced = started.dropped;
      }
      if (used) {
        next = markInvocationUsed(
          /** @type {import('../types/entities.js').Character} */ (next),
          used,
        );
      }
      if (recharges) next = spendAction(next, /** @type {string} */ (actionId));
      writeBack(next);
      app.actions.markDirty();
    }
    if (consumed) {
      app.actions.logEvent(
        'note',
        formatInventoryEvent(caster.name, { verb: 'use', itemName: consumed.name, count: 1 }),
      );
    }
    // The clock counts watches, not minutes. The log states a ritual's extra
    // ten minutes for the GM to adjudicate, rather than advancing the clock.
    // A cast at will names no level, because it spends no slot.
    const at = result.ritual
      ? ' as a ritual (10 minutes longer)'
      : result.slotLevel > 0 && !(free && !free.repeat)
        ? ` at level ${result.slotLevel}`
        : '';
    const via = invocation ? ` (${invocation.invocation.name})` : '';
    app.actions.logEvent(
      'combat',
      free?.repeat
        ? `${caster.name} repeats ${spell.name}.`
        : `${caster.name} casts ${spell.name}${at}${via}.`,
    );
    // A caster holds one spell open at a time, so starting this spell ended
    // the previous effect. The table needs to know this rules consequence.
    // The creatures the displaced spell held go free before this cast's own
    // outcomes land, including when the caster recasts the same spell on someone new.
    if (displaced) {
      app.actions.logEvent(
        'combat',
        `${caster.name} stops concentrating on ${displaced.spellName} to hold ${spell.name}.`,
      );
      endSpellEffects(app, entity.id, displaced.spellId);
    }

    // A one-shot chip ends on the attack roll, before the outcomes land, so a
    // new Guiding Bolt chip from this cast stays on its target.
    if (resolved.effect.kind === 'attack') {
      for (const t of result.targets) {
        if (!t.id) continue;
        spendOnceChips(app, entity.id, t.id, {
          roller: casterConditions,
          target: targetConditions(app, t.id),
          rollerType: attackerType(live),
        });
      }
    }
    /** @param {typeof result} landed */
    const finish = (landed) => {
      applyOutcomes(app, resolved, landed, entity.id, { tracked: holds });
      // The chip for a later repeat lands last. The sweep of a displaced spell
      // above would take it off again, because it names this spell too.
      if (!free?.repeat) openRepeat(app, spell, landed, entity.id);
      notePush(app, spell, live, landed);
    };
    // A target that can raise its AC with a reaction (Shield) gets the chance
    // after the attack rolls and before its damage lands. A target that can
    // resist the damage with a reaction (Absorb Elements) gets its chance
    // next, on the damage that remains. With neither, the cast finishes here,
    // without waiting.
    /** @param {typeof result} checked */
    const guard = (checked) => {
      const guarding = wardSpellDamage(app, resolved, checked, entity.id, {
        ask,
        cast: resolveCast,
      });
      return guarding ? guarding.then(finish) : finish(checked);
    };
    // A legendary creature that failed the save of a save spell can turn it
    // into a success first, which changes the damage the reaction sees.
    /** @param {typeof result} checked */
    const resist = (checked) => {
      const resisting = resistSpellSaves(app, resolved, checked, { ask });
      return resisting ? resisting.then(guard) : guard(checked);
    };
    const warding = wardSpellAttack(app, resolved, result, entity.id, { ask, cast: resolveCast });
    if (warding) return warding.then(resist);
    return resist(result);
  };
  // An attack spell aimed at a creature with Redirect Attack asks first, after
  // the cast pays and before the attack roll (see `redirectWard.js`).
  const redirecting =
    resolved.effect.kind === 'attack'
      ? redirectSpellTargets(app, resolved.name, chosen, entity.id, targets, { prompt })
      : null;
  if (!redirecting) return rest();
  return redirecting.then((next) => {
    chosen = next;
    return rest();
  });
}

/**
 * Give the caster the chip that lets it repeat a spell on a later turn, when
 * the spell has a repeat and the first cast opened one. A repeat that stays
 * on the creatures it hit records their ids and opens only on a hit.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {{ slotLevel: number, outcomes: CastOutcome[], targets: { id?: string }[] }} result
 * @param {string} casterId
 */
function openRepeat(app, spell, result, casterId) {
  if (!spell.repeat) return;
  const hits =
    spell.effect.kind === 'attack'
      ? /** @type {AttackOutcome[]} */ (result.outcomes)
          .filter((o) => o.hit)
          .map((o) => o.target.id)
      : result.targets.map((t) => t.id);
  const hitIds = /** @type {string[]} */ (hits.filter(Boolean));
  if (!opensRepeat(spell, hitIds)) return;
  applyConditionToTarget(app, casterId, spell.name, durationInRounds(spell.duration), {
    spellId: spell.id,
    spellName: spell.name,
    casterId,
    repeat: { slotLevel: result.slotLevel, ...(spell.repeat.damage ? { targetIds: hitIds } : {}) },
  });
}

/**
 * Log how far each creature that an Eldritch Blast hit can be pushed, for a
 * warlock with Repelling Blast. Each beam that hits pushes once. The GM moves
 * the token, because the board does not move a token by feet.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {any} caster the live caster
 * @param {{ outcomes: CastOutcome[] }} result
 */
function notePush(app, spell, caster, result) {
  if (spell.id !== 'eldritch-blast') return;
  const push = blastPush(caster);
  if (!push) return;
  for (const o of /** @type {AttackOutcome[]} */ (result.outcomes)) {
    const hits = o.shots ? o.hits : o.hit ? 1 : 0;
    if (hits === 0) continue;
    app.actions.logEvent(
      'combat',
      `${o.target.name} can be pushed up to ${hits * push.feet} feet (${push.name}).`,
    );
  }
}

/**
 * The creature type and condition immunities of a roster entry, for the type
 * rules of a spell. An id the roster lost gives none.
 * @param {AppContext} app
 * @param {string | undefined} id
 */
function castTypeFieldsOf(app, id) {
  const found = findCombatant(app, id ?? '');
  return found ? castTypeFields(found.kind, found.entity) : {};
}
