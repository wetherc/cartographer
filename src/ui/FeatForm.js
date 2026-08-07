import { el } from './dom.js';
import { setTip } from './Tooltip.js';
import {
  labeled,
  fieldRow,
  checkbox,
  textField,
  numberField,
  textareaField,
  select,
  buildInlineForm,
} from './formFields.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { SKILL_IDS, skillName } from '../data/skills.js';
import { RIDER_ROLLS, DEFAULT_RIDER_DIE } from '../entities/Riders.js';
import { normalizeFeat } from '../library/Library.js';

/** @typedef {import('../types/feat.js').Feat} Feat */
/** @typedef {import('../types/feat.js').ProficiencyChoice} ProficiencyChoice */

/** The dice a rider can use, the same list the spell form offers. */
const RIDER_DICE = ['d4', 'd6', 'd8', 'd10', 'd12'];

/** The armor proficiencies a feat can grant. */
const ARMOR_OPTIONS = ['light', 'medium', 'heavy', 'shield'];

/**
 * A choose-n control pair: how many options the taker picks, and a check
 * grid narrowing what they pick from. No checked option means the whole
 * vocabulary, matching the empty `from` of a stored choice.
 * @param {string} noun what one option is called, for the tooltip
 * @param {{ id: string, label: string }[]} options
 * @param {ProficiencyChoice | undefined} stored
 */
function choiceControls(noun, options, stored) {
  const countInput = numberField(stored?.choose ?? 0, {
    min: 0,
    max: options.length,
    className: 'form__number',
  });
  setTip(countInput, `How many ${noun}s the taker picks. 0 grants none.`);
  const checks = options.map(({ id, label }) => {
    const check = checkbox(label, stored?.from.includes(id) ?? false);
    check.input.value = id;
    return check;
  });
  const grid = el('div', 'feat-form__checks', ...checks.map((c) => c.label));
  setTip(grid, `Which ${noun}s are on offer. None checked means any ${noun}.`);
  const read = () => ({
    choose: countInput.value,
    from: checks.filter((c) => c.input.checked).map((c) => c.input.value),
  });
  return { countInput, grid, read };
}

/**
 * The feat create/edit form, inline in the Library rail like the spell form.
 * The form carries one effect of each kind: the +1 ability increase, the
 * proficiency grants, and the roll rider. Editing an imported feat that
 * stacks two effects of one kind shows the first and stores the merge of the
 * form's controls, so an exotic hand-written file is best left unedited here.
 * Submit assembles the draft through the library's own normalizeFeat, so the
 * stored entry always matches what an import of the same JSON would hold.
 * @param {{
 *   feat?: Feat | null,
 *   submitLabel: string,
 *   onSubmit: (feat: Omit<Feat, 'id'>) => void,
 *   onCancel?: (() => void) | null,
 * }} options
 * @returns {HTMLElement}
 */
