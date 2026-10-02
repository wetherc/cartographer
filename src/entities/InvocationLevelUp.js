import { classLevelOf } from './Multiclass.js';
import {
  PACT_BOON_LEVEL,
  eligibleInvocations,
  getInvocations,
  getPactBoon,
  invocationCount,
  setInvocations,
  setPactBoon,
} from './Invocations.js';
import { pendingArcana, setArcana } from './MysticArcanum.js';
import { addTomeRituals, setTomeCantrips, tomeCantrips } from './PactTome.js';

/**
 * The warlock picks that a level-up asks for: the pact boon from 3rd warlock
 * level, the invocations that the level count allows but the character has
 * not picked, one optional swap of a known invocation for another, and the
 * Mystic Arcanum spell of each spell level the warlock level grants. The
 * level-up dialogs in `ui/InvocationLevelFlow.js` gather the picks against a
 * preview of the new level, and `applyWarlockPicks` applies them again to the
 * character read after the last dialog closes. Every function here is pure.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/invocation.js').PactBoon} PactBoon */
/** @typedef {import('../types/invocation.js').WarlockPicks} WarlockPicks */

/**
 * How many invocations the character can still pick at its warlock level.
 * @param {Character} character
 * @returns {number}
 */
export function pendingInvocationCount(character) {
  const count = invocationCount(classLevelOf(character, 'warlock'));
  return Math.max(0, count - getInvocations(character).length);
}

/**
 * Whether the character has reached the pact boon level with no boon picked.
 * @param {Character} character
 * @returns {boolean}
 */
export function pactBoonPending(character) {
  return classLevelOf(character, 'warlock') >= PACT_BOON_LEVEL && getPactBoon(character) === null;
}

/**
 * The invocations the character qualifies for and has not picked, which a
 * new pick or the new half of a swap can take.
 * @param {Character} character
 * @returns {import('../types/invocation.js').Invocation[]}
 */
export function unpickedInvocations(character) {
  const picked = new Set(getInvocations(character).map((inv) => inv.id));
  return eligibleInvocations(character).filter((inv) => !picked.has(inv.id));
}

/**
 * The character with its known invocation `from` replaced by `to`. The new
 * invocation keeps the place of the old one in the list. The character comes
 * back unchanged when `from` is not a known pick, or when `to` is already
 * picked or does not qualify.
 * @param {Character} character
 * @param {string} from
 * @param {string} to
 * @returns {Character}
 */
export function swapInvocation(character, from, to) {
  const ids = getInvocations(character).map((inv) => inv.id);
  const at = ids.indexOf(from);
  if (at < 0 || !unpickedInvocations(character).some((inv) => inv.id === to)) return character;
  return setInvocations(
    character,
    ids.map((id, i) => (i === at ? to : id)),
  );
}

/**
 * The character with the picks of a warlock level-up applied: the pact boon
 * first, since an invocation can need it, then the new invocations, and the
 * swap, the Mystic Arcanum picks, and the Book of Shadows picks last. A pick that no longer qualifies
 * drops, the new invocations stop at the count of the warlock level, and an
 * arcanum pick lands only on a spell level with no pick yet. The Book of
 * Shadows cantrips land only in a book with none, and a ritual lands only
 * when it qualifies (see `PactTome.addTomeRituals`).
 * @param {Character} character
 * @param {WarlockPicks} picks
 * @returns {Character}
 */
export function applyWarlockPicks(character, picks) {
  let next = character;
  if (picks.boon && pactBoonPending(next)) next = setPactBoon(next, picks.boon);
  if (picks.added.length > 0) {
    const known = getInvocations(next).map((inv) => inv.id);
    next = setInvocations(next, [...known, ...picks.added]);
  }
  if (picks.swap) next = swapInvocation(next, picks.swap.from, picks.swap.to);
  const open = pendingArcana(next);
  const arcana = Object.entries(picks.arcana ?? {}).filter(([level]) =>
    open.includes(Number(level)),
  );
  if (arcana.length > 0) next = setArcana(next, Object.fromEntries(arcana));
  if (picks.tomeCantrips?.length && tomeCantrips(next).length === 0) {
    next = setTomeCantrips(next, picks.tomeCantrips);
  }
  if (picks.rituals?.length) next = addTomeRituals(next, picks.rituals);
  return next;
}
