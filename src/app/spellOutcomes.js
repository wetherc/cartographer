import { hitRiderSummary } from '../entities/HitRiders.js';
import { exhaustive } from '../util/exhaustive.js';
import { riderSummary } from '../entities/Riders.js';
import { modsSummary } from '../entities/ChipMods.js';
import { formatModifier } from '../entities/Modifiers.js';
import { durationInRounds } from '../entities/SpellTiming.js';
import { spawnSummons } from './summonsWiring.js';
import { defendedDamage, findCombatant, logName } from './combatants.js';
import { applyToTarget, applyConditionToTarget } from './combatantWrites.js';
import { targetSummary } from './spellTargets.js';
import { spendRollRiders } from './riderSpend.js';
import { grantTempTo } from './tempHP.js';
import { slayCombatant } from './slay.js';
import { healBlocked, healBlockedLine } from '../entities/HealTarget.js';
import { cureTarget } from './healCurePrompt.js';
import { stabilizeCharacter } from './deathSaveRolls.js';
import { applyAttack } from './spellAttackOutcomes.js';
import { castSource, isFoe, leaveOngoing, timingFor } from './spellOutcomeChips.js';
import {
  paren,
  poolLine,
  saveDetail,
  saveOutcomeLine,
  splitLine,
  unaffectedLine,
} from '../combat/SaveLines.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').NamedCastTarget} NamedCastTarget */
/** @typedef {import('../types/cast.js').SaveOutcome<NamedCastTarget>} SaveOutcome */
/** @typedef {import('../types/cast.js').HealOutcome<NamedCastTarget>} HealOutcome */
/** @typedef {import('../types/cast.js').BuffOutcome<NamedCastTarget>} BuffOutcome */
/** @typedef {import('../types/cast.js').SummonsOutcome} SummonsOutcome */
/** @typedef {{ outcomes: import('../types/cast.js').CastOutcome[], targets: import('../entities/Casting.js').CastTarget[] }} CastResult */

/**
 * Writing a resolved cast into the world: hit points, condition chips, the
 * damage a chip leaves for later turns, summoned creatures, and the log lines
 * the GM reads afterward. `spellCastResolve.js` rolls the cast and hands the
 * outcome here. The outcomes of an attack spell are written in
 * `spellAttackOutcomes.js`.
 */

