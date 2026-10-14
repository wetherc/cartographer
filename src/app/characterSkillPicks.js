import { getRace } from '../entities/Races.js';
import { getBackground } from '../entities/Backgrounds.js';
import { getClass } from '../entities/Classes.js';
import { skillName, SKILL_IDS } from '../data/skills.js';
import { splitList } from '../util/text.js';

/**
 * The skill picks of the New character dialog: the class skill choices and
 * the race skill choices (the Half-Elf). A skill that the race or the
 * background already gives is left out of the picks, because the
 * proficiency lists drop duplicates and such a pick adds nothing.
 */

/**
 * @typedef {{ race?: string, raceSkills?: string, background?: string }} SkillSources
 */

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

/**
 * The skills that the race and the background already give, each mapped to
 * the name of its source: the race's fixed skills, the race skill picks
 * (the Half-Elf), and the background's two skills. A background skill
 * names the background when the race gives the same skill.
 * @param {SkillSources} values
 * @returns {Map<string, string>}
 */
export function grantedSkills(values) {
  /** @type {Map<string, string>} */
  const granted = new Map();
  const race = getRace(values.race);
  if (race) {
    const picks = race.skillChoice ? splitList(values.raceSkills ?? '') : [];
    for (const id of [...race.skills, ...picks]) granted.set(id, race.name);
  }
  const background = getBackground(values.background);
  if (background) for (const id of background.skills) granted.set(id, background.name);
  return granted;
}

/**
 * The class skill picks still open, with the race and background skills
 * left out.
 * @param {string | undefined} classId
 * @param {Map<string, string>} granted
 * @returns {string[]}
 */
export function openSkillChoices(classId, granted) {
  return skillChoiceList(classId).filter((id) => !granted.has(id));
}

/**
 * The caption of the class skill multiselect. It gives the pick count and
 * names each class skill that the list leaves out with its source, such as
 * "Class skills (choose 2). Insight and Religion come from Acolyte." One
 * source gives at most two skills (a background, or the two Half-Elf picks),
 * so the names join with "and".
 * @param {string | undefined} classId
 * @param {Map<string, string>} granted
 * @returns {string}
 */
export function classSkillCaption(classId, granted) {
  const choice = getClass(classId)?.skillChoice;
  if (!choice) return 'Class skills';
  /** @type {Map<string, string[]>} */
  const bySource = new Map();
  for (const id of skillChoiceList(classId)) {
    const source = granted.get(id);
    if (source === undefined) continue;
    bySource.set(source, [...(bySource.get(source) ?? []), skillName(id)]);
  }
  const notes = [...bySource].map(
    ([source, names]) =>
      ` ${names.join(' and ')} ${names.length > 1 ? 'come' : 'comes'} from ${source}.`,
  );
  const count = `Class skills (choose ${choice.choose})`;
  return notes.length > 0 ? `${count}.${notes.join('')}` : count;
}

/**
 * The options, pick count, and caption of the race skill multiselect. The
 * options leave out the skills of the chosen background.
 * @param {string} raceId
 * @param {string} [backgroundId]
 * @returns {{ options: { value: string, label: string }[], count: number, label: string }}
 */
export function raceSkillChoice(raceId, backgroundId) {
  const count = getRace(raceId)?.skillChoice?.count ?? 0;
  const taken = new Set(getBackground(backgroundId)?.skills ?? []);
  const options = count
    ? SKILL_IDS.filter((id) => !taken.has(id)).map((id) => ({ value: id, label: skillName(id) }))
    : [];
  return { options, count, label: `Race skills (choose ${count})` };
}