export function buildFeatForm({ feat = null, submitLabel, onSubmit, onCancel = null }) {
  const nameInput = textField(feat?.name ?? '', { placeholder: 'Feat name' });
  const prerequisiteInput = textField(feat?.prerequisite ?? '', {
    placeholder: 'Strength 13 or higher',
  });
  setTip(prerequisiteInput, 'Display text only. The GM enforces it.');
  const repeatable = checkbox('Repeatable', feat?.repeatable ?? false);
  setTip(repeatable.label, 'A character may take this feat more than once');
  const descriptionInput = textareaField(feat?.description ?? '', {
    placeholder: 'What the feat does. Effects the app cannot apply live here.',
    className: 'feat-form__description',
  });

  const asiEffect = feat?.effects.find((e) => e.kind === 'asi');
  const profEffect = feat?.effects.find((e) => e.kind === 'proficiency');
  const riderEffect = feat?.effects.find((e) => e.kind === 'rider');

  // --- Ability increase ------------------------------------------------------
  const asi = checkbox('Ability increase (+1)', !!asiEffect);
  const abilityChecks = ABILITY_SCORES.map((key) => {
    const check = checkbox(key, asiEffect?.abilities.includes(/** @type {never} */ (key)) ?? false);
    check.input.value = key;
    return check;
  });
  const abilityGrid = el('div', 'u-row u-wrap u-g2', ...abilityChecks.map((c) => c.label));
  setTip(abilityGrid, 'Which abilities may take the +1. None checked means any.');
  const abilityRow = fieldRow(labeled('Limit to', abilityGrid));

  // --- Proficiency grants ----------------------------------------------------
  const skillOptions = SKILL_IDS.map((id) => ({ id, label: skillName(id) }));
  const abilityOptions = ABILITY_SCORES.map((key) => ({ id: key, label: key }));
  const skills = choiceControls('skill', skillOptions, profEffect?.skills);
  const saves = choiceControls('save', abilityOptions, profEffect?.saves);
  const expertise = choiceControls('skill', skillOptions, profEffect?.expertise);
  setTip(
    expertise.grid,
    'Expertise doubles a proficiency. The taker picks among skills they are proficient in.',
  );
  const armorChecks = ARMOR_OPTIONS.map((key) => {
    const check = checkbox(key, profEffect?.armor?.includes(/** @type {never} */ (key)) ?? false);
    check.input.value = key;
    return check;
  });
  const armorRow = fieldRow(
    labeled('Armor', el('div', 'u-row u-wrap u-g2', ...armorChecks.map((c) => c.label))),
  );
  const toolsInput = textField(profEffect?.tools?.join(', ') ?? '', {
    placeholder: "thieves' tools, herbalism kit",
  });
  const languagesInput = textField(profEffect?.languages?.join(', ') ?? '', {
    placeholder: 'Elvish, Dwarvish',
  });

  // Each option grid is its own full-width row, the way the spell form lays
  // out its class list. A flex field row would shrink-wrap the grid instead.
  const skillsRow = fieldRow(labeled('Skills', skills.countInput));
  const skillsFromRow = labeled('From', skills.grid);
  const savesRow = fieldRow(labeled('Saving throws', saves.countInput));
  const savesFromRow = labeled('From', saves.grid);
  const expertiseRow = fieldRow(labeled('Expertise', expertise.countInput));
  const expertiseFromRow = labeled('From', expertise.grid);
  const toolsRow = fieldRow(labeled('Tools', toolsInput), labeled('Languages', languagesInput));

  // --- Roll rider --------------------------------------------------------------
  const rider = checkbox('Roll rider', !!riderEffect);
  setTip(rider.label, 'A standing bonus or penalty on the rolls this feat names');
  const riderDiceInput = numberField(riderEffect?.rider.dice ?? 0, {
    className: 'form__number',
  });
  setTip(riderDiceInput, 'Negative for a penalty die');
  const riderDieSelect = select([...RIDER_DICE], riderEffect?.rider.die ?? DEFAULT_RIDER_DIE);
  const riderFlatInput = numberField(riderEffect?.rider.flat ?? 0, {
    className: 'form__number',
  });
  const riderRollChecks = RIDER_ROLLS.map((roll) =>
    checkbox(roll, riderEffect?.rider.rolls.includes(roll) ?? false),
  );
  const riderRow = fieldRow(
    labeled('Rider dice', riderDiceInput),
    labeled('Die', riderDieSelect),
    labeled('Flat', riderFlatInput),
  );
  const riderRollsRow = fieldRow(
    labeled('Applies to', el('div', 'u-row u-wrap u-g2', ...riderRollChecks.map((c) => c.label))),
  );

  // A grid of options means nothing while its count is 0, and the rider and
  // ability controls mean nothing while their sections are off.
  function syncSections() {
    abilityRow.hidden = !asi.input.checked;
    skillsFromRow.hidden = Number(skills.countInput.value) <= 0;
    savesFromRow.hidden = Number(saves.countInput.value) <= 0;
    expertiseFromRow.hidden = Number(expertise.countInput.value) <= 0;
    const rides = rider.input.checked;
    riderRow.hidden = !rides;
    riderRollsRow.hidden = !rides;
  }
  asi.input.addEventListener('change', syncSections);
  rider.input.addEventListener('change', syncSections);
  skills.countInput.addEventListener('input', syncSections);
  saves.countInput.addEventListener('input', syncSections);
  expertise.countInput.addEventListener('input', syncSections);

  /** Split a comma-separated grant list into its entries. @param {string} value */
  const splitList = (value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

  /** @returns {Omit<Feat, 'id'>} */
  function assemble() {
    const raw = {
      name: nameInput.value,
      description: descriptionInput.value,
      prerequisite: prerequisiteInput.value,
      repeatable: repeatable.input.checked,
      effects: [
        ...(asi.input.checked
          ? [
              {
                kind: 'asi',
                abilities: abilityChecks.filter((c) => c.input.checked).map((c) => c.input.value),
              },
            ]
          : []),
        // An all-zero grant normalizes away, so the effect can always be
        // offered raw.
        {
          kind: 'proficiency',
          skills: skills.read(),
          saves: saves.read(),
          expertise: expertise.read(),
          armor: armorChecks.filter((c) => c.input.checked).map((c) => c.input.value),
          tools: splitList(toolsInput.value),
          languages: splitList(languagesInput.value),
        },
        ...(rider.input.checked
          ? [
              {
                kind: 'rider',
                rider: {
                  rolls: RIDER_ROLLS.filter((_, i) => riderRollChecks[i].input.checked),
                  dice: riderDiceInput.value,
                  die: riderDieSelect.value,
                  flat: riderFlatInput.value,
                },
              },
            ]
          : []),
      ],
    };
    const { id: _id, ...rest } = normalizeFeat(raw, 'draft');
    return rest;
  }

  const form = buildInlineForm({
    nameInput,
    rows: [
      fieldRow(labeled('Prerequisite', prerequisiteInput), repeatable.label),
      labeled('Description', descriptionInput),
      fieldRow(asi.label),
      abilityRow,
      skillsRow,
      skillsFromRow,
      savesRow,
      savesFromRow,
      expertiseRow,
      expertiseFromRow,
      armorRow,
      toolsRow,
      fieldRow(rider.label),
      riderRow,
      riderRollsRow,
    ],
    assemble,
    submitLabel,
    onSubmit,
    onCancel,
    className: 'feat-form',
  });

  syncSections();
  return form;
}
