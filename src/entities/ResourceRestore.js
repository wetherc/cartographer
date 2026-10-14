/**
 * The one heal path for a character's resource pools. It lives apart from
 * Character.js so that HitDice.js can heal through it, because Character.js
 * imports HitDice.js and the reverse import would form a cycle.
 */
import { HP_RESOURCE_ID } from './PoolIds.js';
import { restore as restorePool } from './Resource.js';
import { updateById } from './Roster.js';
import { clearDying, isDead } from './DeathSaves.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Put points back into one pool.
 *
 * Healing the HP pool above 0 also ends a death-save tracker, and takes the
 * Unconscious chip with it. The rule lives here because this is the one
 * function every heal goes through: the combat screen's heal control, the
 * sheet's HP stepper, a healing spell, and a rest. Any of them can be the one
 * that brings a character back, and a character standing at 5 HP must not
 * still read as dying.
 *
 * A dead character (three failed death saves) regains no HP, so the HP pool
 * and the tracker stay as they are. Only a spell that raises the dead brings
 * the character back, and it clears the tracker first (see
 * `CharacterHit.healCharacter`).
 * @param {Character} character
 * @param {string} resourceId
 * @param {number} amount
 * @returns {Character}
 */
export function restoreResource(character, resourceId, amount) {
  if (resourceId === HP_RESOURCE_ID && isDead(character)) return character;
  const next = {
    ...character,
    resources: updateById(character.resources, resourceId, (r) => restorePool(r, amount)),
  };
  if (resourceId !== HP_RESOURCE_ID || !character.deathSaves) return next;
  return (next.resources.find((r) => r.id === HP_RESOURCE_ID)?.current ?? 0) > 0
    ? clearDying(next)
    : next;
}
