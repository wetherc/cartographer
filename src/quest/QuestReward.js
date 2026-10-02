/**
 * Pure helpers for the reward of a quest: the gold pieces and experience
 * points that completing it pays, to each character or split as a total.
 */

import { partyAward } from '../combat/FightEnd.js';
import { isDead } from '../entities/DeathSaves.js';
import { addGold, addXP } from '../entities/Character.js';

/** @typedef {import('../types/quest.js').QuestReward} QuestReward */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * A whole, non-negative count from a dialog value or a save, or 0.
 * @param {unknown} value
 */
function count(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * A reward from a save or a dialog, or undefined when it pays nothing. A
 * `per` other than "total" reads as "each".
 * @param {unknown} value
 * @returns {QuestReward | undefined}
 */
export function readReward(value) {
  if (!value || typeof value !== 'object') return undefined;
  const { gp, xp, per } = /** @type {Record<string, unknown>} */ (value);
  const reward = { gp: count(gp), xp: count(xp), per: per === 'total' ? 'total' : 'each' };
  return reward.gp > 0 || reward.xp > 0 ? /** @type {QuestReward} */ (reward) : undefined;
}

/**
 * Pay a reward to every living character. In "each" mode every living
 * character gets the full gp and XP. In "total" mode each amount is split
 * evenly among them, rounded down. A dead character gets nothing.
 * @param {Character[]} characters
 * @param {QuestReward} reward
 * @returns {{ characters: Character[], gp: number, xp: number, count: number }}
 *   the paid roster, what each living character got, and how many got it
 */
export function payReward(characters, reward) {
  const living = characters.filter((c) => !isDead(c)).length;
  const gp = living > 0 ? partyAward(reward.per, reward.gp, living).each : 0;
  const xp = living > 0 ? partyAward(reward.per, reward.xp, living).each : 0;
  if (gp === 0 && xp === 0) return { characters, gp, xp, count: living };
  const paid = characters.map((c) => {
    if (isDead(c)) return c;
    const rich = gp > 0 ? addGold(c, gp) : c;
    return xp > 0 ? addXP(rich, xp) : rich;
  });
  return { characters: paid, gp, xp, count: living };
}

/**
 * The travelogue line for a paid reward, such as "The party receives 50 gp
 * and 300 XP each.", or null when nobody got anything.
 * @param {number} gp
 * @param {number} xp
 */
export function rewardLine(gp, xp) {
  const parts = [gp > 0 ? `${gp} gp` : '', xp > 0 ? `${xp} XP` : ''].filter(Boolean);
  return parts.length ? `The party receives ${parts.join(' and ')} each.` : null;
}
