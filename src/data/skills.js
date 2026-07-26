/** @typedef {import('../types/spell.js').Ability} Ability */

/**
 * The 18 skills mapped to their governing ability, keyed by kebab-case skill
 * id. The one canonical skill list: class/background skill choices reference
 * these ids, and skill-check resolution reads the governing ability from here.
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
 * A skill id's display name: each hyphenated word capitalized ("sleight-of-hand"
 * renders as "Sleight of Hand", with the small words kept lowercase).
 * @param {string} skillId
 * @returns {string}
 */
export function skillName(skillId) {
  return skillId
    .split('-')
    .map((word) => (word === 'of' ? word : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}
