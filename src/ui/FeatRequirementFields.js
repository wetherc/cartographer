import { setTip } from './Tooltip.js';
import { labeled, fieldRow, checkbox, numberField, select } from './formFields.js';
import { ABILITY_SCORES } from '../entities/Modifiers.js';
import { requirementFromDraft } from '../entities/FeatRequirement.js';

/** @typedef {import('../types/feat.js').FeatRequirement} FeatRequirement */

/** The armor proficiencies a requirement can name, with their labels. */
const ARMOR_REQUIREMENTS = [
  { value: '', label: 'None' },
  { value: 'light', label: 'Light armor' },
  { value: 'medium', label: 'Medium armor' },
  { value: 'heavy', label: 'Heavy armor' },
  { value: 'shield', label: 'Shields' },
];

/**
 * The Requires row of the feat form: the part of a prerequisite that the
 * take-feat dialog checks. It has one minimum ability score, one armor
 * proficiency, and a spellcasting box. A stored requirement with two or more
 * minimum scores shows its first one, and a save from the form keeps only
 * that one.
 * @param {FeatRequirement | undefined} stored
 * @returns {{ rows: HTMLElement[], read: () => FeatRequirement | undefined }}
 */
export function featRequirementFields(stored) {
  const [first] = Object.entries(stored?.abilities ?? {});
  const abilitySelect = select(
    [{ value: '', label: 'None' }, ...ABILITY_SCORES.map((key) => ({ value: key, label: key }))],
    first?.[0] ?? '',
  );
  const minInput = numberField(first?.[1] ?? 13, { className: 'form__number', min: 1, max: 30 });
  setTip(minInput, 'The lowest score of that ability that can take the feat');
  const armorSelect = select(ARMOR_REQUIREMENTS, stored?.armor ?? '');
  setTip(armorSelect, 'The armor proficiency a character needs to take the feat');
  const casting = checkbox('Needs spellcasting', stored?.spellcasting ?? false);
  setTip(casting.label, 'Only a character who can cast at least one spell can take the feat');
  const minLabel = labeled('Minimum', minInput);
  const sync = () => {
    minLabel.hidden = !abilitySelect.value;
  };
  abilitySelect.addEventListener('change', sync);
  sync();
  return {
    rows: [
      fieldRow(labeled('Requires ability', abilitySelect), minLabel),
      fieldRow(labeled('Requires armor', armorSelect), casting.label),
    ],
    read: () =>
      requirementFromDraft({
        ability: abilitySelect.value,
        min: minInput.value,
        armor: armorSelect.value,
        spellcasting: casting.input.checked,
      }),
  };
}
