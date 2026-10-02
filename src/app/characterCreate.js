import { createCharacter, withHP } from '../entities/Character.js';
import {
  withClasses,
  withRace,
  withCustomRace,
  withProficiencies,
} from '../entities/Progression.js';
import { getRace, RACE_LIST } from '../entities/Races.js';
import { withBackground, getBackground, BACKGROUND_LIST } from '../entities/Backgrounds.js';
import { getClass, isCasterClass, CLASS_LIST } from '../entities/Classes.js';
import { assembleProficiencies } from '../entities/Proficiencies.js';
import { classMaxHP, withHitDice } from '../entities/HitDice.js';
import { withSpellSlots } from '../entities/SpellSlots.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { skillName, SKILL_IDS } from '../data/skills.js';
import { slugId } from '../entities/Roster.js';
import { splitList, splitTrimmedList } from '../util/text.js';
import { statFields, readStats } from './statFields.js';
import {
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  pointBuyRemaining,
  rollScores,
} from '../entities/StatGen.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/modal.js').ModalField} ModalField */

/**
 * This module defines the fields for the New Character dialog and the pure
 * builder that turns submitted values into a level 1 character. The
 * character gets a race (a catalog pick or a hand-typed name), a background,
 * a class, ability scores, the class's skill picks, the background's bonus
 * languages, and a class-derived max HP.
 * The field list and the builder are both free of DOM code, so the assembly
 * is unit-testable. partyWiring supplies the modal around them.
 */

/** @param {{ id: string, name: string }[]} defs @param {string} noneLabel */
function catalogOptions(defs, noneLabel) {
  return [{ value: '', label: noneLabel }, ...defs.map((d) => ({ value: d.id, label: d.name }))];
}

/**
 * The class's skill-choice list. An empty `from` list means the class can
 * choose from any skill, for example the bard.
 * @param {string | undefined} classId
 * @returns {string[]}
 */
function skillChoiceList(classId) {
  const choice = getClass(classId)?.skillChoice;
  if (!choice) return [];
  return choice.from.length ? choice.from : SKILL_IDS;
}

/** @param {string | undefined} classId @returns {{ value: string, label: string }[]} */
function skillOptions(classId) {
  return skillChoiceList(classId).map((id) => ({ value: id, label: skillName(id) }));
}

/** The HP a classless character starts with. This character has no hit die to derive HP from. */
const CLASSLESS_MAX_HP = 10;

/** @returns {ModalField[]} the New character dialog's fields */
export function characterFields() {
  return [
    { name: 'name', label: 'Name', value: '' },
    {
      name: 'race',
      label: 'Race',
      type: 'select',
      value: '',
      options: catalogOptions(RACE_LIST, 'Custom (type below)'),
    },
    { name: 'customRace', label: 'Custom race', value: '' },
    {
      name: 'class',
      label: 'Class',
      type: 'select',
      value: '',
      options: catalogOptions(CLASS_LIST, 'None (no class)'),
    },
    {
      name: 'background',
      label: 'Background',
      type: 'select',
      value: '',
      options: catalogOptions(BACKGROUND_LIST, 'None'),
    },
    {
      name: 'statMethod',
      label: `Ability scores (${POINT_BUY_BUDGET} points left)`,
      type: 'select',
      value: 'point-buy',
      options: [
        { value: 'point-buy', label: 'Point buy' },
        { value: 'standard-array', label: 'Standard array' },
        { value: 'roll', label: 'Roll 4d6, drop lowest' },
        { value: 'custom', label: 'Custom scores' },
      ],
    },
    // The default method is point buy, so the stat inputs open with a range
    // limited to the buyable 8-15. applyStatMethod widens the range when
    // the method changes.
    ...statFields(ABILITY_SCORES, Object.fromEntries(ABILITY_SCORES.map((key) => [key, 8]))).map(
      (field) => ({ ...field, min: 8, max: 15 }),
    ),
    // The standard array method replaces the number inputs with this
    // assignment grid. The grid has one pill row per ability, and each
    // array value can go to at most one row. Pills start unassigned. A
    // click on a held pill frees it. A click on a value that another row
    // holds moves it there. This grid stays hidden under the other methods.
    // An unassigned ability submits at the array's floor of 8.
    {
      name: 'statPills',
      label: 'Assign each value to one ability',
      type: 'pillgrid',
      rows: ABILITY_SCORES.map((key) => ({ value: key, label: key })),
      options: STANDARD_ARRAY.map((v) => ({ value: String(v), label: String(v) })),
      value: '',
      full: true,
      hidden: true,
    },
    // This field shows only while the roll method is active, below the rolled scores.
    { name: 'reroll', label: 'Reroll scores', type: 'button', hidden: true },
    {
      name: 'skills',
      label: 'Class skills',
      type: 'multiselect',
      value: '',
      options: [],
      full: true,
      fixedHeight: true,
      emptyText: 'Pick a class to see its skill choices.',
    },
    {
      name: 'languages',
      label: 'Bonus languages (hit Enter to add)',
      type: 'tags',
      value: '',
      full: true,
    },
  ];
}

