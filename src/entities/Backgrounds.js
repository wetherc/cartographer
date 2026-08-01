import { DEFAULT_BACKGROUNDS } from '../data/backgrounds.js';

/** @typedef {import('../types/background.js').BackgroundDef} BackgroundDef */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The character backgrounds. The definitions live in data/backgrounds.js
 * (library-kind shaped, with a stable id and name per entry). This module
 * holds the logic that reads them, mirroring Classes.js. The character
 * stores no snapshot. A background's grants are proficiencies, and they
 * land as hand-editable lists on the character itself. The assembled lists
 * are the durable copy.
 * @type {BackgroundDef[]}
 */
export const BACKGROUND_LIST = DEFAULT_BACKGROUNDS;

/** The backgrounds indexed by id, for O(1) lookup.
 * @type {Map<string, BackgroundDef>} */
const BACKGROUND_BY_ID = new Map(BACKGROUND_LIST.map((b) => [b.id, b]));

/**
 * The background definition for an id, or null for an unknown or absent id.
 * @param {string | undefined | null} backgroundId
 * @returns {BackgroundDef | null}
 */
export function getBackground(backgroundId) {
  return (backgroundId && BACKGROUND_BY_ID.get(backgroundId)) || null;
}

/**
 * Assign a background by id. An unknown id leaves the character unchanged.
 * An empty id clears the background. This function is pure.
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
 * A character's background definition, resolved at call time. Returns null
 * for a character with no background, or one whose custom background was
 * deleted.
 * @param {Character} character
 * @returns {BackgroundDef | null}
 */
export function resolveBackground(character) {
  return getBackground(character.background);
}
