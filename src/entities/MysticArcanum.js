import { classLevelOf } from './Multiclass.js';
import { invocationCast } from './Invocations.js';

/**
 * The Mystic Arcanum of a warlock. At warlock levels 11, 13, 15, and 17 the
 * warlock picks one warlock spell of 6th, 7th, 8th, and 9th level. It casts
 * each one once per long rest with no spell slot. A character stores the
 * picks in `mysticArcanum`, keyed by spell level. A spent arcanum sits in
 * `invocationUses` under the id `arcanum-<level>`, so `Character.longRest`
 * gives it back with the once-per-rest invocations, and
 * `Invocations.markInvocationUsed` spends it. Every function here is pure.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/invocation.js').InvocationCast} InvocationCast */

/** The warlock level that grants each arcanum spell level. */
export const ARCANUM_LEVELS = /** @type {const} */ ([
  [11, 6],
  [13, 7],
  [15, 8],
  [17, 9],
]);

/**
 * The warlock level that grants the arcanum of a spell level: 11 for 6th,
 * up to 17 for 9th.
 * @param {number} spellLevel
 * @returns {number}
 */
const grantLevel = (spellLevel) => spellLevel * 2 - 1;

/**
 * The arcanum spell levels that the character's warlock level grants.
 * @param {Character} character
 * @returns {number[]}
 */
export function arcanumLevels(character) {
  const level = classLevelOf(character, 'warlock');
  return ARCANUM_LEVELS.filter(([at]) => level >= at).map(([, spellLevel]) => spellLevel);
}

/**
 * The picked arcanum spells that the warlock level still grants, as spell
 * level and id, lowest level first. A stored value that is not a string id
 * reads as no pick.
 * @param {Character} character
 * @returns {{ level: number, spellId: string }[]}
 */
export function getArcana(character) {
  const stored = character.mysticArcanum ?? {};
  return arcanumLevels(character).flatMap((level) => {
    const spellId = stored[level];
    return typeof spellId === 'string' && spellId ? [{ level, spellId }] : [];
  });
}

/**
 * The arcanum spell levels that the warlock level grants with no pick.
 * @param {Character} character
 * @returns {number[]}
 */
export function pendingArcana(character) {
  const picked = new Set(getArcana(character).map((a) => a.level));
  return arcanumLevels(character).filter((level) => !picked.has(level));
}

/**
 * The spells a warlock can pick as the arcanum of a spell level: the warlock
 * spells of exactly that level.
 * @param {Spell[]} spells
 * @param {number} level
 * @returns {Spell[]}
 */
export function arcanumOptions(spells, level) {
  return spells.filter((s) => s.level === level && s.classes.includes('warlock'));
}

/**
 * The character with these arcanum picks merged in, keyed by spell level. A
 * level the warlock level does not grant, and a blank id, drop. A pick for a
 * level already picked replaces it.
 * @param {Character} character
 * @param {Record<string, string>} picks
 * @returns {Character}
 */
export function setArcana(character, picks) {
  const levels = arcanumLevels(character);
  const kept = Object.entries(picks).filter(
    ([level, id]) => levels.includes(Number(level)) && typeof id === 'string' && id,
  );
  if (kept.length === 0) return character;
  return {
    ...character,
    mysticArcanum: { ...(character.mysticArcanum ?? {}), ...Object.fromEntries(kept) },
  };
}

/**
 * The ids of the arcanum spells the character casts.
 * @param {Character} character
 * @returns {string[]}
 */
export function arcanumSpellIds(character) {
  return getArcana(character).map((a) => a.spellId);
}

/**
 * How the character casts a spell as its Mystic Arcanum, or null when no
 * arcanum pick names it. The cast is once per long rest and spends no slot.
 * @param {Character} character
 * @param {string} spellId
 * @returns {InvocationCast | null}
 */
export function arcanumCast(character, spellId) {
  const pick = getArcana(character).find((a) => a.spellId === spellId);
  if (!pick) return null;
  const id = `arcanum-${pick.level}`;
  return {
    invocation: {
      id,
      name: 'Mystic Arcanum',
      level: grantLevel(pick.level),
      description: `Cast once per long rest with no spell slot.`,
    },
    oncePerRest: true,
    free: true,
    spent: (character.invocationUses ?? []).includes(id),
  };
}

/**
 * How a warlock casts a spell through a class feature: an invocation first,
 * then the Mystic Arcanum. Null when neither casts it.
 * @param {Character} character
 * @param {string} spellId
 * @returns {InvocationCast | null}
 */
export function warlockCast(character, spellId) {
  return invocationCast(character, spellId) ?? arcanumCast(character, spellId);
}

/**
 * Whether an arcanum pick claims this warlock level: a pick that the level
 * or a higher one grants, which the loss of the level would drop. The donor
 * path of `LevelAssign` reads this beside the other choice records.
 * @param {Character} character
 * @param {number} level the warlock level
 * @returns {boolean}
 */
export function arcanaClaim(character, level) {
  return getArcana(character).some((a) => grantLevel(a.level) >= level);
}
