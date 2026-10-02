import { isPactPool, slotLevelOf } from '../entities/SpellSlots.js';
import { formatCastingTime } from '../entities/SpellTiming.js';
import { capitalize } from '../util/text.js';

/**
 * The text of the spell cards in the Spellbook tab and of the slot count in
 * each level heading. This module is pure.
 */

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * One short line under a spell name: the school, the casting time without
 * its reaction trigger, and the range.
 * @param {Spell} spell
 * @returns {string}
 */
export function spellCardLine(spell) {
  const time = formatCastingTime(spell.castingTime).split(',')[0];
  return `${capitalize(spell.school)}, ${time}, ${spell.range}`;
}

/**
 * The free slots that can cast a spell of one level. Spell slots count at
 * their own level alone, as "2 of 3 slots". A pact slot casts every spell up
 * to its level, so pact slots count under that level and every lower one,
 * as "1 of 2 pact slots". A level with both reads "2 of 3 slots, 1 of 2 pact
 * slots". The text is empty for a cantrip and for a level with no slots.
 * @param {ResourcePool[]} pools the slot pools and the pact pool
 * @param {number} level
 * @returns {string}
 */
export function levelSlotText(pools, level) {
  if (level <= 0) return '';
  const slots = pools.filter((p) => !isPactPool(p) && slotLevelOf(p) === level);
  const pact = pools.filter((p) => isPactPool(p) && slotLevelOf(p) >= level);
  return [countText(slots, 'slot'), countText(pact, 'pact slot')].filter(Boolean).join(', ');
}

/**
 * @param {ResourcePool[]} pools
 * @param {string} noun
 * @returns {string} "free of max nouns", or empty when the pools have no slots
 */
function countText(pools, noun) {
  const max = pools.reduce((n, p) => n + p.max, 0);
  if (max === 0) return '';
  const free = pools.reduce((n, p) => n + p.current, 0);
  return `${free} of ${max} ${noun}${max === 1 ? '' : 's'}`;
}
