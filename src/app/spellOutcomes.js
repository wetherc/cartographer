import { hitRiderSummary } from '../entities/HitRiders.js';
import { riderSummary } from '../entities/Riders.js';
import { modsSummary } from '../entities/ChipMods.js';
import { formatModifier } from '../entities/Modifiers.js';
import { durationInRounds } from '../entities/SpellTiming.js';
import { defenseNote } from '../entities/DamageDefenses.js';
import { chipTiming } from '../entities/TurnEffects.js';
import { currentParticipant } from '../combat/Initiative.js';
import { spawnSummons } from './summons.js';
import { defendedDamage, findCombatant, logName } from './combatants.js';
import { applyToTarget, applyConditionToTarget } from './combatantWrites.js';
import { targetSummary } from './spellTargets.js';
import { spendRollRiders } from './riderSpend.js';
import { grantTempTo } from './tempHP.js';
import { slayCombatant } from './slay.js';
import { healBlocked, healBlockedLine } from '../entities/HealTarget.js';
import { cureTarget } from './healCure.js';
import { stabilizeCharacter } from './deathSaves.js';
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
/** @typedef {import('../types/spell.js').ChipUntil} ChipUntil */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */
/** @typedef {{ outcomes: object[], targets: import('../entities/Casting.js').CastTarget[] }} CastResult */

/**
 * Writing a resolved cast into the world: hit points, condition chips, the
 * damage a chip leaves for later turns, summoned creatures, and the log lines
 * the GM reads afterward. `spellCastResolve.js` rolls the cast and hands the
 * outcome here.
 */

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
 * The source that a cast stamps on each chip it writes. It names the caster
 * as well as its id, so the tooltip of a chip can tell two casts of one
 * spell apart.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {string} casterId
 * @returns {import('../types/entities.js').ConditionSource}
 */
function castSource(app, spell, casterId) {
  const casterName = findCombatant(app, casterId)?.label;
  return {
    spellId: spell.id,
    spellName: spell.name,
    casterId,
    ...(casterName ? { casterName } : {}),
  };
}

/**
 * The timing of a chip that ends at a turn boundary, read against the
 * running fight (see `TurnEffects.chipTiming`).
 * @param {AppContext} app
 * @param {ChipUntil} until
 * @param {string} casterId
 * @param {string} targetId
 * @returns {ReturnType<typeof chipTiming>}
 */
export function timingFor(app, until, casterId, targetId) {
  const combat = app.state.combat;
  return chipTiming(until, {
    casterId,
    targetId,
    actingId: combat ? (currentParticipant(combat)?.id ?? null) : null,
    inOrder: (id) => !!combat?.order.some((p) => p.id === id),
  });
}

/**
 * Leave a spell's later-turn damage on a target, on a chip named after the
 * spell. The chip ends at the boundary the spell names, which is the end of
 * the target's next turn unless it names another.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {string} casterId
 * @param {string} targetId
 * @param {DamagePart[]} damage the scaled dice
 * @param {ChipUntil | undefined} until
 */
