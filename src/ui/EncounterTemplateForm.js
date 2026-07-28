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
  checkbox,
  textField,
  numberField,
  select,
  statInputRows,
  buildInlineForm,
} from './formFields.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/entities.js').EncounterTemplate} EncounterTemplate */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */

/**
 * The bestiary template create/edit form, inline in the Library rail like the
 * item and spell forms: the encounter's blueprint fields (name, tier, HP,
 * level, weapon/armor, and the full stat block) with no placement or live HP.
 * Creating re-stamps the stat defaults as level/tier change until a stat is
 * hand-edited, matching the campaign encounter dialog. Submitting calls
 * `onSubmit` with the assembled template minus its id — the caller owns
 * identity and the merge key. Editing a built-in default stores a custom
 * override.
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
  // The weapon/armor pickers shared with the campaign encounter dialog.
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

  // Optional spellcaster section: a caster class gives the template spell slots
  // and a spellbook so a spawned foe can cast. "None" keeps it a plain fighter.
  const classSelect = select(casterClassOptions(), template?.class ?? '');
  const casterLevelInput = numberField(template?.casterLevel ?? template?.level ?? 1, { min: 1 });
  const spellBox = document.createElement('div');
  spellBox.className = 'inventory-panel__spell-picker';
  /** @type {{ id: string, label: HTMLElement, input: HTMLInputElement }[]} */
  let spellChecks = [];
  // Rebuild the spell checkboxes filtered to the current caster class and
  // level, keeping `selected` checked. Rebuilt live when either changes.
  function renderSpellChecks(/** @type {Set<string>} */ selected) {
    spellChecks = spellPickerOptions(classSelect.value, clampInt(casterLevelInput.value, 1)).map(
      (option) => ({
        id: option.value,
        ...checkbox(option.label, selected.has(option.value)),
      }),
    );
    spellBox.textContent = '';
    for (const { label } of spellChecks) spellBox.appendChild(label);
  }
  renderSpellChecks(new Set(spellbookIds(template?.spellbook)));
  const refilterSpells = () =>
    renderSpellChecks(
      new Set(spellChecks.filter(({ input }) => input.checked).map(({ id }) => id)),
    );
  classSelect.addEventListener('change', refilterSpells);
  casterLevelInput.addEventListener('change', refilterSpells);

  // The stat block: one number field per key, pre-filled from the template or
  // the tier's level-appropriate defaults.
  const statBlock = statInputRows(STAT_KEYS, template?.statBlock ?? defaultEnemyStats(1, 'mob'));
  const { statInputs } = statBlock;

  // Creating re-stamps the defaults as level/tier change until a stat is
  // hand-edited, after which the GM's numbers stand. Editing never re-stamps —
  // the stored block is authoritative.
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

  /** The caster fields to fold into the template, or empty for a non-caster. */
  function casterFields() {
    if (!isCasterClass(classSelect.value)) return {};
    const ids = spellChecks.filter(({ input }) => input.checked).map(({ id }) => id);
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
      labeled('Spells', spellBox),
    ],
    assemble,
    submitLabel,
    onSubmit,
    onCancel,
  });
}
