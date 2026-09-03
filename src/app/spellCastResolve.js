import { castSpell } from '../entities/Casting.js';
import { riderSummary } from '../entities/Riders.js';
import { riderSources } from '../entities/FeatChoices.js';
import { combineModes, rollMode, saveOutcome } from '../entities/ConditionEffects.js';
import { removeItem } from '../entities/Character.js';
import { formatInventoryEvent } from '../entities/InventoryLog.js';
import { spellAttackBonus } from '../entities/Classes.js';
import { formatModifier } from '../entities/Modifiers.js';
import { toCaster, withCasterState } from '../entities/Caster.js';
import { durationInRounds, formatCastingTime } from '../entities/SpellTiming.js';
import { COST_LABELS } from '../combat/ActionBudget.js';
import { begin as beginConcentration } from '../entities/Concentration.js';
import { spawnSummons } from './summons.js';
import {
  findCombatant,
  applyToTarget,
  applyConditionToTarget,
  endSpellEffects,
} from './combatants.js';
import { targetFree, chosenTargets, targetSummary } from './spellTargets.js';
import { effectiveSlot } from './spellCastFields.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').CastPlan} CastPlan */

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
 * nothing and writes nothing back. A concentration spell cast by a party
 * character starts that character concentrating and ends whatever spell it
 * held before.
 * @param {AppContext} app
 * @param {CastPlan} plan
 * @param {Record<string, string>} values the dialog's answers
 * @param {{ writeBack: (next: any) => void, concentrates: boolean, rng?: () => number }} opts
 *   `writeBack` stores the updated entity. `concentrates` is true when this
 *   caster can hold a spell open. Only a party character can, because a
 *   creature has no concentration field. The call site passes
 *   this value, because it already knows the combatant kind. `rng` is the
 *   source for every roll the cast makes, injected the way the pure modules
 *   take theirs.
 */
