import { activeWeapons, activeArmors, activeEnemyArmor } from '../library/Library.js';
import { formatDamage } from '../entities/Equipment.js';
import { copyEnemyWeapon } from '../entities/EquipmentPresets.js';

/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/entities.js').EnemyArmor} EnemyArmor */

/**
 * @typedef {{
 *   weaponChoices: ReturnType<typeof activeWeapons>,
 *   currentWeapon: EnemyWeapon | null | undefined,
 *   currentArmor: EnemyArmor | null | undefined,
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
 * @param {{ weapon?: EnemyWeapon | null, armor?: EnemyArmor | null } | null} current
 * @returns {GearOptions}
 */
export function gearOptions(current) {
  const weaponChoices = activeWeapons();
  const currentWeapon = current?.weapon;
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
    ...(customArmor
      ? [{ value: currentArmor.name, label: `${currentArmor.name} (+${currentArmor.acBonus} AC)` }]
      : []),
    ...armorChoices.map((a) => ({ value: a.name, label: `${a.name} (+${a.acBonus} AC)` })),
  ];
  return { weaponChoices, currentWeapon, currentArmor, weaponOptions, armorOptions };
}

/**
 * Read the gear pickers back into stored weapon and armor values. Both forms
 * share one cascade: the empty value is the explicit "None" choice and stores
 * null. A library preset is copied, with its structured damage cloned.
 * Anything else falls back to the enemy's current hand-tuned entry.
 * @param {string} weaponValue
 * @param {string} armorValue
 * @param {GearOptions} options
 * @returns {{ weapon: EnemyWeapon | null, armor: EnemyArmor | null }}
 */
export function readGear(weaponValue, armorValue, options) {
  const preset = options.weaponChoices.find((p) => p.name === weaponValue);
  const weapon =
    weaponValue === '' ? null : preset ? copyEnemyWeapon(preset) : (options.currentWeapon ?? null);
  const armor =
    armorValue === '' ? null : (activeEnemyArmor(armorValue) ?? options.currentArmor ?? null);
  return { weapon, armor };
}
