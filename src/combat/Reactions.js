/**
 * Pure derivations for what a combatant can do with its reaction between its
 * own turns: an opportunity attack, or a spell whose casting time is a
 * reaction.
 *
 * Nothing here detects a trigger. 5e triggers a reaction off a fact this app
 * does not track, such as a creature leaving the reach of another. The GM sees
 * the trigger at the table and presses the control, and these functions only
 * say which controls are worth offering.
 */

import { weaponKind } from '../entities/Weapons.js';
import { castingCost, parseCastingTime } from '../entities/SpellTiming.js';

/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').CreatureWeapon} CreatureWeapon */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/combat.js').Participant} Participant */

/**
 * The weapons an opportunity attack can swing: the melee ones. A bow shoots at
 * range and reaches nobody who walks past, so it stays out. A thrown melee
 * weapon stays in, because the swing itself is the melee one.
 * @param {(InventoryItem | CreatureWeapon)[]} weapons
 * @returns {(InventoryItem | CreatureWeapon)[]}
 */
export function opportunityWeapons(weapons) {
  return weapons.filter((weapon) => weaponKind(weapon) === 'melee');
}

/**
 * The spells with a reaction casting time, such as Shield or Counterspell.
 * A spell with no stated casting time reads as an action, so it is not one.
 * @param {Spell[]} spells
 * @returns {Spell[]}
 */
export function reactionSpells(spells) {
  return spells.filter(
    (spell) => spell.castingTime && castingCost(parseCastingTime(spell.castingTime)) === 'reaction',
  );
}
