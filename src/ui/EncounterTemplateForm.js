import { activeWeapons, activeArmors, activeEnemyArmor } from '../library/Library.js';
import { defaultEnemyStats, ENEMY_TIERS, STAT_KEYS } from '../entities/Modifiers.js';
import { formatDamage } from '../entities/Equipment.js';
import { isCasterClass } from '../entities/Classes.js';
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
  formActions,
} from './formFields.js';

/** @typedef {import('../types/entities.js').EncounterTemplate} EncounterTemplate */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */

/**
 * Build the weapon/armor pickers for the bestiary form: the merged library's
 * choices, "None" for a deliberately weaponless/unarmored creature, and — when
 * the template already carries a hand-tuned gear entry not in the library — that
 * entry kept offered as-is so editing other fields doesn't clobber it.
 * @param {EncounterTemplate | null} template
 */
function gearOptions(template) {
  const weaponChoices = activeWeapons();
  const currentWeapon = template?.weapon;
  const customWeapon = currentWeapon && !weaponChoices.some((p) => p.name === currentWeapon.name);
  const weaponOptions = [
    { value: '', label: 'None (unarmed)' },
    ...(customWeapon
      ? [
          {
            value: currentWeapon.name,
            label: `${currentWeapon.name} (${formatDamage(currentWeapon.damage)})`,
          },
        ]
      : []),
    ...weaponChoices.map((p) => ({ value: p.name, label: p.name })),
  ];
  const armorChoices = activeArmors();
  const currentArmor = template?.armor;
  const customArmor = currentArmor && !armorChoices.some((a) => a.name === currentArmor.name);
  const armorOptions = [
    { value: '', label: 'None (unarmored)' },
    ...(customArmor
      ? [{ value: currentArmor.name, label: `${currentArmor.name} (+${currentArmor.acBonus} AC)` }]
      : []),
    ...armorChoices.map((a) => ({ value: a.name, label: `${a.name} (+${a.acBonus} AC)` })),
  ];
  return { weaponChoices, currentWeapon, currentArmor, weaponOptions, armorOptions };
}

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
  const form = document.createElement('div');
  form.className = 'inventory-panel__form';

  const { weaponChoices, currentWeapon, currentArmor, weaponOptions, armorOptions } =
    gearOptions(template);

  const nameInput = textField(template?.name ?? '', 'Enemy name');
  nameInput.classList.add('inventory-panel__name-input');

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
    spellChecks = spellPickerOptions(
      classSelect.value,
      Math.max(1, Number(casterLevelInput.value) || 1),
    ).map((option) => ({
      id: option.value,
      ...checkbox(option.label, selected.has(option.value)),
    }));
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
  const defaults = template?.statBlock ?? defaultEnemyStats(1, 'mob');
  const statInputs = STAT_KEYS.map((key) => ({
    key,
    input: numberField(defaults[key], { min: 1 }),
  }));

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
        Math.max(1, Number(levelInput.value) || 1),
        /** @type {EnemyTier} */ (tierSelect.value),
      );
      for (const { key, input } of statInputs) input.value = String(stats[key]);
    };
    levelInput.addEventListener('change', restamp);
    tierSelect.addEventListener('change', restamp);
  }

  // Stat fields laid out two per row so the block stays compact.
  const statRows = [];
  for (let i = 0; i < statInputs.length; i += 2) {
    const pair = statInputs.slice(i, i + 2).map(({ key, input }) => labeled(key, input));
    statRows.push(fieldRow(...pair));
  }

  const actionsRow = formActions({
    submitLabel,
    onSubmit: () => {
      const name = nameInput.value.trim();
      if (!name) return;
      onSubmit(assemble());
    },
    onCancel,
  });

  /** @returns {Omit<EncounterTemplate, 'id'>} */
  function assemble() {
    const preset = weaponChoices.find((p) => p.name === weaponSelect.value);
    const weapon =
      weaponSelect.value === ''
        ? null
        : preset
          ? {
              name: preset.name,
              handling: preset.handling ?? /** @type {const} */ ('melee'),
              damage: (preset.damage ?? []).map((d) => ({ ...d })),
            }
          : (currentWeapon ?? null);
    const armor =
      armorSelect.value === ''
        ? null
        : (activeEnemyArmor(armorSelect.value) ?? currentArmor ?? null);
    return {
      name: nameInput.value.trim(),
      maxHP: Math.max(1, Number(hpInput.value) || 1),
      statBlock: Object.fromEntries(
        statInputs.map(({ key, input }) => [key, Math.max(1, Number(input.value) || 10)]),
      ),
      level: Math.max(1, Number(levelInput.value) || 1),
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
      casterLevel: Math.max(1, Number(casterLevelInput.value) || 1),
      spellbook: spellbookFromIds(ids),
    };
  }

  form.append(
    nameInput,
    fieldRow(labeled('Tier', tierSelect), labeled('Level', levelInput)),
    fieldRow(labeled('Max HP', hpInput)),
    fieldRow(labeled('Weapon', weaponSelect), labeled('Armor', armorSelect)),
    ...statRows,
    fieldRow(labeled('Caster class', classSelect), labeled('Caster level', casterLevelInput)),
    labeled('Spells', spellBox),
    actionsRow,
  );

  return form;
}
