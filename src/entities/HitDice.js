import {
  createResource,
  spend,
  restore,
  adjustMax,
  growMax,
  spliceReservedPools,
} from './Resource.js';
import { HP_RESOURCE_ID, HIT_DICE_ID_PREFIX, LEGACY_HIT_DICE_ID } from './PoolIds.js';
import { updateById } from './Roster.js';
import { isCasterPool } from './SpellSlots.js';
import { getClass } from './Classes.js';
import { getClasses, primaryClass } from './Multiclass.js';
import { abilityModifier } from './Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * Hit dice are regular resource pools under reserved ids, like HP and the
 * spell-slot pools. Each pool holds one die size. For example, `hit-dice-d8`
 * holds a character's d8s, sized to the combined levels in d8 classes.
 *
 * A single-class character has one pool. A multiclass character has one pool
 * per distinct die size, with the primary class first. A short rest spends
 * hit dice for healing. A long rest restores half of each pool (see
 * Character.js's restAll). Older saves carried one generic `hit-dice` pool
 * with no die size. syncHitDice converts this pool and moves the spent count
 * into the primary class's pool.
 *
 * Both ids are declared in PoolIds.js with the other reserved pool ids. This
 * module re-exports them because hit-dice code is their natural import site.
 */
export { HIT_DICE_ID_PREFIX, LEGACY_HIT_DICE_ID } from './PoolIds.js';

/** @param {ResourcePool} pool @returns {boolean} */
export function isHitDicePool(pool) {
  return pool.id === LEGACY_HIT_DICE_ID || pool.id.startsWith(HIT_DICE_ID_PREFIX);
}

/** @param {number} die @returns {string} the pool id for one die size */
export function hitDicePoolId(die) {
  return `${HIT_DICE_ID_PREFIX}${die}`;
}

/**
 * The die size a hit-dice pool holds, or null for the legacy sizeless pool.
 * @param {ResourcePool} pool
 * @returns {number | null}
 */
export function hitDieOfPool(pool) {
  if (!pool.id.startsWith(HIT_DICE_ID_PREFIX)) return null;
  return Number(pool.id.slice(HIT_DICE_ID_PREFIX.length));
}

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
 * The hit dice the class list grants. One entry exists per distinct die size,
 * in class-list order with the primary class first. Each entry counts one die
 * per assigned class level. An unknown class contributes nothing. A pending,
 * unassigned level grants its die only after assignment. The result is empty
 * for a classless character.
 * @param {Character} character
 * @returns {{ die: number, count: number }[]}
 */
export function characterHitDice(character) {
  /** @type {{ die: number, count: number }[]} */
  const dice = [];
  for (const ref of getClasses(character)) {
    const die = getClass(ref.classId)?.hitDie;
    const count = Math.max(0, Math.floor(ref.level));
    if (die === undefined || count < 1) continue;
    const existing = dice.find((d) => d.die === die);
    if (existing) existing.count += count;
    else dice.push({ die, count });
  }
  return dice;
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
 * The class-derived maximum HP across the class list. The first class grants
 * a full hit die plus the CON modifier at its first level, with a minimum of
 * 1. Every other assigned level adds that class's average-rule gain. This
 * includes the first class's remaining levels and every other class's levels
 * in full. A pending, unassigned level contributes nothing. The result is
 * null for a classless character or one whose classes are all unknown.
 * @param {Character} character
 * @returns {number | null}
 */
export function classMaxHP(character) {
  const con = conModifierOf(character);
  let total = null;
  for (const ref of getClasses(character)) {
    const die = getClass(ref.classId)?.hitDie;
    const level = Math.max(1, Math.floor(ref.level) || 1);
    if (die === undefined) continue;
    if (total === null) {
      total = Math.max(1, die + con) + (level - 1) * hpGainPerLevel(die, con);
    } else {
      total += level * hpGainPerLevel(die, con);
    }
  }
  return total;
}

/**
 * Move the HP pool's maximum to the value that the class list, level, and CON
 * now imply. The function carries current HP by the same delta, so a
 * level-up or a retroactive CON increase grants the points instead of only
 * raising the ceiling. Current HP stays within the range 0 to max. A
 * character already at the derived maximum returns unchanged, with identity
 * preserved.
 *
 * Three cases opt out. A character with no derivable class HP, because the
 * character is classless or every class is unknown, keeps whatever pool it
 * has, since there is nothing to derive from. A character with no HP pool at
 * all also keeps its state, because the absence of a pool means no HP
 * tracking. A character that carries `hpOverride`, the flag that
 * `Character.setMaxHP` sets, also keeps its state: the GM who types a maximum
 * by hand owns it from then on, and nothing here overwrites it.
 *
 * Call this function through `Progression.derive` instead of calling it
 * directly. This function is exported for that facade and for tests.
 * @param {Character} character
 * @returns {Character}
 */
export function reconcileMaxHP(character) {
  if (character.hpOverride) return character;
  const max = classMaxHP(character);
  if (max === null) return character;
  const pool = character.resources.find((r) => r.id === HP_RESOURCE_ID);
  if (!pool || pool.max === max) return character;
  return {
    ...character,
    resources: updateById(character.resources, HP_RESOURCE_ID, (r) => adjustMax(r, max)),
  };
}

/**
 * @param {Character} character
 * @returns {ResourcePool[]} the character's hit-dice pools, in resource order
 */
export function getHitDicePools(character) {
  return character.resources.filter(isHitDicePool);
}

/**
 * Build one hit-dice pool. Both writers below need the same id and the same
 * label for a die size, so the shape lives here once.
 * @param {number} die
 * @param {number} count
 * @returns {ResourcePool}
 */
function hitDicePool(die, count) {
  return createResource(hitDicePoolId(die), `Hit Dice (d${die})`, 'custom', count);
}

/**
 * Give a character full hit-dice pools derived from their class list,
 * replacing any existing ones (including a legacy sizeless pool). Ordered
 * after HP and spell slots so the card reads
 * HP-then-slots-then-hit-dice-then-custom. A classless character gets none.
 * @param {Character} character
 * @returns {Character}
 */
export function withHitDice(character) {
  const pools = characterHitDice(character).map(({ die, count }) => hitDicePool(die, count));
  const resources = spliceReservedPools(
    character.resources,
    pools,
    isHitDicePool,
    (r) => r.id === HP_RESOURCE_ID || isCasterPool(r),
  );
  return { ...character, resources };
}

/**
 * Re-derive the hit-dice pools from the class list, since it can change,
 * and keep what is already spent. Each pool's current value grows by exactly
 * the dice gained. A new die size arrives unspent. A die size no longer
 * granted drops from the pools. A legacy sizeless pool converts, and its
 * spent count moves into the first pool. A character without any hit-dice
 * pool returns unchanged. The same applies to a character whose pools
 * already match, with identity preserved.
 * @param {Character} character
 * @returns {Character}
 */
export function syncHitDice(character) {
  const existing = getHitDicePools(character);
  if (existing.length === 0) return character;
  const legacy = existing.find((r) => r.id === LEGACY_HIT_DICE_ID) ?? null;

  const next = characterHitDice(character).map(({ die, count }, index) => {
    const fresh = hitDicePool(die, count);
    const old = existing.find((r) => r.id === hitDicePoolId(die)) ?? (index === 0 ? legacy : null);
    // The pool is rebuilt from the class list. Its id changes when a legacy
    // pool converts, so only the spent count carries over from the old pool.
    return old === null ? fresh : { ...fresh, current: growMax(old, count).current };
  });

  const unchanged =
    legacy === null &&
    existing.length === next.length &&
    existing.every(
      (r, i) => r.id === next[i].id && r.max === next[i].max && r.current === next[i].current,
    );
  if (unchanged) return character;

  return {
    ...character,
    resources: spliceReservedPools(character.resources, next, isHitDicePool),
  };
}

/**
 * Spend one hit die for healing, the short-rest mechanic. The function rolls
 * the die, adds the CON modifier so the heal is never negative, restores
 * that much HP, and marks the die spent. The `die` parameter picks which
 * pool to use. When `die` is omitted, the function spends the first pool
 * with a die left. A legacy sizeless pool rolls the primary class's die. A
 * character with no matching charged pool, or no resolvable die size,
 * returns unchanged with 0 healed. The RNG is injected for testability.
 * @param {Character} character
 * @param {number | null} [die]
 * @param {() => number} [rng]
 * @returns {{ character: Character, healed: number, rolled: number }}
 */
export function spendHitDie(character, die = null, rng = Math.random) {
  const pool = getHitDicePools(character).find(
    (r) => r.current > 0 && (die === null || r.id === hitDicePoolId(die)),
  );
  const size = pool ? (hitDieOfPool(pool) ?? hitDieFor(character)) : null;
  if (!pool || size === null) return { character, healed: 0, rolled: 0 };
  const rolled = 1 + Math.floor(rng() * size);
  const healed = Math.max(0, rolled + conModifierOf(character));
  const resources = character.resources.map((r) => {
    if (r.id === pool.id) return spend(r, 1);
    if (r.id === HP_RESOURCE_ID) return restore(r, healed);
    return r;
  });
  return { character: { ...character, resources }, healed, rolled };
}

/** @param {Character} character @returns {number} */
function conModifierOf(character) {
  return abilityModifier(character.stats?.CON ?? 10);
}
