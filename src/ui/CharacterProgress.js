import { promptModal } from './Modal.js';
import { textButton } from './buttons.js';
import { classNames, el } from './dom.js';
import { getClass } from '../entities/Classes.js';
import { getClasses, pendingLevels, classLevelOf } from '../entities/Multiclass.js';
import { assignLevel, assignOptions, className } from '../entities/LevelAssign.js';
import {
  pendingASISlots,
  listASIChoices,
  unlockedFeatures,
  featuresGained,
} from '../entities/LevelUp.js';
import { getProficiencies } from '../entities/Proficiencies.js';
import { applyASI, takeFeat, undoLastChoice, withProficiencies } from '../entities/Progression.js';
import { getHitDicePools, hitDieOfPool, spendHitDie } from '../entities/HitDice.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { SKILL_IDS, skillName } from '../data/skills.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The character sheet's progression section: the class list, the pending-level
 * assignment flow (a multiclass character's XP levels wait here until spent),
 * pending ability-score improvements (apply an increase, take a feat, undo the
 * last choice), the unlocked class features, and the hit-dice pools with their
 * short-rest spend. All rule logic lives in the entity modules (LevelAssign,
 * LevelUp, HitDice); this is DOM wiring over them, verified visually.
 */

/**
 * Follow up a newly taken class with its multiclass skill pick, when the
 * class's reduced grant includes one. Skills already held are excluded;
 * cancelling (or nothing left to pick) keeps the assignment without a skill.
 * @param {Character} character
 * @param {string} classId
 * @returns {Promise<Character>}
 */
async function pickMulticlassSkill(character, classId) {
  const choice = getClass(classId)?.multiclassGrant.skillChoice;
  if (!choice) return character;
  const p = getProficiencies(character);
  const pool = choice.from.length > 0 ? choice.from : SKILL_IDS;
  const from = pool.filter((id) => !p.skills.includes(id));
  if (from.length === 0) return character;
  const values = await promptModal(
    `${className(classId)} skill`,
    [
      {
        name: 'skills',
        label: `Choose ${choice.choose}`,
        type: 'multiselect',
        options: from.map((id) => ({ value: id, label: skillName(id) })),
        max: choice.choose,
        value: '',
      },
    ],
    { submitLabel: 'Choose' },
  );
  const picked = values ? values.skills.split(',').filter(Boolean).slice(0, choice.choose) : [];
  if (picked.length === 0) return character;
  return withProficiencies(character, { ...p, skills: [...p.skills, ...picked] });
}

/**
 * Build the progression section, or null when the character has nothing
 * progression-shaped (a classless character without hit-dice pools).
 *
 * The section is laid out from the character as it is at build time, but every
 * action reads `getCharacter()` again when it fires. The sheet keeps this DOM
 * across changes it can write in place, so a hit-die spend that healed against a
 * build-time snapshot would undo whatever the HP bar has done since.
 * @param {() => Character} getCharacter
 * @param {{
 *   editBase: boolean,
 *   play: boolean,
 *   onCommit: (character: Character) => void,
 *   notify: (message: string) => void,
 * }} opts `editBase` gates the level/ASI/feat choices (they change the base
 *   character), `play` the hit-die spend; `notify` surfaces roll results and
 *   dead-end explanations as toasts.
 * @returns {HTMLElement | null}
 */
export function buildProgressSection(getCharacter, opts) {
  const character = getCharacter();
  const classes = getClasses(character);
  const hitDice = getHitDicePools(character);
  if (classes.length === 0 && hitDice.length === 0) return null;

  const section = el(
    'div',
    'character-sheet__progress u-col u-g2',
    el('span', 'section-label', 'Progression'),
  );

  /** @param {string} [cls] @returns {HTMLElement} */
  const addRow = (cls) =>
    section.appendChild(
      el('div', classNames(['character-sheet__progress-row u-row u-g2 u-muted', cls])),
    );
  /** @param {HTMLElement} row @param {string} text */
  const addText = (row, text) => {
    row.appendChild(el('span', 'character-sheet__progress-text', text));
  };

  if (classes.length > 0) {
    const line = classes
      .map((ref) => {
        const subclass = ref.subclass ? ` (${ref.subclass})` : '';
        return `${className(ref.classId)} ${ref.level}${subclass}`;
      })
      .join(' / ');
    addText(addRow('character-sheet__classes'), line);
  }

  async function runAssign() {
    const options = assignOptions(getCharacter());
    const first = options.find((option) => !option.disabled);
    if (!first) {
      opts.notify('No class assignment is available.');
      return;
    }
    const values = await promptModal(
      'Assign a level',
      [{ name: 'class', label: 'Class', type: 'select', options, value: first.value }],
      { submitLabel: 'Assign' },
    );
    if (!values) return;
    // Read again after the dialog: it was open long enough for the sheet's HP
    // or slots to move underneath it.
    const from = getCharacter();
    const isNew = classLevelOf(from, values.class) === 0;
    let next = assignLevel(from, values.class);
    if (next === from) return;
    if (isNew) next = await pickMulticlassSkill(next, values.class);
    const gained = featuresGained(next, from);
    const gainedText = gained.length > 0 ? ` New: ${gained.map((f) => f.name).join(', ')}.` : '';
    opts.notify(
      `${from.name} takes ${className(values.class)} ` +
        `${classLevelOf(next, values.class)}.${gainedText}`,
    );
    opts.onCommit(next);
  }

  const pending = pendingLevels(character);
  const assignable = assignOptions(character).some((option) => !option.disabled);
  if (pending > 0 || (opts.editBase && assignable)) {
    const row = addRow();
    if (pending > 0) {
      addText(row, `${pending} level${pending === 1 ? '' : 's'} to assign`);
    }
    if (opts.editBase) {
      row.appendChild(textButton(pending > 0 ? 'Assign level' : 'Add a class', runAssign));
    }
  }

  async function runASI() {
    const abilityOptions = ABILITY_SCORES.map((key) => ({ value: key, label: key }));
    const values = await promptModal(
      'Ability score improvement',
      [
        { name: 'first', label: '+1 to', type: 'select', options: abilityOptions },
        {
          name: 'second',
          label: 'and +1 to (the same ability for +2)',
          type: 'select',
          options: abilityOptions,
        },
      ],
      { submitLabel: 'Apply' },
    );
    if (!values) return;
    /** @type {Record<string, number>} */
    const increases = {};
    increases[values.first] = 1;
    increases[values.second] = (increases[values.second] ?? 0) + 1;
    const from = getCharacter();
    const next = applyASI(from, increases);
    if (next === from) {
      opts.notify('That improvement is not valid: ability scores cap at 20.');
      return;
    }
    opts.onCommit(next);
  }

  async function runFeat() {
    const values = await promptModal(
      'Take a feat',
      [{ name: 'feat', label: 'Feat name', type: 'text', value: '' }],
      { submitLabel: 'Take feat' },
    );
    if (!values) return;
    const from = getCharacter();
    const next = takeFeat(from, values.feat);
    if (next !== from) opts.onCommit(next);
  }

  const slots = pendingASISlots(character);
  if (slots.length > 0) {
    const row = addRow();
    const [first] = slots;
    const where = `${className(first.classId)} ${first.classLevel}`;
    addText(row, `${slots.length} improvement${slots.length === 1 ? '' : 's'} pending (${where})`);
    if (opts.editBase) {
      row.append(textButton('+2 ability', runASI), textButton('Take feat', runFeat));
    }
  }

  const choices = listASIChoices(character);
  if (choices.length > 0) {
    const row = addRow();
    const line = choices
      .map((choice) => {
        const at = `${className(choice.classId)} ${choice.classLevel}`;
        if (choice.type === 'feat') return `${at}: ${choice.feat}`;
        const parts = Object.entries(choice.increases)
          .filter(([, v]) => v !== 0)
          .map(([key, v]) => `+${v} ${key}`)
          .join(', ');
        return `${at}: ${parts}`;
      })
      .join(' · ');
    addText(row, line);
    if (opts.editBase) {
      row.appendChild(
        textButton('Undo', () => opts.onCommit(undoLastChoice(getCharacter())), {
          ariaLabel: 'Undo the last improvement choice',
        }),
      );
    }
  }

  const features = unlockedFeatures(character);
  if (features.length > 0) {
    section.appendChild(
      el(
        'details',
        'character-sheet__features u-muted',
        el('summary', '', `Class features (${features.length})`),
        el(
          'ul',
          'u-col u-g1',
          ...features.map((feature) =>
            el('li', '', `${feature.name} — ${className(feature.classId)} ${feature.level}`),
          ),
        ),
      ),
    );
  }

  for (const pool of hitDice) {
    const row = addRow();
    addText(row, `${pool.name} ${pool.current}/${pool.max}`);
    if (opts.play && pool.current > 0) {
      row.appendChild(
        textButton(
          'Spend',
          () => {
            const from = getCharacter();
            const result = spendHitDie(from, hitDieOfPool(pool));
            if (result.character === from) return;
            opts.notify(
              `${from.name} spends a hit die: rolled ${result.rolled}, ` +
                `healed ${result.healed} HP.`,
            );
            opts.onCommit(result.character);
          },
          { ariaLabel: `Spend one ${pool.name} for healing` },
        ),
      );
    }
  }

  return section;
}
