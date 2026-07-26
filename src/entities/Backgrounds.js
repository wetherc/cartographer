import { DEFAULT_BACKGROUNDS } from '../data/backgrounds.js';

/** @typedef {import('../types/background.js').BackgroundDef} BackgroundDef */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The character backgrounds. The definitions live in data/backgrounds.js
 * (library-kind shaped, stable id + name per entry); this module holds the
 * logic that reads them, mirroring Classes.js. No snapshot is stored on the
 * character: a background's grants are proficiencies, which land as
 * hand-editable lists on the character itself, so the assembled lists are the
 * durable copy.
 * @type {BackgroundDef[]}
 */
export const BACKGROUND_LIST = DEFAULT_BACKGROUNDS;

/** The backgrounds indexed by id, for O(1) lookup.
 * @type {Map<string, BackgroundDef>} */
const BACKGROUND_BY_ID = new Map(BACKGROUND_LIST.map((b) => [b.id, b]));

/**
 * The background definition for an id, or null for an unknown/absent id.
 * @param {string | undefined | null} backgroundId
 * @returns {BackgroundDef | null}
 */
export function getBackground(backgroundId) {
  return (backgroundId && BACKGROUND_BY_ID.get(backgroundId)) || null;
}

/**
 * Assign a background by id. An unknown id leaves the character unchanged;
 * an empty id clears the background. Pure.
 * @param {Character} character
 * @param {string} backgroundId
 * @returns {Character}
 */
export function withBackground(character, backgroundId) {
  if (!backgroundId) return { ...character, background: undefined };
  if (!getBackground(backgroundId)) return character;
  return { ...character, background: backgroundId };
}

/**
 * A character's background definition, resolved at call time, or null for a
 * character without one (or whose custom background was deleted).
 * @param {Character} character
 * @returns {BackgroundDef | null}
 */
export function resolveBackground(character) {
  return getBackground(character.background);
}
