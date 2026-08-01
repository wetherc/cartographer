/** @typedef {import('../types/spell.js').Ability} Ability */

import { capitalize } from '../util/text.js';

/**
 * The 18 skills, mapped to their governing ability and keyed by kebab-case
 * skill id. This is the one canonical skill list. Class and background skill
 * choices reference these ids. Skill-check resolution reads the governing
 * ability from here.
 * @type {Record<string, Ability>}
 */
export const SKILL_ABILITIES = {
  acrobatics: 'DEX',
  'animal-handling': 'WIS',
  arcana: 'INT',
  athletics: 'STR',
  deception: 'CHA',
  history: 'INT',
  insight: 'WIS',
  intimidation: 'CHA',
  investigation: 'INT',
  medicine: 'WIS',
  nature: 'INT',
  perception: 'WIS',
  performance: 'CHA',
  persuasion: 'CHA',
  religion: 'INT',
  'sleight-of-hand': 'DEX',
  stealth: 'DEX',
  survival: 'WIS',
};

/** Every skill id, in display order. @type {string[]} */
export const SKILL_IDS = Object.keys(SKILL_ABILITIES);

/**
 * A skill id's display name. Each hyphenated word is capitalized. For example,
 * "sleight-of-hand" renders as "Sleight of Hand", with small words kept lowercase.
 * @param {string} skillId
 * @returns {string}
 */
export function skillName(skillId) {
  return skillId
    .split('-')
    .map((word) => (word === 'of' ? word : capitalize(word)))
    .join(' ');
}
