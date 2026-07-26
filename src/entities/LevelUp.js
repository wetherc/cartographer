import { getClass } from './Classes.js';
import { ABILITY_SCORES } from './Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').AsiChoice} AsiChoice */

/**
 * Ability-score improvements and level-gated features, both derived from the
 * class definition rather than stored: reaching a class ASI level earns one
 * choice slot, and a slot stays pending until the character records a choice
 * (an ability increase or a feat) against it in `asiChoices`. Features are
 * pure derivation too — a class and a level fully determine them — so leveling
 * up stores nothing; the accessors here read the current state on demand.
 */

/** The 5e cap an ability score can't be raised past by an improvement. */
export const ABILITY_MAX = 20;

/** @param {Character} character @returns {number} */
function levelOf(character) {
  return Math.max(1, Math.floor(character.level) || 1);
}

/** @param {Character} character @returns {AsiChoice[]} */
export function getASIChoices(character) {
  return character.asiChoices ?? [];
}

/**
 * The class ASI levels the character has reached, ascending. Empty for a
 * classless character.
 * @param {Character} character
 * @returns {number[]}
 */
export function earnedASILevels(character) {
  const def = getClass(character.class);
  if (!def) return [];
  const level = levelOf(character);
  return def.asiLevels.filter((l) => l <= level);
}

/**
 * The earned ASI levels not yet claimed by a recorded choice, ascending.
 * @param {Character} character
 * @returns {number[]}
 */
export function pendingASILevels(character) {
  const claimed = new Set(getASIChoices(character).map((c) => c.level));
  return earnedASILevels(character).filter((l) => !claimed.has(l));
}

/**
 * Whether an increase map is a legal ability-score improvement for this
 * character: known abilities only, whole positive points totaling exactly 2,
 * and no score raised past 20.
 * @param {Character} character
 * @param {Record<string, number>} increases
 * @returns {boolean}
 */
export function isValidASI(character, increases) {
  const entries = Object.entries(increases).filter(([, v]) => v !== 0);
  if (entries.length === 0) return false;
  let total = 0;
  for (const [key, value] of entries) {
    if (!ABILITY_SCORES.includes(key)) return false;
    if (!Number.isInteger(value) || value < 1) return false;
    if ((character.stats?.[key] ?? 10) + value > ABILITY_MAX) return false;
    total += value;
  }
  return total === 2;
}

/**
 * Spend the lowest pending ASI slot on an ability increase (+2 to one score or
 * +1 to two, per `isValidASI`), applying it to the stats and recording the
 * choice. No pending slot, or an invalid increase, leaves the character
 * unchanged. Pure.
 * @param {Character} character
 * @param {Record<string, number>} increases
 * @returns {Character}
 */
export function applyASI(character, increases) {
  const [level] = pendingASILevels(character);
  if (level === undefined || !isValidASI(character, increases)) return character;
  const stats = { ...character.stats };
  for (const [key, value] of Object.entries(increases)) {
    if (value !== 0) stats[key] = (stats[key] ?? 10) + value;
  }
  const choice = { level, type: /** @type {const} */ ('asi'), increases: { ...increases } };
  return { ...character, stats, asiChoices: [...getASIChoices(character), choice] };
}

/**
 * Spend the lowest pending ASI slot on a feat instead of an ability increase.
 * The feat is recorded by name only — the feat catalog and its mechanical
 * effects are a separate feature. No pending slot, or a blank name, leaves the
 * character unchanged. Pure.
 * @param {Character} character
 * @param {string} feat
 * @returns {Character}
 */
export function takeFeat(character, feat) {
  const [level] = pendingASILevels(character);
  const name = feat.trim();
  if (level === undefined || name === '') return character;
  const choice = { level, type: /** @type {const} */ ('feat'), feat: name };
  return { ...character, asiChoices: [...getASIChoices(character), choice] };
}

/**
 * Undo the most recent ASI choice, reopening its slot: an ability increase is
 * subtracted back out of the stats, a feat simply forgotten. No choices ->
 * unchanged, identity preserved. Pure.
 * @param {Character} character
 * @returns {Character}
 */
export function undoLastChoice(character) {
  const choices = getASIChoices(character);
  const last = choices[choices.length - 1];
  if (!last) return character;
  const next = { ...character, asiChoices: choices.slice(0, -1) };
  if (last.type !== 'asi') return next;
  const stats = { ...character.stats };
  for (const [key, value] of Object.entries(last.increases)) {
    stats[key] = (stats[key] ?? 10) - value;
  }
  return { ...next, stats };
}

/**
 * The class features unlocked at or below the character's level, ascending by
 * level, as `{ level, name }` pairs. Empty for a classless character.
 * @param {Character} character
 * @returns {{ level: number, name: string }[]}
 */
export function unlockedFeatures(character) {
  const def = getClass(character.class);
  if (!def) return [];
  const level = levelOf(character);
  return Object.entries(def.featuresByLevel)
    .map(([l, names]) => ({ level: Number(l), names }))
    .filter((entry) => entry.level <= level)
    .sort((a, b) => a.level - b.level)
    .flatMap((entry) => entry.names.map((name) => ({ level: entry.level, name })));
}

/**
 * The class features gained by leveling from `fromLevel` (exclusive) to the
 * character's current level — what a level-up announcement lists. Same shape
 * as `unlockedFeatures`.
 * @param {Character} character
 * @param {number} fromLevel
 * @returns {{ level: number, name: string }[]}
 */
export function featuresGained(character, fromLevel) {
  return unlockedFeatures(character).filter((f) => f.level > fromLevel);
}
