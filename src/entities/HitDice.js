import { createResource, spend, restore } from './Resource.js';
import { isSlotPool } from './SpellSlots.js';
import { getClass } from './Classes.js';
import { primaryClass } from './Multiclass.js';
import { abilityModifier } from './Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * Hit dice are a regular resource pool under a reserved id (like HP and the
 * spell-slot pools), sized to the character's level — one die per level. The
 * die's size isn't stored on the pool; it derives from the class at spend
 * time, so a class change never strands stale data. Short rests spend them
 * for healing; a long rest restores half the total (see Character.js's
 * restAll).
 */
export const HIT_DICE_RESOURCE_ID = 'hit-dice';

/**
 * The character's primary class's hit-die size (d6-d12), or null for a
 * classless character.
 * @param {Character} character
 * @returns {number | null}
 */
export function hitDieFor(character) {
  return getClass(primaryClass(character)?.classId)?.hitDie ?? null;
}

/**
 * HP gained per level past the first under the 5e average rule: half the hit
 * die plus one, plus the CON modifier, never below 1.
 * @param {number} hitDie
 * @param {number} conModifier
 * @returns {number}
 */
export function hpGainPerLevel(hitDie, conModifier) {
  return Math.max(1, hitDie / 2 + 1 + conModifier);
}

/**
 * A character's per-level HP gain from their class and CON, or null for a
 * classless character (whose caller falls back to the generic growth).
 * @param {Character} character
 * @returns {number | null}
 */
export function levelHPGain(character) {
  const die = hitDieFor(character);
  if (die === null) return null;
  return hpGainPerLevel(die, conModifierOf(character));
}

/**
 * The class-derived maximum HP at the character's level: a full hit die plus
 * CON modifier at level 1 (at least 1), then the average-rule gain per level
 * after. Null for a classless character.
 * @param {Character} character
 * @returns {number | null}
 */
export function classMaxHP(character) {
  const die = hitDieFor(character);
  if (die === null) return null;
  const con = conModifierOf(character);
  const level = Math.max(1, Math.floor(character.level) || 1);
  return Math.max(1, die + con) + (level - 1) * hpGainPerLevel(die, con);
}

/**
 * @param {Character} character
 * @returns {ResourcePool | null} the character's hit-dice pool, if they have one
 */
export function getHitDice(character) {
  return character.resources.find((r) => r.id === HIT_DICE_RESOURCE_ID) ?? null;
}

/**
 * Give a character a full hit-dice pool sized to their level, replacing any
 * existing one. Ordered after HP and spell slots so the card reads
 * HP-then-slots-then-hit-dice-then-custom.
 * @param {Character} character
 * @returns {Character}
 */
export function withHitDice(character) {
  const pool = createResource(
    HIT_DICE_RESOURCE_ID,
    'Hit Dice',
    'custom',
    Math.max(1, Math.floor(character.level) || 1),
  );
  const rest = character.resources.filter((r) => r.id !== HIT_DICE_RESOURCE_ID);
  const head = rest.filter((r) => r.id === 'hp' || isSlotPool(r));
  const tail = rest.filter((r) => r.id !== 'hp' && !isSlotPool(r));
  return { ...character, resources: [...head, pool, ...tail] };
}

/**
 * Re-size the hit-dice pool to the character's (possibly new) level, keeping
 * what's spent: current grows by exactly the dice gained. A character without
 * a pool is returned unchanged, identity preserved.
 * @param {Character} character
 * @returns {Character}
 */
export function syncHitDiceToLevel(character) {
  const pool = getHitDice(character);
  if (!pool) return character;
  const max = Math.max(1, Math.floor(character.level) || 1);
  if (max === pool.max) return character;
  const gained = Math.max(0, max - pool.max);
  return {
    ...character,
    resources: character.resources.map((r) =>
      r.id === HIT_DICE_RESOURCE_ID ? { ...r, max, current: Math.min(max, r.current + gained) } : r,
    ),
  };
}

/**
 * Spend one hit die for healing (the short-rest mechanic): roll the class hit
 * die, add the CON modifier (a heal never negative), restore that much HP, and
 * mark the die spent. A character with no dice left, no pool, or no class is
 * returned unchanged with 0 healed. RNG injected for testability.
 * @param {Character} character
 * @param {() => number} [rng]
 * @returns {{ character: Character, healed: number, rolled: number }}
 */
export function spendHitDie(character, rng = Math.random) {
  const pool = getHitDice(character);
  const die = hitDieFor(character);
  if (!pool || pool.current < 1 || die === null) return { character, healed: 0, rolled: 0 };
  const rolled = 1 + Math.floor(rng() * die);
  const healed = Math.max(0, rolled + conModifierOf(character));
  const resources = character.resources.map((r) => {
    if (r.id === HIT_DICE_RESOURCE_ID) return spend(r, 1);
    if (r.id === 'hp') return restore(r, healed);
    return r;
  });
  return { character: { ...character, resources }, healed, rolled };
}

/** @param {Character} character @returns {number} */
function conModifierOf(character) {
  return abilityModifier(character.stats?.CON ?? 10);
}
