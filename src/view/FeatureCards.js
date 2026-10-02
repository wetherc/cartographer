/**
 * One card of the Features section of the full character sheet. `source`
 * says where the feature comes from ("Cleric 2", "Half-Elf", "Fighter 4
 * feat"). `detail` is the extra line under it, empty when there is none.
 * `key` names a class feature grant that the GM can choose again.
 * @typedef {{ name: string, source: string, detail: string, key?: string }} FeatureCard
 */

/** @typedef {{ title: string, cards: FeatureCard[] }} FeatureGroup */

/**
 * A feat taken at an ability score improvement.
 * @typedef {{
 *   name: string,
 *   source: string,
 *   increases?: Record<string, number>,
 *   description?: string,
 * }} TakenFeat
 */

/**
 * The detail line of a feat: the ability increases it applied, then its
 * description.
 * @param {TakenFeat} feat
 * @returns {string}
 */
export function featDetail(feat) {
  const raised = Object.entries(feat.increases ?? {})
    .filter(([, amount]) => amount !== 0)
    .map(([key, amount]) => `+${amount} ${key}`)
    .join(', ');
  return [raised && `${raised}.`, feat.description ?? ''].filter(Boolean).join(' ');
}

/**
 * The groups of the Features section, in reading order: class features, race
 * traits, then feats. A group with no cards is left out, so a character with
 * no feats shows no empty Feats heading.
 * @param {{
 *   classFeatures: FeatureCard[],
 *   race: string,
 *   traits: readonly string[],
 *   feats: TakenFeat[],
 * }} input
 * @returns {FeatureGroup[]}
 */
export function featureGroups(input) {
  const raceCards = input.traits.map((name) => ({ name, source: input.race, detail: '' }));
  const featCards = input.feats.map((feat) => ({
    name: feat.name,
    source: feat.source,
    detail: featDetail(feat),
  }));
  return [
    { title: 'Class features', cards: input.classFeatures },
    { title: 'Race traits', cards: raceCards },
    { title: 'Feats', cards: featCards },
  ].filter((group) => group.cards.length > 0);
}
