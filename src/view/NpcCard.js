/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * Whether an NPC card shows its condition chips and exhaustion pips. It
 * shows them while the NPC is in the fight, and also while the NPC has a
 * condition or a level of exhaustion, so a mark set during a fight stays in
 * view after it.
 * @param {Creature} npc
 * @param {boolean} inFight
 * @returns {boolean}
 */
export function showsCombatBars(npc, inFight) {
  return inFight || (npc.conditions?.length ?? 0) > 0 || (npc.exhaustion ?? 0) > 0;
}
