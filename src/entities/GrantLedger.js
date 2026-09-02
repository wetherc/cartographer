import { ABILITY_SCORES } from './Modifiers.js';
import { getProficiencies, normalizeProficiencies, ARMOR_PROFICIENCIES } from './Proficiencies.js';
import { SKILL_IDS } from '../data/skills.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Proficiencies} Proficiencies */
/** @typedef {import('../types/feat.js').FeatGrants} FeatGrants */
/** @typedef {'skills' | 'saves' | 'expertise' | 'armor' | 'tools' | 'languages'} GrantKey */
/** @typedef {{ granted?: FeatGrants, requested?: FeatGrants }} GrantRecord */

/**
 * The proficiency grants a feat or a class feature can carry, and how a
 * recorded grant comes back off. A taken feat and a claimed class feature
 * both record two lists. `requested` is every proficiency the grant asked
 * for. `granted` is only what the merge added, because the character lacked
 * it before. Undo does not subtract `granted`. It rebuilds the lists from
 * the base (the current lists minus everything any record added) plus the
 * requests of every record that stays. A proficiency that two records both
 * ask for therefore survives the undo of either one, and leaves only when
 * the last record that asks for it is undone. A record written before
 * `requested` existed reads its `granted` list as its request.
 */

/** The six proficiency lists a grant can touch. */
export const GRANT_KEYS = /** @type {const} */ ([
  'skills',
  'saves',
  'expertise',
  'armor',
  'tools',
  'languages',
]);

/**
 * The stamp's proficiency grants with everything outside each list's
 * vocabulary dropped. Tools and languages have no vocabulary and keep any
 * non-blank string.
 * @param {FeatGrants | undefined} granted
 * @returns {Required<FeatGrants>}
 */
export function requestedGrants(granted) {
  const source = granted && typeof granted === 'object' ? granted : {};
  /** @param {string[] | undefined} list @param {string[]} [vocabulary] */
  const keep = (list, vocabulary) =>
    Array.isArray(list)
      ? list.filter(
          (v) => typeof v === 'string' && (vocabulary ? vocabulary.includes(v) : v.trim()),
        )
      : [];
  return {
    skills: keep(source.skills, SKILL_IDS),
    saves: keep(source.saves, ABILITY_SCORES),
    expertise: keep(source.expertise, SKILL_IDS),
    armor: /** @type {import('../types/class.js').ArmorProficiency[]} */ (
      keep(source.armor, ARMOR_PROFICIENCIES)
    ),
    tools: keep(source.tools),
    languages: keep(source.languages),
  };
}

/**
 * The grant lists with every empty list dropped, or null when every list is
 * empty. This is the form a record stores.
 * @param {Required<FeatGrants>} grants
 * @returns {FeatGrants | null}
 */
export function compactGrants(grants) {
  /** @type {FeatGrants} */
  const compact = {};
  for (const key of GRANT_KEYS) {
    if (grants[key].length > 0) compact[key] = /** @type {never} */ (grants[key]);
  }
  return Object.keys(compact).length > 0 ? compact : null;
}

/**
 * The lists of grants that a merge actually added over what the character
 * had, or null when it added nothing.
 * @param {Proficiencies} merged
 * @param {Proficiencies} before
 * @returns {FeatGrants | null}
 */
export function grantDiff(merged, before) {
  /** @param {GrantKey} key */
  const added = (key) => merged[key].filter((entry) => !before[key].includes(entry));
  return compactGrants({
    skills: added('skills'),
    saves: added('saves'),
    expertise: added('expertise'),
    armor: /** @type {import('../types/class.js').ArmorProficiency[]} */ (added('armor')),
    tools: added('tools'),
    languages: added('languages'),
  });
}

/**
 * The proficiencies with the wanted grants merged in and normalized. An
 * expertise entry survives only on a skill the merged lists hold.
 * @param {Proficiencies} before
 * @param {Required<FeatGrants>[]} wanted
 * @returns {Proficiencies}
 */
export function mergeGrants(before, wanted) {
  /** @param {GrantKey} key */
  const joined = (key) => [...before[key], ...wanted.flatMap((grants) => grants[key])];
  return normalizeProficiencies({
    ...before,
    skills: joined('skills'),
    saves: joined('saves'),
    expertise: joined('expertise'),
    armor: joined('armor'),
    tools: joined('tools'),
    languages: joined('languages'),
  });
}

/**
 * Every grant record the character holds: each feat in the ASI choices and
 * each claimed class feature. An ability-increase choice carries no grant
 * and is left out. The records come back by reference, so a caller can
 * exclude one by identity.
 * @param {Character} character
 * @returns {GrantRecord[]}
 */
export function grantRecords(character) {
  const feats = Object.values(character.asiChoices ?? {}).filter(
    (choice) => choice.type === 'feat',
  );
  return [...feats, ...Object.values(character.featureChoices ?? {})];
}

/**
 * The character with the `excluded` grant record undone. The base is the
 * current lists minus every entry any record added. The requests of every
 * other record then merge back on top, feats first and then class features,
 * each in its recorded order. Each record that stays is stamped again with
 * what it added during that replay, so the next undo reads accurate diffs.
 * A record that had no `requested` list gets one from its old `granted`
 * list, so its request survives the restamp. The excluded record leaves
 * whichever map held it. A map the character never had stays absent. This
 * function is pure.
 * @param {Character} character
 * @param {GrantRecord} excluded
 * @returns {Character}
 */
export function rebuildGrants(character, excluded) {
  const records = grantRecords(character);
  const current = getProficiencies(character);
  /** @param {GrantKey} key */
  const base = (key) => {
    const added = records.flatMap((record) => record.granted?.[key] ?? []);
    return current[key].filter((entry) => !added.includes(entry));
  };
  // Normalizing the base prunes an expertise that another writer stacked on
  // a skill a record granted, so the expertise cannot outlive the skill.
  let lists = normalizeProficiencies({
    ...current,
    skills: base('skills'),
    saves: base('saves'),
    expertise: base('expertise'),
    armor: base('armor'),
    tools: base('tools'),
    languages: base('languages'),
  });
  /**
   * @template {GrantRecord} R
   * @param {R} record
   * @returns {R}
   */
  const restamp = (record) => {
    const requested = record.requested ?? record.granted;
    const merged = mergeGrants(lists, [requestedGrants(requested)]);
    const granted = grantDiff(merged, lists);
    lists = merged;
    const rest = { ...record };
    delete rest.granted;
    return { ...rest, ...(requested ? { requested } : {}), ...(granted ? { granted } : {}) };
  };
  const next = { ...character };
  if (character.asiChoices) {
    next.asiChoices = replay(character.asiChoices, excluded, (choice) =>
      choice.type === 'feat' ? restamp(choice) : choice,
    );
  }
  if (character.featureChoices) {
    next.featureChoices = replay(character.featureChoices, excluded, restamp);
  }
  return { ...next, proficiencies: lists };
}

/**
 * Walk a choice map in recorded order, drop the excluded record, and rebuild
 * the map from what `visit` returns for each of the others.
 * @template {{ order: number }} C
 * @param {Record<string, C>} choices
 * @param {object} excluded
 * @param {(choice: C) => C} visit
 * @returns {Record<string, C>}
 */
function replay(choices, excluded, visit) {
  /** @type {Record<string, C>} */
  const next = {};
  const entries = Object.entries(choices).sort(([, a], [, b]) => a.order - b.order);
  for (const [key, choice] of entries) {
    if (choice !== excluded) next[key] = visit(choice);
  }
  return next;
}