export function resolveCast(app, plan, values, { writeBack, concentrates, rng = Math.random }) {
  const { entity, spell, targets, saveAbility, sourceClass, dc, material, armor } = plan;
  // The plan holds the caster as it was when the dialog opened. The dialog
  // can sit open while a heal lands or another tab adopts a save. The cast
  // reads the caster again by id, so the write-back below never replaces
  // that newer entity with the stale copy plus a spent slot. A caster that
  // left the campaign in the meantime casts nothing and spends nothing.
  const live = findCombatant(app, entity.id)?.entity;
  if (!live) {
    app.toasts.show(`${entity.name} is no longer in the campaign.`);
    return;
  }
  const caster = live === entity ? plan.caster : toCaster(live);
  const asRitual = values.ritual === '1';
  const slotLevel = spell.level > 0 ? effectiveSlot(spell, values.slot, asRitual) : spell.level;
  const mode = /** @type {import('../types/dice.js').RollMode} */ (values.mode ?? 'normal');
  const saveDC = Number(values.dc) || dc;
  const chosen = chosenTargets(targets, values);
  if (!targetFree(spell.effect.kind) && chosen.length === 0) {
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
  // The caster view carries no conditions, so the chips come off the real
  // combatant. A Bless on the caster rides its spell attack rolls, and a
  // Blinded on it slants them.
  const casterConditions = live.conditions ?? [];
  // The GM's dialog choice and the chips on the table are two sources of the
  // same slant, so they fold together under the cancel rule. Neither one
  // overrides the other.
  let castTargets = chosen;
  if (saveAbility) {
    castTargets = chosen.map((t) => {
      // A target's untrained armor slants its STR or DEX save. The slant
      // folds in with the target's chips, so an advantage chip cancels it.
      const outcome = saveOutcome(
        t.conditions,
        saveAbility,
        t.armorPenalty ? ['disadvantage'] : [],
      );
      return {
        ...t,
        // Every live target carries a derived bonus. A target the roster lost
        // while the dialog sat open carries none and saves on the flat die.
        saveBonus: t.saveBonus ?? 0,
        saveMode: combineModes([mode, outcome.mode]) ?? 'normal',
        ...(outcome.failedBy ? { autoFailSave: outcome.failedBy } : {}),
      };
    });
  } else if (spell.effect.kind === 'attack') {
    // A touch spell reaches as far as a melee weapon does, which is the split
    // Prone needs. Every other range is a ranged attack.
    const melee = /touch/i.test(spell.range ?? '');
    castTargets = chosen.map((t) => ({
      ...t,
      attackMode:
        combineModes([
          mode,
          rollMode({ roller: casterConditions, target: t.conditions, kind: 'attack', melee }),
        ]) ?? 'normal',
    }));
  }

  const result = castSpell(caster, spell, {
    slotLevel,
    casterLevel: caster.level ?? 1,
    targets: castTargets,
    spellAttackBonus: spellAttackBonus(caster, sourceClass) ?? 0,
    saveDC,
    attackMode: spell.effect.kind === 'attack' ? mode : 'normal',
    ritual: asRitual,
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
  const holds = concentrates && spell.concentration;
  /** @type {import('../types/entities.js').ConcentrationState | null} */
  let displaced = null;
  if (result.spent || consumed || holds) {
    let next = result.spent ? withCasterState(live, result.caster) : live;
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
  const at = result.ritual
    ? ' as a ritual (10 minutes longer)'
    : result.slotLevel > 0
      ? ` at level ${result.slotLevel}`
      : '';
  app.actions.logEvent('combat', `${caster.name} casts ${spell.name}${at}.`);
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

  applyOutcomes(app, spell, result, entity.id, { tracked: holds });
}

/**
 * The parenthetical a log line carries when the caster's chips changed the
 * roll, or an empty string when they did not. A multi-projectile cast passes
 * one entry per ray, because each ray rolls the riders again, and the rays
 * that rolled nothing drop out.
 * @param {({ note: string } | null | undefined)[]} riders
 * @returns {string}
 */
function riderNote(riders) {
  const notes = riders.filter((r) => r?.note).map((r) => /** @type {{ note: string }} */ (r).note);
  return notes.length > 0 ? ` (${notes.join('; ')})` : '';
}

/**
 * Apply and log a resolved cast's outcomes: attack hits and misses, save
 * results with full, half, or no damage, and healing. Each target gets its
 * own log line, so a multi-target cast is auditable roll by roll. The toast
 * carries the summary. Damage and healing route to the same HP models the
 * weapon path uses.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {{ outcomes: object[], targets: import('../entities/Casting.js').CastTarget[] }} result
 * @param {string} casterId the function stamps this id onto a condition this
 *   cast imposes, so the app can find the effect again when the caster stops
 *   holding the spell
 * @param {{ tracked?: boolean }} [options] `tracked` is true when the caster
 *   took up concentration on this cast. A summons that nothing concentrates on
 *   stays on the map until the GM removes it, and the log says so.
 */
export function applyOutcomes(app, spell, result, casterId, { tracked = false } = {}) {
  const kind = spell.effect.kind;
  const summary = targetSummary(result.targets);
  if (kind === 'attack') {
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      // A multi-projectile cast logs the tally, not one line per ray. The
      // rolls are already aggregated per creature, and the damage carries
      // every ray's dice.
      if (o.shots) {
        const tally = `${o.hits} of ${o.fired} hit ${o.target.name}`;
        // Each ray rolls the caster's riders again, so the line names every
        // ray's dice. The tally itself prints no to-hit numbers, and this is
        // the only place the rays' own rolls are recorded.
        const rode = riderNote(o.shots.map((/** @type {any} */ s) => s.rider));
        app.actions.logEvent(
          'combat',
          o.hits > 0
            ? `${spell.name}: ${tally}${rode} for ${o.damage.detail}.`
            : `${spell.name}: ${tally}${rode} (AC ${o.ac}).`,
        );
        applyToTarget(app, o.target.id, o.damage?.total ?? 0, false);
        continue;
      }
      const verb = o.crit ? 'critically hits' : o.hit ? 'hits' : 'misses';
      // A rider on the caster changed the number, so both outcomes say so.
      const rode = riderNote([o.rider]);
      if (!o.hit) {
        app.actions.logEvent(
          'combat',
          `${spell.name}: ${o.attack.total} to hit vs AC ${o.ac}${rode} — ${verb} ${o.target.name}.`,
        );
        continue;
      }
      app.actions.logEvent(
        'combat',
        `${spell.name} ${verb} ${o.target.name}${rode} for ${o.damage?.detail || '0 damage'}.`,
      );
      applyToTarget(app, o.target.id, o.damage?.total ?? 0, false);
    }
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'save') {
    // A failed save's condition rides for as long as the spell lasts. The
    // structured duration gives this length in rounds. An open-ended
    // duration leaves the chip for the GM to clear.
    const rounds = durationInRounds(spell.duration);
    const effect = /** @type {import('../types/spell.js').SpellSaveEffect} */ (spell.effect);
    const ability = effect.saveAbility;
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      const verdict = o.saved ? 'saves' : 'fails';
      // The log names the bonus alongside the roll, the same way an attack
      // log names the ability and proficiency behind its number.
      const bonus = `${ability} ${formatModifier(o.target.saveBonus ?? 0)}`;
      // The chip records the cast that wrote it. This lets the app end the
      // effect when the caster stops holding the spell, and lets a repeated
      // save roll against it. The app uses the bonus stamped here only for a
      // target whose own save it cannot read. It re-derives a character's
      // bonus at retry time.
      const imposed = o.condition
        ? applyConditionToTarget(
            app,
            o.target.id,
            o.condition,
            rounds,
            {
              spellId: spell.id,
              spellName: spell.name,
              casterId,
              saveAbility: ability,
              saveDC: o.dc,
              saveBonus: o.target.saveBonus ?? 0,
              ...(effect.saveEnds ? { saveEnds: true } : {}),
            },
            o.conditionRider,
          )
        : false;
      const cond = o.condition ? `, ${o.condition}${imposed ? '' : ' (untracked)'}` : '';
      // A rider the target already held changed the roll, so the line states it.
      const rode = o.rider ? `, ${o.rider.note}` : '';
      // A chip that fails the save outright threw no die, so the line names
      // the chip where the roll would have gone.
      const detail = o.autoFailedBy ? o.autoFailedBy : `${bonus}${rode}: ${o.save.total}`;
      app.actions.logEvent(
        'combat',
        `${o.target.name} ${verdict} DC ${o.dc} (${detail}) — takes ${o.taken} damage${cond}.`,
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
  if (kind === 'buff') {
    // A buff rolls nothing, so the whole cast is the chip it leaves. The chip
    // carries the same source a failed save writes, which is what lets
    // `endSpellEffects` sweep it when the caster stops concentrating.
    const rounds = durationInRounds(spell.duration);
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      const imposed = applyConditionToTarget(
        app,
        o.target.id,
        o.condition,
        rounds,
        { spellId: spell.id, spellName: spell.name, casterId },
        o.rider,
      );
      const adds = o.rider ? `: ${riderSummary(o.rider)}` : '';
      app.actions.logEvent(
        'combat',
        `${o.target.name} gains ${o.condition}${adds}${imposed ? '' : ' (untracked)'}.`,
      );
    }
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'summons') {
    // The one outcome names the template and the count. The creatures land on
    // the tile of the party, which is the only place a cast can reach without
    // map distance.
    for (const o of /** @type {any[]} */ (result.outcomes)) {
      const spawn = spawnSummons(app, spell, casterId, o);
      if ('error' in spawn) {
        app.toasts.show(spawn.error, { level: 'error' });
        return;
      }
      // An untracked summon has nothing holding it, so nothing will take it
      // away again. A spell with no concentration, and a creature caster, both
      // land here.
      const held = tracked ? '' : ' (untracked)';
      const tally = `${spawn.spawned.length} x ${spawn.template}`;
      app.actions.logEvent('combat', `${spell.name} summons ${tally}${held}.`);
      app.toasts.show(`${spell.name} summons ${tally}.`);
    }
    return;
  }
  app.toasts.show(`${spell.name} cast.`);
}
