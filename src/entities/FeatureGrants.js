import { unlockedFeatures } from './LevelUp.js';
import { claimGrants, grantedFromPicks, nextOrder, rebuildGrants } from './GrantLedger.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').FeatureChoice} FeatureChoice */
/** @typedef {import('../types/entities.js').FeatureChoices} FeatureChoices */
/** @typedef {import('../types/feat.js').FeatEffect} FeatEffect */
/** @typedef {{ classId: string, classLevel: number, name: string, effects: import('../types/class.js').ClassFeatureEffect[] }} PendingFeature */
/** @typedef {{ classId: string, classLevel: number, name: string, granted?: import('../types/feat.js').FeatGrants, rider?: import('../types/entities.js').RollRider, style?: string }} FeatureStamp */

/**
 * The grant lifecycle of a structured class feature. A feature in the class
 * catalog can carry effects in the feat vocabulary (see ClassFeatureDef).
 * Reaching the level that unlocks one earns a pending grant. Applying it
 * merges the grants into the proficiencies and records what it asked for and
 * what the merge added. Undo rebuilds the lists from those records, so a
 * grant that another source also asks for stays. Pending is derived, not
 * stored: an unlocked feature with effects and no record in `featureChoices`
 * is pending, so a character created at level 1, an imported save, or a
 * hand-edited class list all surface their unclaimed grants the same way.
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
 * Whether an unlocked feature has an effect the grant flow claims. An ability
 * raise (Primal Champion) applies on read and needs no record, so a feature
 * with only raises never waits as a pending grant.
 * @param {{ effects?: import('../types/class.js').ClassFeatureEffect[] }} feature
 * @returns {boolean}
 */
export function needsGrant(feature) {
  return (feature.effects ?? []).some((effect) => effect.kind !== 'abilityRaise');
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
    if (!feature.effects || !needsGrant(feature)) continue;
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
 * picks. The rider copies as written. A fighting style pick counts only when
 * the feature offers it. Class features grant no ability increases, so there
 * is no asi side.
 * @param {PendingFeature} feature
 * @param {{ skills?: string[], saves?: string[], expertise?: string[], style?: string }} picks
 * @returns {FeatureStamp}
 */
export function buildFeatureStamp(feature, picks) {
  const rider = feature.effects.find((e) => e.kind === 'rider')?.rider;
  const styles = feature.effects.flatMap((e) => (e.kind === 'fightingStyle' ? e.from : []));
  const style = picks.style && styles.includes(picks.style) ? picks.style : undefined;
  return {
    classId: feature.classId,
    classLevel: feature.classLevel,
    name: feature.name,
    granted: grantedFromPicks(picks, feature.effects),
    ...(rider ? { rider } : {}),
    ...(style ? { style } : {}),
  };
}

/**
 * Claim a pending feature grant. The function merges the stamp's grants into
 * the proficiencies and records what the grant asked for and what the merge
 * actually added, plus the rider as written. An expertise grant survives
 * only on a skill the character is proficient in after the skill grants
 * land, exactly as a feat grant does. A stamp whose feature is not pending,
 * unknown, or already claimed leaves the character unchanged. This function
 * is pure.
 * @param {Character} character
 * @param {FeatureStamp} stamp
 * @returns {Character}
 */
export function applyFeatureGrant(character, stamp) {
  const key = featureKey(stamp);
  const pending = pendingFeatureGrants(character);
  if (!pending.some((feature) => featureKey(feature) === key)) return character;

  const { proficiencies: merged, requested, granted, rider } = claimGrants(character, stamp);

  const choices = getFeatureChoices(character);
  /** @type {FeatureChoice} */
  const choice = {
    classId: stamp.classId,
    classLevel: stamp.classLevel,
    name: stamp.name,
    order: nextOrder(choices),
    ...(requested ? { requested } : {}),
    ...(granted ? { granted } : {}),
    ...(rider ? { rider } : {}),
    ...(stamp.style ? { style: stamp.style } : {}),
  };
  return {
    ...character,
    proficiencies: merged,
    featureChoices: { ...choices, [key]: choice },
  };
}

/**
 * Undo a claimed feature grant by its key. The proficiencies are rebuilt
 * without the record (see `GrantLedger.rebuildGrants`), so a grant
 * that a feat or another feature also asks for stays, and an expertise that
 * rode a removed skill prunes with it. The record is then dropped and the
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
  if (choice.granted) return rebuildGrants(character, choice);
  const rest = { ...choices };
  delete rest[key];
  return { ...character, featureChoices: rest };
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
