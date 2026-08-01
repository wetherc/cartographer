import { defaultEnemyStats, ENEMY_TIERS, STAT_KEYS } from '../entities/Modifiers.js';
import { isCasterClass } from '../entities/Classes.js';
import { gearOptions, readGear } from '../app/gearFields.js';
import {
  casterClassOptions,
  spellPickerOptions,
  spellbookIds,
  spellbookFromIds,
} from '../app/casterFields.js';
import {
  labeled,
  fieldRow,
  textField,
  numberField,
  select,
  statInputRows,
  buildInlineForm,
} from './formFields.js';
import { buildMultiselect } from './ModalFields.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/entities.js').EncounterTemplate} EncounterTemplate */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */

/**
 * The bestiary template create or edit form, inline in the Library rail
 * like the item and spell forms. It shows the encounter's blueprint
 * fields: name, tier, HP, level, weapon, armor, and the full stat block,
 * with no placement or live HP. While creating, the form re-stamps the
 * stat defaults as level or tier change, until a stat is hand-edited, to
 * match the campaign encounter dialog. Submitting calls onSubmit with the
 * assembled template minus its id. The caller owns identity and the merge
 * key. Editing a built-in default stores a custom override.
 * @param {{
 *   template?: EncounterTemplate | null,
 *   submitLabel: string,
 *   onSubmit: (fields: Omit<EncounterTemplate, 'id'>) => void,
 *   onCancel?: (() => void) | null,
 * }} options
 * @returns {HTMLElement}
 */
export function buildEncounterTemplateForm({
  template = null,
  submitLabel,
  onSubmit,
  onCancel = null,
}) {
  // These weapon and armor pickers are shared with the campaign encounter dialog.
  const gear = gearOptions(template);
  const { currentWeapon, currentArmor, weaponOptions, armorOptions } = gear;

  const nameInput = textField(template?.name ?? '', 'Enemy name');

  const tierSelect = select(
    ENEMY_TIERS.map((t) => ({ value: t, label: t === 'mob' ? 'Mob' : 'Legend' })),
    template?.tier ?? 'mob',
  );
  const hpInput = numberField(template?.maxHP ?? 10, { min: 1 });
  const levelInput = numberField(template?.level ?? 1, { min: 1 });
  const weaponSelect = select(weaponOptions, currentWeapon?.name ?? '');
  const armorSelect = select(armorOptions, currentArmor?.name ?? '');

  // This is an optional spellcaster section. A caster class gives the
  // template spell slots and a spellbook, so a spawned foe can cast.
  // "None" keeps it a plain fighter.
  const classSelect = select(casterClassOptions(), template?.class ?? '');
  const casterLevelInput = numberField(template?.casterLevel ?? template?.level ?? 1, { min: 1 });
  // This is the same checkbox group as the dialogs' multiselect field. A
  // refilter keeps whatever is checked, so a class switch while picking
  // does not lose a valid spell. The picker's own class keeps the inline
  // form's scroll box.
  const spellPicker = buildMultiselect({
    className: 'inventory-panel__spell-picker u-col u-g1',
    options: spellPickerOptions(classSelect.value, clampInt(casterLevelInput.value, 1)),
    value: spellbookIds(template?.spellbook).join(','),
  });
  const refilterSpells = () =>
    spellPicker.setOptions(
      spellPickerOptions(classSelect.value, clampInt(casterLevelInput.value, 1)),
    );
  classSelect.addEventListener('change', refilterSpells);
  casterLevelInput.addEventListener('change', refilterSpells);

  // This is the stat block: one number field per key, pre-filled from the
  // template or the tier's level-appropriate defaults.
  const statBlock = statInputRows(STAT_KEYS, template?.statBlock ?? defaultEnemyStats(1, 'mob'));
  const { statInputs } = statBlock;

  // While creating, the form re-stamps the defaults as level or tier
  // change, until a stat is hand-edited. After that, the GM's numbers
  // stand. Editing never re-stamps. The stored block is authoritative.
  let statsTouched = false;
  if (!template) {
    for (const { input } of statInputs) {
      input.addEventListener('change', () => {
        statsTouched = true;
      });
    }
    const restamp = () => {
      if (statsTouched) return;
      const stats = defaultEnemyStats(
        clampInt(levelInput.value, 1),
        /** @type {EnemyTier} */ (tierSelect.value),
      );
      for (const { key, input } of statInputs) input.value = String(stats[key]);
    };
    levelInput.addEventListener('change', restamp);
    tierSelect.addEventListener('change', restamp);
  }

  /** @returns {Omit<EncounterTemplate, 'id'>} */
  function assemble() {
    const { weapon, armor } = readGear(weaponSelect.value, armorSelect.value, gear);
    return {
      name: nameInput.value.trim(),
      maxHP: clampInt(hpInput.value, 1),
      statBlock: statBlock.read(),
      level: clampInt(levelInput.value, 1),
      tier: /** @type {EnemyTier} */ (tierSelect.value),
      weapon,
      armor,
      ...casterFields(),
    };
  }

  /** The caster fields to fold into the template. This is empty for a non-caster. */
  function casterFields() {
    if (!isCasterClass(classSelect.value)) return {};
    const ids = spellPicker.get().split(',').filter(Boolean);
    return {
      class: classSelect.value,
      casterLevel: clampInt(casterLevelInput.value, 1),
      spellbook: spellbookFromIds(ids),
    };
  }

  return buildInlineForm({
    nameInput,
    rows: [
      fieldRow(labeled('Tier', tierSelect), labeled('Level', levelInput)),
      fieldRow(labeled('Max HP', hpInput)),
      fieldRow(labeled('Weapon', weaponSelect), labeled('Armor', armorSelect)),
      ...statBlock.rows,
      fieldRow(labeled('Caster class', classSelect), labeled('Caster level', casterLevelInput)),
      labeled('Spells', spellPicker.element),
    ],
    assemble,
    submitLabel,
    onSubmit,
    onCancel,
  });
}