/** @typedef {{ get: (name: string) => string, set: (name: string, value: string | number) => void,
 *   setOptions: (name: string, options: { value: string, label: string }[], max?: number) => void,
 *   setDisabled: (name: string, disabled: boolean) => void,
 *   setLabel: (name: string, text: string) => void,
 *   setRange: (name: string, min?: number, max?: number) => void,
 *   setHidden: (name: string, hidden: boolean) => void }} FormHandle */

/** @param {FormHandle} form @returns {Record<string, number>} the six typed scores */
function readFormScores(form) {
  return Object.fromEntries(ABILITY_SCORES.map((key) => [key, Number(form.get(`stat-${key}`))]));
}

/**
 * Build the ability-scores caption for the current method and scores. The
 * point buy method tracks the remaining budget live, because the inputs
 * already keep the scores in range and under budget. The other methods
 * need no readout.
 * @param {string} method
 * @param {Record<string, number>} scores
 * @returns {string}
 */
function statMethodCaption(method, scores) {
  if (method === 'point-buy') {
    const left = pointBuyRemaining(scores);
    if (left === null) return 'Ability scores (point buy uses 8-15)';
    const points = (/** @type {number} */ n) => `${n} point${n === 1 ? '' : 's'}`;
    return `Ability scores (${points(left)} left)`;
  }
  return 'Ability scores';
}

/**
 * Stamp the starting scores for a freshly picked generation method. Point
 * buy begins at all 8s. The standard array lands in stat order. A roll, or
 * a reroll, draws 4d6 and drops the lowest die for each score. Custom keeps
 * whatever the GM already typed.
 * @param {FormHandle} form
 * @param {() => number} rng
 */
function applyStatMethod(form, rng) {
  const method = form.get('statMethod');
  form.setHidden('reroll', method !== 'roll');
  // The standard array method swaps the number inputs for the assignment
  // pill grid. Every other method shows the inputs. Point buy limits the
  // inputs to the buyable range of 8-15. The rest use the shared positive
  // floor. Rolled scores come from the dice: the inputs display them but
  // are not editable.
  form.setHidden('statPills', method !== 'standard-array');
  for (const key of ABILITY_SCORES) {
    form.setHidden(`stat-${key}`, method === 'standard-array');
    form.setDisabled(`stat-${key}`, method === 'roll');
    if (method === 'point-buy') form.setRange(`stat-${key}`, 8, 15);
    else form.setRange(`stat-${key}`, 1, undefined);
  }
  if (method === 'standard-array') form.set('statPills', '');
  // Point buy starts at all 8s. Standard array starts unassigned, and the
  // hidden inputs also record 8s until the GM places the pills. Custom
  // keeps whatever is typed.
  const stamp =
    method === 'roll'
      ? rollScores(ABILITY_SCORES, rng)
      : method === 'custom'
        ? null
        : Object.fromEntries(ABILITY_SCORES.map((key) => [key, 8]));
  if (stamp) for (const key of ABILITY_SCORES) form.set(`stat-${key}`, stamp[key]);
  form.setLabel('statMethod', statMethodCaption(method, stamp ?? readFormScores(form)));
}

