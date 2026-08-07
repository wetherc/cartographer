import { unlockedFeatures, requestedGrants, grantDiff } from './LevelUp.js';
import { getProficiencies, normalizeProficiencies } from './Proficiencies.js';
import { normalizeRider } from './Riders.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').FeatureChoice} FeatureChoice */
/** @typedef {import('../types/entities.js').FeatureChoices} FeatureChoices */
/** @typedef {import('../types/feat.js').FeatEffect} FeatEffect */
/** @typedef {{ classId: string, classLevel: number, name: string, effects: FeatEffect[] }} PendingFeature */
/** @typedef {{ classId: string, classLevel: number, name: string, granted?: import('../types/feat.js').FeatGrants, rider?: import('../types/entities.js').RollRider }} FeatureStamp */

/**
 * The grant lifecycle of a structured class feature. A feature in the class
 * catalog can carry effects in the feat vocabulary (see ClassFeatureDef).
 * Reaching the level that unlocks one earns a pending grant. Applying it
 * merges the grants into the proficiencies and records exactly what the
 * merge added, so undoing it removes exactly that and nothing the character
 * had from another source. Pending is derived, not stored: an unlocked
 * feature with effects and no record in `featureChoices` is pending, so a
 * character created at level 1, an imported save, or a hand-edited class
 * list all surface their unclaimed grants the same way.
 */

/**
 * The key that stores a feature's grant: the class, the class level, and the
 * feature name, joined the way `LevelUp.slotKey` joins its parts. One place
 * builds the key, so a pending feature and the grant that claims it can
 * never disagree about what identifies them.
 * @param {{ classId: string, classLevel: number, name: string }} feature
 * @returns {string}
 */
export function featureKey(feature) {
  return `${feature.classId} ${feature.classLevel} ${feature.name}`;
}

/** @param {Character} character @returns {FeatureChoices} the grants by feature key */
export function getFeatureChoices(character) {
  return character.featureChoices ?? {};
}

/**
 * The structured features the character has unlocked but not yet claimed, in
 * unlock order. Each entry carries the effects the grant flow resolves.
 * @param {Character} character
 * @returns {PendingFeature[]}
 */
export function pendingFeatureGrants(character) {
  const claimed = getFeatureChoices(character);
  /** @type {PendingFeature[]} */
  const pending = [];
  for (const feature of unlockedFeatures(character)) {
    if (!feature.effects) continue;
    const entry = {
      classId: feature.classId,
      classLevel: feature.level,
      name: feature.name,
      effects: feature.effects,
    };
    if (!(featureKey(entry) in claimed)) pending.push(entry);
  }
  return pending;
}

/**
 * Assemble the stamp that `applyFeatureGrant` records, from a pending
 * feature and the picks the dialog gathered. The fixed grants (armor, tools,
 * languages) come from the feature's effects; the picked ones come from the
 * picks. The rider copies as written. Class features grant no ability
 * increases, so there is no asi side.
 * @param {PendingFeature} feature
 * @param {{ skills?: string[], saves?: string[], expertise?: string[] }} picks
 * @returns {FeatureStamp}
 */
export function buildFeatureStamp(feature, picks) {
  const proficiency = feature.effects.filter((e) => e.kind === 'proficiency');
  const rider = feature.effects.find((e) => e.kind === 'rider')?.rider;
  return {
    classId: feature.classId,
    classLevel: feature.classLevel,
    name: feature.name,
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

/** @param {FeatureChoices} choices @returns {number} one past the highest order used */
function nextOrder(choices) {
  return Object.values(choices).reduce((max, choice) => Math.max(max, choice.order + 1), 0);
}

/**
 * Claim a pending feature grant. The function merges the stamp's grants into
 * the proficiencies and records what the merge actually added, plus the
 * rider as written. An expertise grant survives only on a skill the
 * character is proficient in after the skill grants land, exactly as a feat
 * grant does. A stamp whose feature is not pending, unknown, or already
 * claimed leaves the character unchanged. This function is pure.
 * @param {Character} character
 * @param {FeatureStamp} stamp
 * @returns {Character}
 */
export function applyFeatureGrant(character, stamp) {
  const key = featureKey(stamp);
  const pending = pendingFeatureGrants(character);
  if (!pending.some((feature) => featureKey(feature) === key)) return character;

  const before = getProficiencies(character);
  const wanted = requestedGrants(stamp.granted);
  const merged = normalizeProficiencies({
    ...before,
    skills: [...before.skills, ...wanted.skills],
    saves: [...before.saves, ...wanted.saves],
    expertise: [...before.expertise, ...wanted.expertise],
    armor: [...before.armor, ...wanted.armor],
    tools: [...before.tools, ...wanted.tools],
    languages: [...before.languages, ...wanted.languages],
  });
  const granted = grantDiff(merged, before);
  const rider = normalizeRider(stamp.rider);

  const choices = getFeatureChoices(character);
  /** @type {FeatureChoice} */
  const choice = {
    classId: stamp.classId,
    classLevel: stamp.classLevel,
    name: stamp.name,
    order: nextOrder(choices),
    ...(granted ? { granted } : {}),
    ...(rider ? { rider } : {}),
  };
  return {
    ...character,
    proficiencies: merged,
    featureChoices: { ...choices, [key]: choice },
  };
}

/**
 * Undo a claimed feature grant by its key. The function cuts exactly the
 * stamped lists from the proficiencies and re-normalizes, so an expertise
 * that rode a removed skill prunes with it, then drops the record. The
 * feature turns pending again. An unknown key leaves the character
 * unchanged. This function is pure.
 * @param {Character} character
 * @param {string} key
 * @returns {Character}
 */
export function undoFeatureGrant(character, key) {
  const choices = getFeatureChoices(character);
  const choice = choices[key];
  if (!choice) return character;
  const rest = { ...choices };
  delete rest[key];
  /** @type {Character} */
  let next = { ...character, featureChoices: rest };
  if (choice.granted) {
    const granted = choice.granted;
    const before = getProficiencies(character);
    /** @param {'skills' | 'saves' | 'expertise' | 'armor' | 'tools' | 'languages'} listKey */
    const cut = (listKey) => {
      /** @type {string[]} */
      const removed = granted[listKey] ?? [];
      return before[listKey].filter((entry) => !removed.includes(entry));
    };
    next = {
      ...next,
      proficiencies: normalizeProficiencies({
        ...before,
        skills: cut('skills'),
        saves: cut('saves'),
        expertise: cut('expertise'),
        armor: cut('armor'),
        tools: cut('tools'),
        languages: cut('languages'),
      }),
    };
  }
  return next;
}

/**
 * The standing roll riders the character's claimed features carry, each as a
 * `{ name, rider }` source the rider roller reads exactly like a condition
 * chip or a feat rider. A creature holds no feature grants and reads as
 * empty.
 * @param {Character} character
 * @returns {import('./Riders.js').RiderSource[]}
 */
export function featureRiders(character) {
  return Object.values(getFeatureChoices(character))
    .sort((a, b) => a.order - b.order)
    .flatMap((choice) => (choice.rider ? [{ name: choice.name, rider: choice.rider }] : []));
}
