import { getClass, featureEntry } from './Classes.js';
import { getClasses } from './Multiclass.js';
import { subclassDef } from './ClassCasting.js';
import { ABILITY_SCORES } from './Modifiers.js';
import { claimGrants, nextOrder, rebuildGrants } from './GrantLedger.js';
import { memoizeByIdentity } from '../util/memoize.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').AsiChoice} AsiChoice */
/** @typedef {import('../types/entities.js').AsiChoices} AsiChoices */
/** @typedef {import('../types/entities.js').LegacyAsiChoice} LegacyAsiChoice */
/** @typedef {import('../types/feat.js').FeatStamp} FeatStamp */
/** @typedef {import('../types/feat.js').FeatGrants} FeatGrants */
/** @typedef {{ classId: string, classLevel: number }} AsiSlot */
/** @typedef {{ classId: string, level: number, name: string, effects?: import('../types/class.js').ClassFeatureEffect[] }} UnlockedFeature */

/**
 * Ability-score improvements and level-gated features are both derived from
 * the class definitions instead of stored. Each class follows its own ASI
 * schedule. Reaching one of a class's ASI levels earns one choice slot, keyed
 * by that class and class level. A slot stays pending until the character
 * records a choice, an ability increase or a feat, against it in
 * `asiChoices`. Features are pure derivation too. The class list fully
 * determines them, so leveling up stores nothing. The accessors here read
 * the current state on demand.
 */

/** The 5e limit for an ability score. An improvement cannot raise a score above this value. */
export const ABILITY_MAX = 20;

/** @param {Character} character @returns {AsiChoices} the choices by slot key */
export function getASIChoices(character) {
  return character.asiChoices ?? {};
}

/**
 * The choices a character has made, oldest first. The stored record has no
 * order of its own, so this function sorts by the `order` value each choice
 * carries.
 * @param {Character} character
 * @returns {AsiChoice[]}
 */
export function listASIChoices(character) {
  return Object.values(getASIChoices(character)).sort((a, b) => a.order - b.order);
}

/**
 * This is the key that stores an ASI slot's choice. The key joins the class
 * and the class level that earned the slot, with a separator that no class
 * id can contain. One place builds the key, so a slot and the choice that
 * claims it can never disagree about what identifies them.
 * @param {AsiSlot | AsiChoice} slot
 * @returns {string}
 */
export function slotKey(slot) {
  return `${slot.classId}\u0000${slot.classLevel}`;
}

/**
 * The ASI slots that the class list has earned. For each class, the
 * character earns one slot per schedule level at or below that class's
 * assigned level. The order is class-list order, then ascending class
 * level. An unknown class or a pending, unassigned level earns nothing. The
 * result is empty for a classless character.
 * @param {Character} character
 * @returns {AsiSlot[]}
 */
export function earnedASISlots(character) {
  /** @type {AsiSlot[]} */
  const slots = [];
  for (const ref of getClasses(character)) {
    const def = getClass(ref.classId);
    if (!def) continue;
    const level = Math.max(1, Math.floor(ref.level) || 1);
    for (const classLevel of def.asiLevels) {
      if (classLevel <= level) slots.push({ classId: ref.classId, classLevel });
    }
  }
  return slots;
}

/**
 * The earned ASI slots not yet claimed by a recorded choice, in earned order.
 * @param {Character} character
 * @returns {AsiSlot[]}
 */
export function pendingASISlots(character) {
  const claimed = getASIChoices(character);
  return earnedASISlots(character).filter((slot) => claimed[slotKey(slot)] === undefined);
}

/**
 * Convert an older save's ASI choice array to the record keyed by slot. The
 * function accepts both array shapes. An entry without a class id is
 * pre-multiclass, and the function attributes it to the primary class at
 * that class level. Every entry takes its position in the array as its
 * `order` value. A value that is already a record returns unchanged, with
 * identity preserved.
 * @param {AsiChoices | LegacyAsiChoice[]} choices
 * @param {string} primaryClassId
 * @returns {AsiChoices}
 */
export function migrateASIChoices(choices, primaryClassId) {
  if (!Array.isArray(choices)) return choices;
  /** @type {AsiChoices} */
  const record = {};
  choices.forEach((choice, order) => {
    const slot =
      'classId' in choice
        ? { classId: choice.classId, classLevel: choice.classLevel }
        : { classId: primaryClassId, classLevel: choice.level };
    record[slotKey(slot)] =
      choice.type === 'asi'
        ? { ...slot, order, type: 'asi', increases: choice.increases }
        : { ...slot, order, type: 'feat', feat: choice.feat };
  });
  return record;
}