/**
 * Apply and log a resolved cast's outcomes: attack hits and misses, save
 * results with full, half, or no damage, and healing. Each target gets its
 * own log line, so a multi-target cast is auditable roll by roll. The toast
 * carries the summary. Damage and healing route to the same HP models the
 * weapon path uses.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {CastResult} result
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
    applyAttack(app, spell, result, casterId);
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'save') {
    applySave(app, spell, result, casterId);
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'heal') {
    const revives = spell.effect.revives === true;
    const stabilizes = spell.effect.stabilizes === true;
    // A spell with no healing dice (Lesser Restoration) only ends conditions,
    // so it logs no heal line.
    const heals = spell.effect.healing.length > 0;
    // Each target's pick waits for the one before it, so two dialogs never
    // open at once. The first target's cure runs at once, and it writes
    // before this function returns unless it has to ask.
    let cures = /** @type {Promise<void> | null} */ (null);
    for (const o of /** @type {HealOutcome[]} */ (result.outcomes)) {
      // A heal skips a dead target, and a spell that raises the dead skips a
      // living one. The log names the reason in place of the heal line. A
      // target of a type the heal skips (undead, construct) is passed over.
      if (o.unaffectedBy) {
        app.actions.logEvent(
          'combat',
          `${spell.name} has no effect on ${logName(app, o.target)} (${o.unaffectedBy}).`,
        );
        continue;
      }
      const found = findCombatant(app, o.target.id);
      const blocked = found ? healBlocked(found.kind, found.entity, revives, stabilizes) : null;
      if (blocked) {
        app.actions.logEvent(
          'combat',
          healBlockedLine(spell.name, logName(app, o.target), blocked),
        );
        continue;
      }
      // A spell that stabilizes heals nothing, so it skips the heal line.
      if (stabilizes) {
        stabilizeCharacter(app, o.target.id);
        continue;
      }
      // A heal with no dice writes no HP, so it cannot revive a dying target.
      if (heals) {
        const disciple = o.healBonus ? `, Disciple of Life +${o.healBonus}` : '';
        app.actions.logEvent(
          'combat',
          `${spell.name} heals ${logName(app, o.target)} for ${o.healing.total} HP${disciple}.`,
        );
        applyToTarget(app, o.target.id, o.healing.total, true, { revives });
      }
      const id = o.target.id;
      cures = cures ? cures.then(() => cureTarget(app, spell, id)) : cureTarget(app, spell, id);
    }
    app.toasts.show(`${spell.name} ${stabilizes ? 'on' : 'heals'} ${summary}.`);
    return;
  }
  if (kind === 'buff') {
    // A buff rolls nothing, so the whole cast is the chip it leaves. The chip
    // carries the same source a failed save writes, which is what lets
    // `endSpellEffects` sweep it when the caster stops concentrating. A buff
    // that names a turn boundary (Shield) ends there instead of at the end
    // of the spell's duration.
    const rounds = durationInRounds(spell.duration);
    const until = spell.effect.until;
    for (const o of /** @type {BuffOutcome[]} */ (result.outcomes)) {
      const timing = until ? timingFor(app, until, casterId, o.target.id) : { rounds };
      const imposed = applyConditionToTarget(
        app,
        o.target.id,
        o.condition,
        timing.rounds,
        castSource(app, spell, casterId),
        o.rider,
        {
          ...(timing.expires ? { expires: timing.expires } : {}),
          ...(o.mods ? { mods: o.mods } : {}),
          ...(o.hit ? { hit: o.hit } : {}),
        },
      );
      const changes = [
        o.rider ? riderSummary(o.rider) : '',
        modsSummary(o.mods ?? undefined),
        hitRiderSummary(o.hit),
      ].filter(Boolean);
      const adds = changes.length > 0 ? `: ${changes.join(', ')}` : '';
      app.actions.logEvent(
        'combat',
        `${logName(app, o.target)} gains ${o.condition}${adds}${imposed ? '' : ' (untracked)'}.`,
      );
      // The chip is written first, so the temporary HP name a chip that is there.
      if (o.tempHP) {
        grantTempTo(app, o.target.id, o.tempHP.total, o.condition, { detail: o.tempHP.text });
      }
    }
    app.toasts.show(`${spell.name} on ${summary}.`);
    return;
  }
  if (kind === 'summons') {
    // The one outcome names the template and the count. The creatures land on
    // the tile of the party, which is the only place a cast can reach without
    // map distance.
    for (const o of /** @type {SummonsOutcome[]} */ (result.outcomes)) {
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
  // A utility spell changes nothing that the app tracks. Any other kind that
  // reaches this line has no branch above, which fails the typecheck.
  if (kind !== 'utility') exhaustive(kind, undefined);
  // The log line names the rules text, so the GM can apply it without
  // opening the spell card.
  app.actions.logEvent('combat', `${spell.name} has no automatic effect: ${spell.description}`);
  app.toasts.show(`${spell.name} cast. Apply its effect at the table.`);
}

/**
 * Apply and log a save spell's outcomes.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {CastResult} result
 * @param {string} casterId
 */
function applySave(app, spell, result, casterId) {
  // A failed save's condition rides for as long as the spell lasts. The
  // structured duration gives this length in rounds. An open-ended
  // duration leaves the chip for the GM to clear. A spell that names a turn
  // boundary ends the chip there instead.
  const rounds = durationInRounds(spell.duration);
  const effect = /** @type {import('../types/spell.js').SpellSaveEffect} */ (spell.effect);
  const ability = effect.saveAbility;
  const outcomes = /** @type {SaveOutcome[]} */ (result.outcomes);
  // An HP pool is one roll for the whole cast, so the log states it once,
  // ahead of the targets it reached.
  const pool = outcomes[0]?.pool;
  if (pool) {
    app.actions.logEvent('combat', ...poolLine(spell.name, pool));
  }
  // An HP pool and an HP limit each read the target's HP, so the lines they
  // give reasons in are GM-only.
  const hpRule = !!pool || effect.hpLimit !== undefined;
  for (const o of outcomes) {
    if (o.unaffectedBy !== undefined) {
      app.actions.logEvent(
        'combat',
        ...unaffectedLine(logName(app, o.target), o.unaffectedBy, hpRule),
      );
      continue;
    }
    const verdict = o.saved ? 'saves' : 'fails';
    // The chip records the cast that wrote it. This lets the app end the
    // effect when the caster stops holding the spell, and lets a repeated
    // save roll against it. The app uses the bonus stamped here only for a
    // target whose own save it cannot read. It re-derives a character's
    // bonus at retry time.
    const timing = effect.until ? timingFor(app, effect.until, casterId, o.target.id) : null;
    const imposed = o.condition
      ? applyConditionToTarget(
          app,
          o.target.id,
          o.condition,
          timing ? timing.rounds : rounds,
          {
            ...castSource(app, spell, casterId),
            saveAbility: ability,
            saveDC: o.dc,
            saveBonus: o.target.saveBonus ?? 0,
            ...(effect.saveEnds ? { saveEnds: true } : {}),
            ...(effect.endsOnDamage ? { endsOnDamage: true } : {}),
          },
          o.conditionRider,
          {
            ...(timing?.expires ? { expires: timing.expires } : {}),
            ...(o.ongoing ? { ongoing: { damage: o.ongoing } } : {}),
            ...(effect.mods ? { mods: effect.mods } : {}),
          },
        )
      : false;
    const cond = o.condition ? `, ${o.condition}${imposed ? '' : ' (untracked)'}` : '';
    // The log names the bonus alongside the roll, the same way an attack
    // log names the ability and proficiency behind its number. A rider the
    // target already held changed the roll, so the line states it. A chip
    // that fails the save outright threw no die, so the line names the chip
    // where the roll would have gone. A spell that rolls no save names the HP
    // rule that reached the target, and so does an HP limit when no chip
    // failed the save first.
    const detail = saveDetail({
      bonus: `${ability} ${formatModifier(o.target.saveBonus ?? 0)}`,
      ability,
      rode: o.rider ? `, ${o.rider.note}` : '',
      total: o.save?.total,
      failedBy: o.autoFailedBy,
      hpRule: hpRule && (o.noRoll || !o.target.autoFailSave),
      secretBonus: isFoe(app, o.target.id),
    });
    // A save that negates the damage leaves nothing for the defenses to
    // change. Otherwise they apply per type, after the halving of a save.
    const taken =
      o.taken > 0
        ? defendedDamage(app, o.target.id, o.damage.byType, { halve: o.saved || !!o.evaded })
        : { total: 0, notes: [] };
    const defended = taken.notes.length > 0 ? ` (${taken.notes.join(', ')})` : '';
    // A spell that rolls no save states the HP rule that reached the target
    // instead of a verdict, and names damage only when it deals some.
    // A type that takes the maximum damage says so, because its number is
    // not the rolled one.
    const top = o.maxDamage ? ' (maximum dice)' : '';
    // The line names each damage type, the same way a weapon hit does.
    /** @type {import('../dice/DiceRoller.js').DamageGroup[]} */
    const groups = o.damage?.byType ?? [];
    const types = [...new Set(groups.map((g) => g.damageType).filter(Boolean))];
    const typed = types.length > 0 ? ` ${types.join(' and ')}` : '';
    const evaded = o.evaded ? ', Evasion' : '';
    const takes = `takes ${taken.total}${typed} damage${top}${evaded}${defended}`;
    /** @param {string} text */
    const line = (text) =>
      o.noRoll
        ? `${logName(app, o.target)} is affected${paren(text)}${o.damage.total > 0 ? `, ${takes}` : ''}${cond}.`
        : saveOutcomeLine({
            name: logName(app, o.target),
            verdict,
            dc: o.dc,
            detail: text,
            takes,
            damages: groups.length > 0 || taken.total > 0,
            cond,
            saved: o.saved,
          });
    app.actions.logEvent('combat', ...splitLine(line(detail.gm), line(detail.player)));
    applyToTarget(app, o.target.id, taken.total, false);
    if (effect.kills && !o.saved) slayCombatant(app, o.target.id);
    spendRollRiders(app, o.target.id, o.rider);
    // Later-turn damage with no condition to ride gets a chip of its own.
    if (o.ongoing && !o.condition) {
      leaveOngoing(app, spell, casterId, o.target.id, o.ongoing, effect.ongoing?.until);
    }
  }
}
