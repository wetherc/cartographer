import { createResource, spend, restore } from './Resource.js';
import { isSlotPool, isPactPool } from './SpellSlots.js';
import { getClass } from './Classes.js';
import { getClasses, primaryClass } from './Multiclass.js';
import { abilityModifier } from './Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */

/**
 * Hit dice are regular resource pools under reserved ids (like HP and the
 * spell-slot pools), one pool per die size: `hit-dice-d8` holds a character's
 * d8s, sized to their combined levels in d8 classes. A single-class character
 * has one pool; a multiclass character has one per distinct die size, primary
 * class first. Short rests spend them for healing; a long rest restores half
 * of each pool (see Character.js's restAll). Older saves carried one generic
 * `hit-dice` pool with no die size; syncHitDice converts it, carrying the
 * spent count into the primary class's pool.
 */
export const HIT_DICE_ID_PREFIX = 'hit-dice-d';
export const LEGACY_HIT_DICE_ID = 'hit-dice';

/** The HP pool's reserved id. Declared here rather than imported from
 * Character.js, which sits above this module. */
const HP_POOL_ID = 'hp';

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
 * The hit dice the class list grants: one entry per distinct die size in
 * class-list order (primary class first), counting one die per assigned class
 * level. Unknown classes contribute nothing; pending (unassigned) levels grant
 * their die only once assigned. Empty for a classless character.
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
 * The class-derived maximum HP across the class list: the first class grants
 * a full hit die plus CON modifier at its first level (at least 1), and every
 * other assigned level — the first class's remaining levels and every other
 * class's levels in full — adds that class's average-rule gain. Pending
 * (unassigned) levels contribute nothing. Null for a classless character or
 * one whose classes are all unknown.
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
 * Move the HP pool's maximum onto the value the class list, level, and CON now
 * imply, carrying current HP by the same delta so a level-up or a retroactive
 * CON increase grants the points rather than only raising the ceiling. Current
 * HP stays within [0, max]; a character already at their derived maximum comes
 * back unchanged, identity preserved.
 *
 * Three cases opt out. A character with no derivable class HP (classless, or
 * every class unknown) keeps whatever pool they have — there is nothing to
 * derive from. So does a character with no HP pool at all, since its absence
 * legitimately means "no HP tracking". And so does one carrying `hpOverride`,
 * the flag `Character.setMaxHP` sets: a GM who types a maximum by hand owns it
 * from then on, and nothing here overwrites it.
 *
 * Call this through `Progression.derive` rather than directly; it is exported
 * for that facade and for tests.
 * @param {Character} character
 * @returns {Character}
 */
export function reconcileMaxHP(character) {
  if (character.hpOverride) return character;
  const max = classMaxHP(character);
  if (max === null) return character;
  const pool = character.resources.find((r) => r.id === HP_POOL_ID);
  if (!pool || pool.max === max) return character;
  const delta = max - pool.max;
  return {
    ...character,
    resources: character.resources.map((r) =>
      r.id === HP_POOL_ID
        ? { ...r, max, current: Math.max(0, Math.min(max, r.current + delta)) }
        : r,
    ),
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
 * Give a character full hit-dice pools derived from their class list,
 * replacing any existing ones (including a legacy sizeless pool). Ordered
 * after HP and spell slots so the card reads
 * HP-then-slots-then-hit-dice-then-custom. A classless character gets none.
 * @param {Character} character
 * @returns {Character}
 */
export function withHitDice(character) {
  const pools = characterHitDice(character).map(({ die, count }) =>
    createResource(hitDicePoolId(die), `Hit Dice (d${die})`, 'custom', count),
  );
  const rest = character.resources.filter((r) => !isHitDicePool(r));
  const head = rest.filter((r) => r.id === HP_POOL_ID || isSlotPool(r) || isPactPool(r));
  const tail = rest.filter((r) => !head.includes(r));
  return { ...character, resources: [...head, ...pools, ...tail] };
}

/**
 * Re-derive the hit-dice pools from the (possibly changed) class list, keeping
 * what's spent: each pool's current grows by exactly the dice gained, a new
 * die size arrives unspent, and a die size no longer granted drops. A legacy
 * sizeless pool converts, carrying its spent count into the first pool. A
 * character without any hit-dice pool is returned unchanged, as is one whose
 * pools already match, identity preserved.
 * @param {Character} character
 * @returns {Character}
 */
export function syncHitDice(character) {
  const existing = getHitDicePools(character);
  if (existing.length === 0) return character;
  const legacy = existing.find((r) => r.id === LEGACY_HIT_DICE_ID) ?? null;

  const next = characterHitDice(character).map(({ die, count }, index) => {
    const old = existing.find((r) => r.id === hitDicePoolId(die)) ?? (index === 0 ? legacy : null);
    const current =
      old === null ? count : Math.min(count, old.current + Math.max(0, count - old.max));
    return {
      ...createResource(hitDicePoolId(die), `Hit Dice (d${die})`, 'custom', count),
      current,
    };
  });

  const unchanged =
    legacy === null &&
    existing.length === next.length &&
    existing.every(
      (r, i) => r.id === next[i].id && r.max === next[i].max && r.current === next[i].current,
    );
  if (unchanged) return character;

  /** @type {ResourcePool[]} */
  const resources = [];
  let placed = false;
  for (const r of character.resources) {
    if (!isHitDicePool(r)) {
      resources.push(r);
    } else if (!placed) {
      resources.push(...next);
      placed = true;
    }
  }
  return { ...character, resources };
}

/**
 * Spend one hit die for healing (the short-rest mechanic): roll the die, add
 * the CON modifier (a heal never negative), restore that much HP, and mark the
 * die spent. `die` picks which pool; omitted, the first pool with a die left
 * is spent. A legacy sizeless pool rolls the primary class's die. A character
 * with no matching charged pool (or no resolvable die size) is returned
 * unchanged with 0 healed. RNG injected for testability.
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
    if (r.id === HP_POOL_ID) return restore(r, healed);
    return r;
  });
  return { character: { ...character, resources }, healed, rolled };
}

/** @param {Character} character @returns {number} */
function conModifierOf(character) {
  return abilityModifier(character.stats?.CON ?? 10);
}