/**
 * Keep the dependent fields in step as the GM edits the form. A race pick
 * locks the custom-race entry. A class pick refilters the skill multiselect
 * to that class's choices, capped and captioned at its pick count. The stat
 * method stamps its starting scores: the standard array through the pill
 * grid, and point buy under a hard budget.
 * @param {string} name the changed field
 * @param {FormHandle} form
 * @param {() => number} [rng]
 */
export function characterFormChange(name, form, rng = Math.random) {
  if (name === 'race') form.setDisabled('customRace', form.get('race') !== '');
  if (name === 'class') {
    const choice = getClass(form.get('class'))?.skillChoice;
    form.setOptions('skills', skillOptions(form.get('class')), choice?.choose ?? 0);
    form.setLabel('skills', choice ? `Class skills (choose ${choice.choose})` : 'Class skills');
  }
  if (name === 'statMethod' || name === 'reroll') applyStatMethod(form, rng);
  if (name === 'statPills') {
    // The pill grid is the visible control under standard array. The
    // hidden number inputs stay the submitted source of truth, so this
    // copies the assignment through. An unassigned ability gets the
    // array's floor value.
    const assigned = Object.fromEntries(
      splitList(form.get('statPills')).map((pair) => pair.split(':')),
    );
    for (const key of ABILITY_SCORES) form.set(`stat-${key}`, assigned[key] ?? 8);
  }
  if (name.startsWith('stat-')) {
    const method = form.get('statMethod');
    const scores = readFormScores(form);
    if (method === 'point-buy') {
      // The budget is a hard limit. An edit that overspends walks the
      // value back down until it fits. The GM must free points elsewhere
      // first.
      const key = name.slice('stat-'.length);
      while (scores[key] > 8 && (pointBuyRemaining(scores) ?? 0) < 0) {
        scores[key] -= 1;
        form.set(name, scores[key]);
      }
    }
    form.setLabel('statMethod', statMethodCaption(method, scores));
  }
}

/**
 * Build the level 1 character that the submitted dialog values describe.
 * Assigning the race adds its ability increases to the typed scores. A
 * custom race is only a display string, with no ability increases.
 * Skill picks are filtered to the class's choice list and capped at its
 * count. Bonus languages are capped at the background's count. The
 * proficiency lists assemble from class, race, background, and those picks.
 * The HP pool derives from the class hit die and CON. A classed character
 * gets hit dice, and a caster gets spell slots. This function is pure.
 * @param {Record<string, string>} values
 * @param {string[]} existingIds roster ids the new character's id must avoid
 * @returns {Character}
 */
export function buildCharacter(values, existingIds) {
  const name = values.name.trim();
  let character = createCharacter(
    slugId(name, existingIds),
    name,
    readStats(ABILITY_SCORES, values),
  );

  const race = getRace(values.race);
  if (race) {
    character = withRace(character, race.id);
  } else if (values.customRace.trim()) {
    character = withCustomRace(character, values.customRace.trim());
  }

  if (values.background) character = withBackground(character, values.background);
  const classDef = getClass(values.class);
  if (classDef) character = withClasses(character, [{ classId: classDef.id, level: 1 }]);

  const choice = classDef?.skillChoice;
  const from = skillChoiceList(classDef?.id);
  const skills = splitList(values.skills)
    .filter((id) => from.includes(id))
    .slice(0, choice?.choose ?? 0);
  const languages = splitTrimmedList(values.languages).slice(
    0,
    getBackground(values.background)?.languageCount ?? 0,
  );
  character = withProficiencies(character, assembleProficiencies(character, { skills, languages }));

  // Max HP is fully derived, not asked for, by the same rule that governs
  // it from here on. classMaxHP reads the character as assembled, with the
  // race's ability increases already folded into the stats.
  character = withHP(character, classMaxHP(character) ?? CLASSLESS_MAX_HP);
  if (classDef) character = withHitDice(character);
  if (isCasterClass(classDef?.id)) character = withSpellSlots(character);
  return character;
}
