import { activeWeapons, activeArmors, activeEnemyArmor } from '../library/Library.js';
import { formatDamage } from '../entities/Equipment.js';
import { copyEnemyWeapon } from '../entities/EquipmentPresets.js';
import { enemyArmorLabel } from '../entities/EnemyArmor.js';

/** @typedef {import('../types/entities.js').CreatureWeapon} CreatureWeapon */
/** @typedef {import('../types/entities.js').CreatureArmor} CreatureArmor */

/**
 * @typedef {{
 *   weaponChoices: ReturnType<typeof activeWeapons>,
 *   currentWeapon: CreatureWeapon | null | undefined,
 *   otherChoices: CreatureWeapon[],
 *   otherWeaponOptions: { value: string, label: string }[],
 *   currentOthers: string,
 *   currentArmor: CreatureArmor | null | undefined,
 *   weaponOptions: { value: string, label: string }[],
 *   armorOptions: { value: string, label: string }[],
 * }} GearOptions
 */

/**
 * Build the weapon and armor picker options shared by the encounter dialog
 * and the bestiary template form. The options are: the merged library's
 * choices, "None" for a creature that is deliberately weaponless or
 * unarmored, and, when the enemy already carries a hand-tuned gear entry not
 * in the library, that entry offered as is, labelled with its damage or AC
 * bonus. This keeps the hand-tuned entry from being lost when the GM edits
 * other fields.
 * The first weapon of the creature fills the main picker. The "Other
 * weapons" picker lists every library weapon plus any hand-tuned extra the
 * creature carries, by list index, because a multiselect value has to be a
 * slug and a weapon name can contain a comma.
 * @param {{ weapons?: CreatureWeapon[], armor?: CreatureArmor | null } | null} current
 * @returns {GearOptions}
 */
export function gearOptions(current) {
  const weaponChoices = activeWeapons();
  const currentWeapon = current?.weapons ? (current.weapons[0] ?? null) : undefined;
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
  const currentArmor = current?.armor;
  const customArmor = currentArmor && !armorChoices.some((a) => a.name === currentArmor.name);
  const armorOptions = [
    { value: '', label: 'None (unarmored)' },
    ...(customArmor ? [{ value: currentArmor.name, label: enemyArmorLabel(currentArmor) }] : []),
    ...armorChoices.map((a) => ({ value: a.name, label: enemyArmorLabel(a) })),
  ];
  const extras = current?.weapons?.slice(1) ?? [];
  const customExtras = extras.filter((w) => !weaponChoices.some((p) => p.name === w.name));
  /** @type {CreatureWeapon[]} */
  const otherChoices = [...customExtras, .../** @type {CreatureWeapon[]} */ (weaponChoices)];
  const otherWeaponOptions = otherChoices.map((w, i) => ({
    value: `w${i}`,
    label: `${w.name} (${formatDamage(w.damage)})`,
  }));
  const currentOthers = extras
    .map((w) => `w${otherChoices.findIndex((c) => c.name === w.name)}`)
    .join(',');
  return {
    weaponChoices,
    currentWeapon,
    otherChoices,
    otherWeaponOptions,
    currentOthers,
    currentArmor,
    weaponOptions,
    armorOptions,
  };
}

/**
 * Read the gear pickers back into stored weapon and armor values. Both forms
 * share one cascade: the empty value is the explicit "None" choice and stores
 * null. A library preset is copied, with its structured damage cloned.
 * Anything else falls back to the enemy's current hand-tuned entry.
 * @param {string} weaponValue
 * @param {string} armorValue
 * @param {GearOptions} options
 * @returns {{ weapon: CreatureWeapon | null, armor: CreatureArmor | null }}
 */
export function readGear(weaponValue, armorValue, options) {
  const preset = options.weaponChoices.find((p) => p.name === weaponValue);
  const weapon =
    weaponValue === '' ? null : preset ? copyEnemyWeapon(preset) : (options.currentWeapon ?? null);
  const armor =
    armorValue === '' ? null : (activeEnemyArmor(armorValue) ?? options.currentArmor ?? null);
  return { weapon, armor };
}

/**
 * Read the main weapon picker and the "Other weapons" picker back into the
 * stored weapon list. The main weapon comes first, so it is the default in
 * the attack dialog. An extra that repeats the main weapon by name is
 * dropped. A library extra is copied, and a hand-tuned extra is kept as is.
 * @param {CreatureWeapon | null} main
 * @param {string} others the comma-joined option values of the picker
 * @param {GearOptions} options
 * @returns {CreatureWeapon[]}
 */
export function readOtherWeapons(main, others, options) {
  const picked = others
    .split(',')
    .filter(Boolean)
    .map((value) => options.otherChoices[Number(value.slice(1))])
    .filter((w) => w !== undefined && w.name !== main?.name);
  const extras = picked.map((w) =>
    options.weaponChoices.includes(/** @type {any} */ (w)) ? copyEnemyWeapon(w) : w,
  );
  return main ? [main, ...extras] : extras;
}
