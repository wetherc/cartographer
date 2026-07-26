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
    ...statFields(ABILITY_SCORES),
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

/**
 * Keep the dependent fields in step as the form is edited: a race pick locks
 * the custom-race entry, the class pick refilters the skill multiselect to
 * that class's choices (capped and captioned at its pick count), and a class,
 * CON, or race change re-stamps the max HP default.
 * @param {string} name the changed field
 * @param {{ get: (name: string) => string, set: (name: string, value: string | number) => void,
 *   setOptions: (name: string, options: { value: string, label: string }[], max?: number) => void,
 *   setDisabled: (name: string, disabled: boolean) => void,
 *   setLabel: (name: string, text: string) => void }} form
 */
export function characterFormChange(name, form) {
  if (name === 'race') form.setDisabled('customRace', form.get('race') !== '');
  if (name === 'class') {
    const choice = getClass(form.get('class'))?.skillChoice;
    form.setOptions('skills', skillOptions(form.get('class')), choice?.choose ?? 0);
    form.setLabel('skills', choice ? `Class skills (choose ${choice.choose})` : 'Class skills');
  }
  if (name === 'class' || name === 'stat-CON' || name === 'race') {
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
