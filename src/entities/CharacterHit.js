import { HP_RESOURCE_ID, damageCharacter, getHP, restoreResource } from './Character.js';
import { dropToDying, isDead, killOutright, recordDamage } from './DeathSaves.js';
import { checkOnDamage, drop as dropConcentration } from './Concentration.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../dice/DiceRoller.js').RandomFn} RandomFn */

/**
 * One consequence of a hit or a heal on a party character, for the caller to
 * log. `downed` is a drop to 0 HP. `massive` is a death from one hit whose
 * damage past 0 HP is at least the HP maximum. `failures` is the automatic
 * death-save failure of a hit on a character already at 0 HP. `revived` is a
 * heal that ends the dying state. `fell` is concentration lost to a drop to
 * 0 HP. `concentration` is the CON save that damage calls for.
 * @typedef {(
 *   | { kind: 'downed' }
 *   | { kind: 'massive' }
 *   | { kind: 'failures', count: number, dead: boolean }
 *   | { kind: 'revived' }
 *   | { kind: 'fell', spellName: string }
 *   | { kind: 'concentration', spellName: string, kept: boolean, total: number, dc: number }
 * )} HitEvent
 */

/**
 * The character after a hit or a heal, what happened, and the id of the
 * spell the hit ended, which the caller sweeps off its targets once the
 * character is stored.
 * @typedef {{ character: Character, events: HitEvent[], ended: string | null }} HitResult
 */

/**
 * Damage a party character, and fold the death-save and concentration rules
 * into the same write. Every write path that damages a character uses this
 * function: a weapon hit, a spell, the combat screen, and the sheet's HP
 * stepper. A path that skips it leaves a character at 0 HP with no tracker,
 * and later hits then add no failures.
 *
 * - The hit that drops a character to 0 HP starts the tracker and puts the
 *   Unconscious chip on. That hit costs no failure itself.
 * - Damage left over past 0 HP that is at least the HP maximum kills
 *   outright, which is the 5e massive damage rule. It applies both to the hit
 *   that drops the character and to a hit on a character already at 0 HP.
 * - Any other hit on a character already at 0 HP is an automatic failure,
 *   and a critical hit counts as two. This also un-stabilizes a stable
 *   character.
 * - A drop to 0 HP ends concentration. Damage on a character still standing
 *   calls for the CON save to keep it.
 *
 * A character dead of exhaustion keeps its HP, so a hit can still push it to
 * 0. That hit starts nothing, because the character is already dead.
 * @param {Character} character
 * @param {number} amount
 * @param {{ crit?: boolean, rng?: RandomFn }} [opts]
 * @returns {HitResult}
 */
export function hitCharacter(character, amount, { crit = false, rng } = {}) {
  const hp = getHP(character);
  let next = damageCharacter(character, amount);
  if (!hp) return { character: next, events: [], ended: null };
  /** @type {HitEvent[]} */
  const events = [];
  const wasDown = hp.current <= 0;
  const downed = !wasDown && (getHP(next)?.current ?? 0) <= 0;
  const overflow = amount - (character.bonusHP ?? 0) - Math.max(0, hp.current);
  const alive = !isDead(next);
  if (alive && (downed || wasDown) && overflow >= hp.max) {
    next = killOutright(next);
    events.push({ kind: 'massive' });
  } else if (alive && downed) {
    next = dropToDying(next);
    events.push({ kind: 'downed' });
  } else if (wasDown && next.deathSaves) {
    const hit = recordDamage(next, { crit });
    next = hit.character;
    if (hit.failures > 0) events.push({ kind: 'failures', count: hit.failures, dead: hit.dead });
  }
  const held = next.concentration;
  if (!held) return { character: next, events, ended: null };
  if (downed || isDead(next)) {
    events.push({ kind: 'fell', spellName: held.spellName });
    return { character: dropConcentration(next), events, ended: held.spellId };
  }
  const check = checkOnDamage(next, amount, rng ? { rng } : {});
  if (!check.save) return { character: next, events, ended: null };
  events.push({
    kind: 'concentration',
    spellName: held.spellName,
    kept: !check.dropped,
    total: check.save.total,
    dc: check.save.dc,
  });
  return { character: check.character, events, ended: check.dropped ? held.spellId : null };
}

/**
 * Heal a party character. A heal above 0 HP ends the dying state, a dead
 * tracker included (see `restoreResource`), and the result says so.
 * @param {Character} character
 * @param {number} amount
 * @returns {HitResult}
 */
export function healCharacter(character, amount) {
  const next = restoreResource(character, HP_RESOURCE_ID, amount);
  /** @type {HitEvent[]} */
  const events = character.deathSaves && !next.deathSaves ? [{ kind: 'revived' }] : [];
  return { character: next, events, ended: null };
}
