import { createCharacter, withHP } from '../entities/Character.js';
import { withClasses } from '../entities/Multiclass.js';
import { withRace, withCustomRace, getRace, RACE_LIST } from '../entities/Races.js';
import { withBackground, getBackground, BACKGROUND_LIST } from '../entities/Backgrounds.js';
import { getClass, isCasterClass, CLASS_LIST } from '../entities/Classes.js';
import { assembleProficiencies, withProficiencies } from '../entities/Proficiencies.js';
import { withHitDice } from '../entities/HitDice.js';
import { withSpellSlots } from '../entities/SpellSlots.js';
import { abilityModifier, ABILITY_SCORES } from '../entities/Modifiers.js';
import { skillName, SKILL_IDS } from '../data/skills.js';
import { slugId } from '../entities/Roster.js';
import { statFields, readStats } from './statFields.js';
import {
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  pointBuyRemaining,
  isStandardArray,
  repairStandardArray,
  rollScores,
} from '../entities/StatGen.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../ui/Modal.js').ModalField} ModalField */

/**
 * The "New character" dialog's fields and the pure builder that turns its
 * submitted values into a level 1 character: race (catalog pick or hand-typed),
 * background, class, ability scores, the class's skill picks, the background's
 * bonus languages, and a class-derived max HP. The field list and the builder
 * are both DOM-free so the assembly is unit-testable; partyWiring supplies the
 * modal around them.
 */

/** @param {{ id: string, name: string }[]} defs @param {string} noneLabel */
function catalogOptions(defs, noneLabel) {
  return [{ value: '', label: noneLabel }, ...defs.map((d) => ({ value: d.id, label: d.name }))];
}

/**
 * The class's skill-choice list; an empty `from` means "choose from any
 * skill" (e.g. the bard).
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

/**
 * The default max HP for the form's current class / CON / race picks: a full
 * hit die plus the CON modifier (race increase included) at level 1, or 10 for
 * the classless.
 * @param {string} classId
 * @param {number} con
 * @param {string} raceId
 * @returns {number}
 */
export function defaultMaxHP(classId, con, raceId) {
  const def = getClass(classId);
  if (!def) return 10;
  const raceCON = getRace(raceId)?.abilityIncreases.CON ?? 0;
  return Math.max(1, def.hitDie + abilityModifier(con + raceCON));
}

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
    { name: 'reroll', label: 'Reroll scores', type: 'button', disabled: true },
    ...statFields(ABILITY_SCORES, Object.fromEntries(ABILITY_SCORES.map((key) => [key, 8]))),
    { name: 'maxHP', label: 'Max HP', type: 'number', value: 10, min: 1 },
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
 *   setLabel: (name: string, text: string) => void }} FormHandle */

/** @param {FormHandle} form @returns {Record<string, number>} the six typed scores */
function readFormScores(form) {
  return Object.fromEntries(ABILITY_SCORES.map((key) => [key, Number(form.get(`stat-${key}`))]));
}

/**
 * The ability-scores caption for the current method and scores: point buy
 * tracks the budget live, standard array flags a broken assignment. Purely
 * advisory — the Custom method is always available, so nothing hard-blocks.
 * @param {string} method
 * @param {Record<string, number>} scores
 * @returns {string}
 */
function statMethodCaption(method, scores) {
  if (method === 'point-buy') {
    const left = pointBuyRemaining(scores);
    if (left === null) return 'Ability scores (point buy uses 8-15)';
    const points = (/** @type {number} */ n) => `${n} point${n === 1 ? '' : 's'}`;
    return left < 0
      ? `Ability scores (${points(-left)} over budget)`
      : `Ability scores (${points(left)} left)`;
  }
  if (method === 'standard-array' && !isStandardArray(scores)) {
    return `Ability scores (use ${STANDARD_ARRAY.join(', ')} once each)`;
  }
  return 'Ability scores';
}

/**
 * Stamp the scores a freshly picked generation method starts from: point buy
 * begins at all 8s, the standard array lands in stat order, a roll (or a
 * reroll) draws 4d6-drop-lowest per score. Custom keeps whatever is typed.
 * @param {FormHandle} form
 * @param {() => number} rng
 */
function applyStatMethod(form, rng) {
  const method = form.get('statMethod');
  form.setDisabled('reroll', method !== 'roll');
  const stamp =
    method === 'point-buy'
      ? Object.fromEntries(ABILITY_SCORES.map((key) => [key, 8]))
      : method === 'standard-array'
        ? Object.fromEntries(ABILITY_SCORES.map((key, i) => [key, STANDARD_ARRAY[i]]))
        : method === 'roll'
          ? rollScores(ABILITY_SCORES, rng)
          : null;
  if (stamp) for (const key of ABILITY_SCORES) form.set(`stat-${key}`, stamp[key]);
  form.setLabel('statMethod', statMethodCaption(method, stamp ?? readFormScores(form)));
}

/**
 * Keep the dependent fields in step as the form is edited: a race pick locks
 * the custom-race entry, the class pick refilters the skill multiselect to
 * that class's choices (capped and captioned at its pick count), the stat
 * method stamps its starting scores (and under standard array an edited score
 * swaps with the one it duplicates), and any change that can move CON
 * re-stamps the max HP default.
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
  if (name.startsWith('stat-')) {
    const method = form.get('statMethod');
    let scores = readFormScores(form);
    if (method === 'standard-array') {
      const repaired = repairStandardArray(scores, name.slice('stat-'.length));
      for (const key of ABILITY_SCORES) {
        if (repaired[key] !== scores[key]) form.set(`stat-${key}`, repaired[key]);
      }
      scores = repaired;
    }
    form.setLabel('statMethod', statMethodCaption(method, scores));
  }
  if (
    name === 'class' ||
    name === 'race' ||
    name.startsWith('stat-') ||
    name === 'statMethod' ||
    name === 'reroll'
  ) {
    form.set(
      'maxHP',
      defaultMaxHP(form.get('class'), Number(form.get('stat-CON')) || 10, form.get('race')),
    );
  }
}

/**
 * Build the level 1 character the submitted dialog values describe. The race
 * pick applies its ability increases on top of the typed scores (a custom race
 * is just the display string); skill picks are filtered to the class's choice
 * list and capped at its count, bonus languages at the background's count. The
 * proficiency lists assemble from class + race + background plus those picks,
 * the HP pool takes the form's max, a classed character gets hit dice, and a
 * caster its spell slots. Pure.
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
    const stats = { ...character.stats };
    for (const [key, gain] of Object.entries(race.abilityIncreases)) {
      stats[key] = (stats[key] ?? 10) + gain;
    }
    character = { ...character, stats };
  } else if (values.customRace.trim()) {
    character = withCustomRace(character, values.customRace.trim());
  }

  if (values.background) character = withBackground(character, values.background);
  const classDef = getClass(values.class);
  if (classDef) character = withClasses(character, [{ classId: classDef.id, level: 1 }]);

  const choice = classDef?.skillChoice;
  const from = skillChoiceList(classDef?.id);
  const skills = values.skills
    .split(',')
    .filter((id) => from.includes(id))
    .slice(0, choice?.choose ?? 0);
  const languages = values.languages
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, getBackground(values.background)?.languageCount ?? 0);
  character = withProficiencies(character, assembleProficiencies(character, { skills, languages }));

  const maxHP = Math.max(
    1,
    Number(values.maxHP) || defaultMaxHP(values.class, character.stats.CON, ''),
  );
  character = withHP(character, maxHP);
  if (classDef) character = withHitDice(character);
  if (isCasterClass(classDef?.id)) character = withSpellSlots(character);
  return character;
}
