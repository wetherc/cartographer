import { activeWeapons, activeArmors, activeEnemyArmor } from '../library/Library.js';
import { formatDamage } from '../entities/Equipment.js';

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
 * Build the weapon/armor picker options shared by the encounter dialog and the
 * bestiary template form: the merged library's choices, "None" for a
 * deliberately weaponless/unarmored creature, and — when the enemy already
 * carries a hand-tuned gear entry not in the library — that entry kept offered
 * as-is (labelled with its damage / AC bonus) so editing other fields doesn't
 * clobber it.
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
 * Read the gear pickers back into stored weapon/armor values, one cascade for
 * both forms: the empty value is the explicit "None" choice and stores null; a
 * library preset is copied (structured damage cloned); anything else falls back
 * to the enemy's current hand-tuned entry, then to the caller's fallback (the
 * encounter dialog passes the tier's default gear, the template form nothing).
 * @param {string} weaponValue
 * @param {string} armorValue
 * @param {GearOptions} options
 * @param {{ weapon?: EnemyWeapon | null, armor?: EnemyArmor | null }} [fallback]
 * @returns {{ weapon: EnemyWeapon | null, armor: EnemyArmor | null }}
 */
export function readGear(weaponValue, armorValue, options, fallback = {}) {
  const preset = options.weaponChoices.find((p) => p.name === weaponValue);
  const weapon =
    weaponValue === ''
      ? null
      : preset
        ? {
            name: preset.name,
            handling: preset.handling ?? /** @type {const} */ ('melee'),
            damage: (preset.damage ?? []).map((d) => ({ ...d })),
          }
        : (options.currentWeapon ?? fallback.weapon ?? null);
  const armor =
    armorValue === ''
      ? null
      : (activeEnemyArmor(armorValue) ?? options.currentArmor ?? fallback.armor ?? null);
  return { weapon, armor };
}
