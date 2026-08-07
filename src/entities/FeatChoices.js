import { ABILITY_SCORES } from './Modifiers.js';
import { ABILITY_MAX, listASIChoices } from './LevelUp.js';
import { featureRiders } from './FeatureGrants.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/feat.js').Feat} Feat */
/** @typedef {import('../types/feat.js').FeatStamp} FeatStamp */
/** @typedef {import('../types/feat.js').ProficiencyChoice} ProficiencyChoice */

/**
 * The choice arithmetic behind the take-feat dialog, and the read side the
 * roll paths use. The dialog itself is DOM wiring in CharacterProgress.js;
 * everything it needs to compute lives here, pure and testable: which
 * catalog feats are still on offer, which options each pick draws from, and
 * the stamp that the picks assemble into for `LevelUp.takeFeat`. The roll
 * sites read the stamped riders back out through `featRiders` and
 * `riderSources`.
 */

/**
 * The catalog keys a character's taken feats claim. A stamped choice claims
 * its featId; a hand-typed one claims its lowercased name, so retyping the
 * same name reads as taken too.
 * @param {Character} character
 * @returns {Set<string>}
 */
function takenKeys(character) {
  return new Set(
    listASIChoices(character).flatMap((choice) =>
      choice.type === 'feat' ? [choice.featId ?? choice.feat.trim().toLowerCase()] : [],
    ),
  );
}

/**
 * The catalog feats the character can still take. A feat is off the list
 * once taken, by id or by name, unless it is repeatable.
 * @param {Character} character
 * @param {Feat[]} feats
 * @returns {Feat[]}
 */
export function availableFeats(character, feats) {
  const taken = takenKeys(character);
  return feats.filter(
    (feat) =>
      feat.repeatable || (!taken.has(feat.id) && !taken.has(feat.name.trim().toLowerCase())),
  );
}

/**
 * The abilities an asi effect's +1 can land on: the effect's own list, or
 * all six when it names none, minus any score already at the cap.
 * @param {Character} character
 * @param {{ abilities: string[] }} effect
 * @returns {string[]}
 */
export function abilityPool(character, effect) {
  const allowed = effect.abilities.length > 0 ? effect.abilities : ABILITY_SCORES;
  return allowed.filter((key) => (character.stats?.[key] ?? 10) < ABILITY_MAX);
}

/**
 * The options a pick-n choice offers: its own list, or the whole vocabulary
 * when the list is empty, minus what the character already holds.
 * @param {ProficiencyChoice} choice
 * @param {string[]} vocabulary
 * @param {string[]} held
 * @returns {string[]}
 */
export function choicePool(choice, vocabulary, held) {
  const from = choice.from.length > 0 ? choice.from : vocabulary;
  return from.filter((id) => !held.includes(id));
}

/**
 * The standing roll riders the character's taken feats carry, each as a
 * `{ name, rider }` source the rider roller reads exactly like a condition
 * chip. A creature never takes feats and holds no choices, so this reads as
 * empty for one.
 * @param {Character} character
 * @returns {import('../entities/Riders.js').RiderSource[]}
 */
export function featRiders(character) {
  return listASIChoices(character).flatMap((choice) =>
    choice.type === 'feat' && choice.rider ? [{ name: choice.feat, rider: choice.rider }] : [],
  );
}

/**
 * Everything that rides the character's rolls: its condition chips, its
 * feat riders, and its class-feature riders, in one list for `rollRiders`.
 * The roll sites call this instead of reading `conditions` directly, so a
 * feat bonus and a chip bonus cannot diverge. Safe on a creature, which
 * contributes its chips alone.
 * @param {Character | import('../types/creature.js').Creature} entity
 * @returns {import('../entities/Riders.js').RiderSource[]}
 */
export function riderSources(entity) {
  const character = /** @type {Character} */ (entity);
  return [...(entity.conditions ?? []), ...featRiders(character), ...featureRiders(character)];
}

/**
 * Assemble the stamp that `takeFeat` applies, from the feat and the picks
 * the dialog gathered. The fixed grants (armor, tools, languages) come from
 * the feat itself; the picked ones come from the picks. Two asi picks of the
 * same ability stack into one +2 entry. The rider copies as written.
 * @param {Feat} feat
 * @param {{ abilities?: string[], skills?: string[], saves?: string[], expertise?: string[] }} picks
 * @returns {FeatStamp}
 */
export function buildStamp(feat, picks) {
  /** @type {Record<string, number>} */
  const increases = {};
  for (const key of picks.abilities ?? []) increases[key] = (increases[key] ?? 0) + 1;
  const proficiency = feat.effects.filter((e) => e.kind === 'proficiency');
  const rider = feat.effects.find((e) => e.kind === 'rider')?.rider;
  return {
    name: feat.name,
    featId: feat.id,
    ...(Object.keys(increases).length > 0 ? { increases } : {}),
    granted: {
      skills: picks.skills ?? [],
      saves: picks.saves ?? [],
      expertise: picks.expertise ?? [],
      armor: proficiency.flatMap((e) => e.armor ?? []),
      tools: proficiency.flatMap((e) => e.tools ?? []),
      languages: proficiency.flatMap((e) => e.languages ?? []),
    },
    ...(rider ? { rider } : {}),
  };
}
