/**
 * What each of the six ability scores covers, in one line each. This is
 * reference text for the sheet's tooltips, not a rule the code applies. The
 * ability keys and their order live in `entities/Modifiers.js`, which is where
 * the rules read them from.
 */

/** The full name of each ability, for a tooltip that leads with the word. */
export const ABILITY_NAMES = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
};

/** What each ability measures and what it is rolled for. */
export const ABILITY_DESCRIPTIONS = {
  STR: 'Raw physical force. It covers lifting, shoving, climbing, and most melee weapons.',
  DEX: 'Agility and balance. It covers finesse and ranged weapons, armor class, initiative, and stealth.',
  CON: 'Health and stamina. It sets hit points at every level and resists poison and exhaustion.',
  INT: 'Recall and reasoning. It covers lore, investigation, and wizard spellcasting.',
  WIS: 'Attention and insight. It covers noticing things, reading people, and cleric and druid spellcasting.',
  CHA: 'Force of personality. It covers persuading and deceiving, and bard, warlock, and sorcerer spellcasting.',
};

/**
 * The full name of an ability, or the key itself for one this table does not
 * know. A save row shows the key, so the tooltip is where the word appears.
 * @param {string} key
 * @returns {string}
 */
export function abilityName(key) {
  return ABILITY_NAMES[/** @type {keyof typeof ABILITY_NAMES} */ (key)] ?? key;
}

/**
 * What an ability covers, or an empty string for one this table does not know.
 * @param {string} key
 * @returns {string}
 */
export function abilityDescription(key) {
  return ABILITY_DESCRIPTIONS[/** @type {keyof typeof ABILITY_DESCRIPTIONS} */ (key)] ?? '';
}