/**
 * Whether an increase map is a legal ability-score improvement for this
 * character. The map must use known abilities only, with whole positive
 * points that total exactly 2. No score can rise past 20.
 * @param {Character} character
 * @param {Record<string, number>} increases
 * @returns {boolean}
 */
export function isValidASI(character, increases) {
  const entries = Object.entries(increases).filter(([, v]) => v !== 0);
  if (entries.length === 0) return false;
  let total = 0;
  for (const [key, value] of entries) {
    if (!ABILITY_SCORES.includes(key)) return false;
    if (!Number.isInteger(value) || value < 1) return false;
    if ((character.stats?.[key] ?? 10) + value > ABILITY_MAX) return false;
    total += value;
  }
  return total === 2;
}

/**
 * Spend the first pending ASI slot on an ability increase. The increase is
 * +2 to one score or +1 to two scores, per `isValidASI`. The function
 * applies the increase to the stats and records the choice against the
 * slot's class and class level. A missing pending slot, or an invalid
 * increase, leaves the character unchanged. This function is pure.
 * @param {Character} character
 * @param {Record<string, number>} increases
 * @returns {Character}
 */
export function applyASI(character, increases) {
  const [slot] = pendingASISlots(character);
  if (slot === undefined || !isValidASI(character, increases)) return character;
  const stats = { ...character.stats };
  for (const [key, value] of Object.entries(increases)) {
    if (value !== 0) stats[key] = (stats[key] ?? 10) + value;
  }
  const choices = getASIChoices(character);
  const choice = {
    ...slot,
    order: nextOrder(choices),
    type: /** @type {const} */ ('asi'),
    increases: { ...increases },
  };
  return { ...character, stats, asiChoices: { ...choices, [slotKey(slot)]: choice } };
}

/**
 * The stamp's ability increases as a clean map, or null when they are not a
 * legal feat increase. Every key must be a known ability, every value a whole
 * positive point, and no score may rise past 20. Unlike an ASI there is no
 * required total: a plain feat carries no increase, and a half-feat carries
 * one point. An absent map reads as no increase.
 * @param {Character} character
 * @param {Record<string, number> | undefined} increases
 * @returns {Record<string, number> | null}
 */
function cleanIncreases(character, increases) {
  if (increases === undefined || increases === null) return {};
  /** @type {Record<string, number>} */
  const clean = {};
  for (const [key, value] of Object.entries(increases)) {
    if (value === 0) continue;
    if (!ABILITY_SCORES.includes(key)) return null;
    if (!Number.isInteger(value) || value < 1) return null;
    if ((character.stats?.[key] ?? 10) + value > ABILITY_MAX) return null;
    clean[key] = value;
  }
  return clean;
}

/**
 * Spend the first pending ASI slot on a feat instead of an ability increase.
 * The argument is a plain name for a feat with no modeled effects, or a
 * FeatStamp with the resolved picks of a catalog feat. The function applies
 * the increases to the stats, merges the grants into the proficiencies, and
 * records the choice with what it asked for and what it changed, so undo and
 * the sheet read the stamp rather than the live catalog. An expertise grant
 * survives only on a skill the character is proficient in after the skill
 * grants land. A missing pending slot, a blank name, or an illegal increase
 * leaves the character unchanged. This function is pure.
 * @param {Character} character
 * @param {string | FeatStamp} feat
 * @returns {Character}
 */
export function takeFeat(character, feat) {
  const [slot] = pendingASISlots(character);
  const stamp = typeof feat === 'string' ? { name: feat } : feat;
  const name = (stamp.name ?? '').trim();
  if (slot === undefined || name === '') return character;

  const increases = cleanIncreases(character, stamp.increases);
  if (increases === null) return character;
  let stats = character.stats;
  if (Object.keys(increases).length > 0) {
    stats = { ...character.stats };
    for (const [key, value] of Object.entries(increases)) {
      stats[key] = (stats[key] ?? 10) + value;
    }
  }

  const { proficiencies: merged, requested, granted, rider } = claimGrants(character, stamp);
  const hpPerLevel = Math.max(0, Math.floor(Number(stamp.hpPerLevel)) || 0);
  const initiativeBonus = Math.max(0, Math.floor(Number(stamp.initiativeBonus)) || 0);

  const choices = getASIChoices(character);
  /** @type {AsiChoice} */
  const choice = {
    ...slot,
    order: nextOrder(choices),
    type: /** @type {const} */ ('feat'),
    feat: name,
    ...(typeof stamp.featId === 'string' && stamp.featId ? { featId: stamp.featId } : {}),
    ...(Object.keys(increases).length > 0 ? { increases } : {}),
    ...(requested ? { requested } : {}),
    ...(granted ? { granted } : {}),
    ...(rider ? { rider } : {}),
    ...(hpPerLevel > 0 ? { hpPerLevel } : {}),
    ...(initiativeBonus > 0 ? { initiativeBonus } : {}),
    ...(stamp.concentrationAdvantage === true ? { concentrationAdvantage: true } : {}),
  };
  return {
    ...character,
    stats,
    ...(granted ? { proficiencies: merged } : {}),
    asiChoices: { ...choices, [slotKey(slot)]: choice },
  };
}

