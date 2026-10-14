import { durationInRounds } from '../entities/SpellTiming.js';
import { opensRepeat } from '../entities/SpellRepeat.js';
import { blastPush } from '../entities/Invocations.js';
import { applyConditionToTarget } from './combatantWrites.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/cast.js').CastOutcome} CastOutcome */
/** @typedef {import('../types/cast.js').AttackOutcome<import('../types/cast.js').NamedCastTarget>} AttackOutcome */

/*
 * The steps that run after a cast's outcomes land, for the spells that leave
 * something for a later turn or for the GM. `resolveCast` in
 * `spellCastResolve.js` calls both.
 */

/**
 * Give the caster the chip that lets it repeat a spell on a later turn, when
 * the spell has a repeat and the first cast opened one. A repeat that stays
 * on the creatures it hit records their ids and opens only on a hit.
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {{ slotLevel: number, outcomes: CastOutcome[], targets: { id?: string }[] }} result
 * @param {string} casterId
 */
export function openRepeat(app, spell, result, casterId) {
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
export function notePush(app, spell, caster, result) {
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
