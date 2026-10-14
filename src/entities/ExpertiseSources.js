import { listASIChoices, unlockedFeatures } from './LevelUp.js';
import { getProficiencies } from './Proficiencies.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Whether the character has a source of expertise: a class feature that
 * grants it (the Expertise of the Bard and the Rogue), a feat that asked
 * for it (Skill Expert), or expertise already on record from a hand grant.
 * The sheet offers the Set expertise control only then, so a Fighter with
 * no such source does not see "No expertise chosen". This function is pure.
 * @param {Character} character
 * @returns {boolean}
 */
export function hasExpertiseSource(character) {
  if (getProficiencies(character).expertise.length > 0) return true;
  const fromFeature = unlockedFeatures(character).some((feature) =>
    (feature.effects ?? []).some((effect) => effect.kind === 'proficiency' && effect.expertise),
  );
  return (
    fromFeature ||
    listASIChoices(character).some(
      (choice) => choice.type === 'feat' && (choice.requested?.expertise ?? []).length > 0,
    )
  );
}