/**
 * Undo the most recent ASI choice and reopen its slot. An ability increase
 * is subtracted back out of the stats, whether an ASI or a half-feat applied
 * it. A feat's proficiencies are rebuilt without its record (see
 * `GrantLedger.rebuildGrants`), so a grant that another feat or a
 * class feature also asks for stays, and an expertise that rode a removed
 * skill prunes with it. A feat recorded before the stamp fields existed
 * carries none, so it is simply forgotten. No choices leaves the character
 * unchanged, with identity preserved. This function is pure.
 * @param {Character} character
 * @returns {Character}
 */
export function undoLastChoice(character) {
  const choices = getASIChoices(character);
  const ordered = listASIChoices(character);
  const last = ordered[ordered.length - 1];
  if (!last) return character;
  const rest = { ...choices };
  delete rest[slotKey(last)];
  /** @type {Character} */
  let next =
    last.type === 'feat' && last.granted
      ? rebuildGrants(character, last)
      : { ...character, asiChoices: rest };
  if (last.increases) {
    const stats = { ...character.stats };
    for (const [key, value] of Object.entries(last.increases)) {
      stats[key] = (stats[key] ?? 10) - value;
    }
    next = { ...next, stats };
  }
  return next;
}

/**
 * The features unlocked across the class list, as
 * `{ classId, level, name, effects? }` entries. The order is class-list
 * order, ascending by class level within a class. Each class contributes
 * the features at or below its assigned level. A pending level or an
 * unknown class contributes nothing. A catalog subclass adds its features
 * too. The result is empty for a classless
 * character. `effects` appears only on a feature that carries structured
 * effects in the catalog.
 *
 * This function is memoized on the character. The progression section
 * re-reads it on every sheet render, and `featuresGained` reads it twice per
 * level-up. The class catalog that it walks is static, so only the
 * character can change the answer. Treat the returned array as read-only,
 * because every caller shares it.
 */
export const unlockedFeatures = memoizeByIdentity(listUnlockedFeatures);

/**
 * @param {Character} character
 * @returns {UnlockedFeature[]}
 */
function listUnlockedFeatures(character) {
  /** @type {UnlockedFeature[]} */
  const features = [];
  for (const ref of getClasses(character)) {
    const def = getClass(ref.classId);
    if (!def) continue;
    const level = Math.max(1, Math.floor(ref.level) || 1);
    // A catalog subclass adds its own features after the class features of
    // the same level.
    const sub = subclassDef(ref.classId, ref.subclass)?.features ?? {};
    const entries = [...Object.entries(def.featuresByLevel), ...Object.entries(sub)]
      .map(([l, list]) => ({ level: Number(l), list }))
      .filter((entry) => entry.level <= level)
      .sort((a, b) => a.level - b.level);
    for (const entry of entries) {
      for (const raw of entry.list) {
        const { name, effects } = featureEntry(raw);
        features.push({
          classId: ref.classId,
          level: entry.level,
          name,
          ...(effects.length > 0 ? { effects } : {}),
        });
      }
    }
  }
  return features;
}

/**
 * The key that identifies one unlocked feature: its class, its level, and its
 * name, joined with a NUL separator that no class id or feature name contains.
 * @param {UnlockedFeature} feature
 * @returns {string}
 */
function featureKey(feature) {
  return `${feature.classId}\u0000${feature.level}\u0000${feature.name}`;
}

/**
 * The class features that the character has and that `before`, an earlier
 * snapshot of the same character, lacked. A level-up or class-assignment
 * announcement lists these features, with the same fields as `unlockedFeatures`.
 * @param {Character} character
 * @param {Character} before
 * @returns {UnlockedFeature[]}
 */
export function featuresGained(character, before) {
  const had = new Set(unlockedFeatures(before).map(featureKey));
  return unlockedFeatures(character).filter((f) => !had.has(featureKey(f)));
}
