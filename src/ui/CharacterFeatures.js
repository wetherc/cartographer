import { sectionLabel, textButton } from './buttons.js';
import { el } from './dom.js';
import { className } from '../entities/LevelAssign.js';
import { listASIChoices, unlockedFeatures } from '../entities/LevelUp.js';
import { undoFeatureGrant, applyFeatureGrant } from '../entities/Progression.js';
import { featureKey, getFeatureChoices, pendingFeatureGrants } from '../entities/FeatureGrants.js';
import { resolveRace } from '../entities/Races.js';
import { askFeatureStamp } from './LevelAssignFlow.js';
import { skillName } from '../data/skills.js';
import { fightingStyle } from '../data/fightingStyles.js';
import { DEFAULT_FEATS } from '../data/feats.js';
import { featureGroups } from '../view/FeatureCards.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../view/FeatureCards.js').FeatureCard} FeatureCard */

/**
 * The picks a claimed feature grant recorded, as one display line. Only
 * what the grant actually added shows, so a pick the character already
 * had from the GM or a feat does not repeat here.
 * @param {import('../types/entities.js').FeatureChoice | undefined} choice
 * @returns {string}
 */
function grantPicksText(choice) {
  if (!choice) return '';
  const g = choice.granted ?? {};
  const style = choice.style ? fightingStyle(choice.style) : undefined;
  const parts = [
    ...(style ? [`${style.name} (${style.text})`] : []),
    ...(g.skills ?? []).map(skillName),
    ...(g.saves ?? []),
    ...(g.expertise ?? []).map(skillName),
    ...(g.armor ?? []),
    ...(g.tools ?? []),
    ...(g.languages ?? []),
  ];
  return [...new Set(parts)].join(', ');
}

/**
 * The class feature cards. A feature whose grant the character claimed
 * keeps its key, so the GM can choose the grant again.
 * @param {Character} character
 * @returns {FeatureCard[]}
 */
function classFeatureCards(character) {
  const claimed = getFeatureChoices(character);
  return unlockedFeatures(character).map((feature) => {
    const key = featureKey({
      classId: feature.classId,
      classLevel: feature.level,
      name: feature.name,
    });
    const choice = claimed[key];
    return {
      name: feature.name,
      source: `${className(feature.classId)} ${feature.level}`,
      detail: grantPicksText(choice),
      ...(choice ? { key } : {}),
    };
  });
}

/**
 * The Features section of the character sheet: one card per class feature,
 * race trait, and feat, grouped under a heading each. The cards sit in a
 * grid that takes as many columns as the sheet is wide. A class feature
 * with a claimed grant has a Change button for a viewer who can edit the
 * character. It returns null when the character has no features at all.
 * @param {() => Character} getCharacter
 * @param {{ editBase: boolean, onCommit: (character: Character) => void }} opts
 * @returns {HTMLElement | null}
 */
export function buildFeaturesSection(getCharacter, opts) {
  const character = getCharacter();
  const feats = listASIChoices(character).flatMap((choice) =>
    choice.type === 'feat'
      ? [
          {
            name: choice.feat,
            source: `${className(choice.classId)} ${choice.classLevel} feat`,
            increases: choice.increases,
            description: DEFAULT_FEATS.find((f) => f.id === choice.featId)?.description,
          },
        ]
      : [],
  );
  const groups = featureGroups({
    classFeatures: classFeatureCards(character),
    race: character.race,
    traits: resolveRace(character)?.traits ?? [],
    feats,
  });
  if (groups.length === 0) return null;

  async function rechoose(/** @type {string} */ key) {
    const from = getCharacter();
    const undone = undoFeatureGrant(from, key);
    if (undone === from) return;
    const grant = pendingFeatureGrants(undone).find((g) => featureKey(g) === key);
    const stamp = grant ? await askFeatureStamp(undone, grant) : null;
    // Cancel keeps the current choice.
    if (!stamp) return;
    // Undo and claim again on the character read after the dialog closes.
    const live = getCharacter();
    const next = applyFeatureGrant(undoFeatureGrant(live, key), stamp);
    if (next !== live) opts.onCommit(next);
  }

  /** @param {FeatureCard} card */
  const buildCard = (card) =>
    el(
      'li',
      'feature-card u-col u-g1',
      el(
        'span',
        'feature-card__top u-row u-g2',
        el('span', 'feature-card__name', card.name),
        el('span', 'feature-card__source u-muted', card.source),
      ),
      card.detail && el('span', 'feature-card__detail u-muted', card.detail),
      card.key &&
        opts.editBase &&
        textButton('Change', () => rechoose(/** @type {string} */ (card.key)), {
          className: 'feature-card__change',
          ariaLabel: `Choose the ${card.name} grants again`,
        }),
    );

  return el(
    'div',
    'character-sheet__features u-col u-g3',
    sectionLabel('Features'),
    ...groups.map((group) =>
      el(
        'div',
        'feature-group u-col u-g2',
        el('h3', 'feature-group__title', `${group.title} (${group.cards.length})`),
        el('ul', 'feature-group__cards', ...group.cards.map(buildCard)),
      ),
    ),
  );
}