function leaveOngoing(app, spell, casterId, targetId, damage, until) {
  const timing = timingFor(app, until ?? 'target-end', casterId, targetId);
  applyConditionToTarget(
    app,
    targetId,
    spell.name,
    timing.rounds,
    castSource(app, spell, casterId),
    null,
    { ...(timing.expires ? { expires: timing.expires } : {}), ongoing: { damage } },
  );
}

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
    for (const o of /** @type {any[]} */ (result.outcomes)) {
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
    for (const o of /** @type {any[]} */ (result.outcomes)) {
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
        modsSummary(o.mods),
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

/**
 * Apply and log an attack spell's outcomes.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {CastResult} result
 * @param {string} casterId
 */
function applyAttack(app, spell, result, casterId) {
  const effect = /** @type {import('../types/spell.js').SpellAttackEffect} */ (spell.effect);
  // A one-roll rider on the caster is used up by the first attack it joins.
  const spent = /** @type {any[]} */ (result.outcomes).flatMap((o) =>
    [o.rider, ...(o.shots ?? []).map((/** @type {any} */ s) => s.rider)].flatMap(
      (r) => r?.spent ?? [],
    ),
  );
  spendRollRiders(app, casterId, { spent });
  // The damage the hits dealt after defenses, for a spell that drains it.
  let dealt = 0;
  for (const o of /** @type {any[]} */ (result.outcomes)) {
    // A multi-projectile cast logs the tally, not one line per ray. The
    // rolls are already aggregated per creature, and the damage carries
    // every ray's dice.
    if (o.shots) {
      const tally = `${o.hits} of ${o.fired} hit ${logName(app, o.target)}`;
      // Each ray rolls the caster's riders again, so the line names every
      // ray's dice. The tally itself prints no to-hit numbers, and this is
      // the only place the rays' own rolls are recorded.
      const rode = riderNote(o.shots.map((/** @type {any} */ s) => s.rider));
      // Each ray is its own hit, so the defenses apply to each one.
      const hits = /** @type {any[]} */ (o.shots)
        .filter((s) => s.damage)
        .map((s) => ({ crit: s.crit, ...defendedDamage(app, o.target.id, s.damage.byType) }));
      const defended = defenseNote(
        hits.flatMap((h) => h.notes),
        hits.reduce((n, h) => n + h.total, 0),
      );
      app.actions.logEvent(
        'combat',
        o.hits > 0
          ? `${spell.name}: ${tally}${rode} for ${o.damage.detail}${defended}.`
          : `${spell.name}: ${tally}${rode} (AC ${o.ac}).`,
      );
      // Each ray that lands is its own hit, so a concentrating target
      // saves once per ray and a dying one takes a failure per ray.
      for (const h of hits) applyToTarget(app, o.target.id, h.total, false, { crit: h.crit });
      dealt += hits.reduce((n, h) => n + h.total, 0);
      if (o.ongoing) {
        leaveOngoing(app, spell, casterId, o.target.id, o.ongoing, effect.ongoing?.until);
      }
      if (o.onHit) applyOnHit(app, spell, o, casterId);
      continue;
    }
    const verb = o.crit ? 'critically hits' : o.hit ? 'hits' : 'misses';
    // A rider on the caster changed the number, so both outcomes say so.
    const rode = riderNote([o.rider]);
    if (!o.hit) {
      // A spell that splashes on a miss still deals half its damage.
      const splash = o.halved
        ? defendedDamage(app, o.target.id, o.damage.byType, { halve: true })
        : null;
      const splashed = splash
        ? `, splashing for ${splash.total}${splash.notes.length ? ` (${splash.notes.join(', ')})` : ''}`
        : '';
      app.actions.logEvent(
        'combat',
        `${spell.name}: ${o.attack.total} to hit vs AC ${o.ac}${rode}, ${verb} ${logName(app, o.target)}${splashed}.`,
      );
      if (splash) applyToTarget(app, o.target.id, splash.total, false);
      dealt += splash?.total ?? 0;
      continue;
    }
    const taken = defendedDamage(app, o.target.id, o.damage?.byType ?? []);
    app.actions.logEvent(
      'combat',
      `${spell.name} ${verb} ${logName(app, o.target)}${rode} for ${o.damage?.detail || '0 damage'}${o.hitNote ?? ''}` +
        `${defenseNote(taken.notes, taken.total)}.`,
    );
    applyToTarget(app, o.target.id, taken.total, false, { crit: o.crit });
    dealt += taken.total;
    if (o.ongoing) {
      leaveOngoing(app, spell, casterId, o.target.id, o.ongoing, effect.ongoing?.until);
    }
    if (o.onHit) applyOnHit(app, spell, o, casterId);
  }
  if (effect.drain) drainTo(app, spell, casterId, effect.drain, dealt);
}

/**
 * Apply and log what one hit brings besides its damage: a save against the
 * caster's DC, and the condition on a failure, or the condition alone when
 * the hit brings no save. The chip names the cast, so it goes when the
 * caster stops holding the spell, and it ends at the turn boundary the spell
 * names or after the spell's duration.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {any} o the target's attack outcome, with its `onHit` result
 * @param {string} casterId
 */
function applyOnHit(app, spell, o, casterId) {
  const effect = /** @type {import('../types/spell.js').SpellAttackEffect} */ (spell.effect);
  const onHit = /** @type {import('../types/spell.js').SpellOnHit} */ (effect.onHit);
  const hit = o.onHit;
  const name = logName(app, o.target);
  const timing = onHit.until ? timingFor(app, onHit.until, casterId, o.target.id) : null;
  const imposed = hit.condition
    ? applyConditionToTarget(
        app,
        o.target.id,
        hit.condition,
        timing ? timing.rounds : durationInRounds(spell.duration),
        castSource(app, spell, casterId),
        null,
        {
          ...(timing?.expires ? { expires: timing.expires } : {}),
          ...(onHit.mods ? { mods: onHit.mods } : {}),
        },
      )
    : false;
  const cond = hit.condition ? `${hit.condition}${imposed ? '' : ' (untracked)'}` : '';
  applyTypedChip(app, spell, onHit, o, casterId);
  if (!onHit.saveAbility) {
    app.actions.logEvent('combat', `${name} gains ${cond}.`);
    return;
  }
  const detail = saveDetail({
    bonus: `${onHit.saveAbility} ${formatModifier(o.target.saveBonus ?? 0)}`,
    ability: onHit.saveAbility,
    rode: hit.rider ? `, ${hit.rider.note}` : '',
    total: hit.save?.total,
    failedBy: hit.autoFailedBy,
    hpRule: false,
    secretBonus: isFoe(app, o.target.id),
  });
  /** @param {string} text */
  const line = (text) =>
    hit.saved
      ? `${name} saves DC ${hit.dc}${paren(text)}.`
      : `${name} fails DC ${hit.dc}${paren(text)}, ${cond}.`;
  app.actions.logEvent('combat', ...splitLine(line(detail.gm), line(detail.player)));
  spendRollRiders(app, o.target.id, hit.rider);
}

/**
 * Give the caster of a draining spell its share of the damage the hits
 * dealt, after the targets' defenses. Half rounds down.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {string} casterId
 * @param {import('../types/spell.js').SpellDrain} drain
 * @param {number} dealt
 */
function drainTo(app, spell, casterId, drain, dealt) {
  const regained = drain === 'half' ? Math.floor(dealt / 2) : dealt;
  // A caster that left the campaign has no hit points to regain.
  const found = findCombatant(app, casterId);
  if (!found || regained <= 0) return;
  app.actions.logEvent('combat', `${found.label} regains ${regained} HP from ${spell.name}.`);
  applyToTarget(app, casterId, regained, true);
}

/**
 * Whether a target is a creature, whose save bonus a Player tab does not see.
 * A party character's bonuses are on its sheet.
 * @param {AppContext} app
 * @param {string} id
 * @returns {boolean}
 */
function isFoe(app, id) {
  return findCombatant(app, id)?.kind === 'creature';
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
  const outcomes = /** @type {any[]} */ (result.outcomes);
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
    if (o.unaffectedBy) {
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
        ? defendedDamage(app, o.target.id, o.damage.byType, { halve: o.saved })
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
    const takes = `takes ${taken.total}${typed} damage${top}${defended}`;
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

/**
 * Put the typed on-hit chip of a spell on a target of one of its types, such
 * as the chip that Chill Touch leaves on an undead target. The chip has no
 * save, and it ends at its own turn boundary.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {import('../types/spell.js').SpellOnHit} onHit
 * @param {any} o the target's attack outcome
 * @param {string} casterId
 */
function applyTypedChip(app, spell, onHit, o, casterId) {
  const typed = onHit.typed;
  if (!typed || !typed.types.includes(o.target.creatureType)) return;
  const timing = typed.until ? timingFor(app, typed.until, casterId, o.target.id) : null;
  const imposed = applyConditionToTarget(
    app,
    o.target.id,
    typed.condition,
    timing ? timing.rounds : durationInRounds(spell.duration),
    castSource(app, spell, casterId),
    null,
    {
      ...(timing?.expires ? { expires: timing.expires } : {}),
      ...(typed.mods ? { mods: typed.mods } : {}),
    },
  );
  if (imposed)
    app.actions.logEvent('combat', `${logName(app, o.target)} gains ${typed.condition}.`);
}
