import { formatModifier } from '../entities/Modifiers.js';
import { durationInRounds } from '../entities/SpellTiming.js';
import { defenseNote } from '../entities/DamageDefenses.js';
import { defendedDamage, findCombatant, logName } from './combatants.js';
import { applyToTarget, applyConditionToTarget } from './combatantWrites.js';
import { spendRollRiders } from './riderSpend.js';
import { paren, saveDetail, splitLine } from '../combat/SaveLines.js';
import { castSource, isFoe, leaveOngoing, timingFor } from './spellOutcomeChips.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').NamedCastTarget} NamedCastTarget */
/** @typedef {import('../types/cast.js').AttackOutcome<NamedCastTarget>} AttackOutcome */
/** @typedef {{ outcomes: import('../types/cast.js').CastOutcome[], targets: import('../entities/Casting.js').CastTarget[] }} CastResult */

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
 * Apply and log an attack spell's outcomes.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {CastResult} result
 * @param {string} casterId
 */
export function applyAttack(app, spell, result, casterId) {
  const effect = /** @type {import('../types/spell.js').SpellAttackEffect} */ (spell.effect);
  // A one-roll rider on the caster is used up by the first attack it joins.
  const spent = /** @type {AttackOutcome[]} */ (result.outcomes).flatMap((o) =>
    [o.shots ? null : o.rider, ...(o.shots ?? []).map((s) => s.rider)].flatMap(
      (r) => r?.spent ?? [],
    ),
  );
  spendRollRiders(app, casterId, { spent });
  // The damage the hits dealt after defenses, for a spell that drains it.
  let dealt = 0;
  for (const o of /** @type {AttackOutcome[]} */ (result.outcomes)) {
    // A multi-projectile cast logs the tally, not one line per ray. The
    // rolls are already aggregated per creature, and the damage carries
    // every ray's dice.
    if (o.shots) {
      const tally = `${o.hits} of ${o.fired} hit ${logName(app, o.target)}`;
      // Each ray rolls the caster's riders again, so the line names every
      // ray's dice. The tally itself prints no to-hit numbers, and this is
      // the only place the rays' own rolls are recorded.
      const rode = riderNote(o.shots.map((s) => s.rider));
      // Each ray is its own hit, so the defenses apply to each one.
      const hits = o.shots.flatMap((s) =>
        s.damage ? [{ crit: s.crit, ...defendedDamage(app, o.target.id, s.damage.byType) }] : [],
      );
      const defended = defenseNote(
        hits.flatMap((h) => h.notes),
        hits.reduce((n, h) => n + h.total, 0),
      );
      app.actions.logEvent(
        'combat',
        o.hits > 0
          ? `${spell.name}: ${tally}${rode} for ${o.damage?.detail}${defended}.`
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
      const splash =
        o.halved && o.damage
          ? defendedDamage(app, o.target.id, o.damage.byType, { halve: true })
          : null;
      const splashed = splash
        ? `, splashing for ${splash.total}${splash.notes.length ? ` (${splash.notes.join(', ')})` : ''}`
        : '';
      app.actions.logEvent(
        'combat',
        `${spell.name}: ${o.attack?.total} to hit vs AC ${o.ac}${rode}, ${verb} ${logName(app, o.target)}${splashed}.`,
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
