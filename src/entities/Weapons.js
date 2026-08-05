/**
 * The weapon property model: the kind and property vocabularies, and the
 * reads that pick a weapon's attack ability from them. This lives apart from
 * Equipment.js, which keeps the slot, AC, and item-repair rules. The property
 * strings 'light' and 'heavy' also exist as armor weight classes, so the two
 * vocabularies stay in separate constants on purpose.
 *
 * The functions here read both an InventoryItem and an EnemyWeapon, the same
 * way `weaponAbility` did before them. Until the item form writes the new
 * shape, a form-built weapon still carries the legacy `handling` field, so
 * each read falls back to it. `coerceWeapon` in EquipmentPresets.js is the
 * one long-term reader of `handling`.
 */

/** @typedef {import('../types/entities.js').WeaponKind} WeaponKind */
/** @typedef {import('../types/entities.js').WeaponProperty} WeaponProperty */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */

/**
 * The two weapon kinds, with form labels.
 * @type {{ key: WeaponKind, label: string }[]}
 */
export const WEAPON_KINDS = [
  { key: 'melee', label: 'Melee' },
  { key: 'ranged', label: 'Ranged' },
];

/**
 * The 5e weapon property flags, with form labels. `finesse` and `versatile`
 * change the attack math now. The rest are stored and shown; later combat
 * work reads them.
 * @type {{ key: WeaponProperty, label: string }[]}
 */
export const WEAPON_PROPERTIES = [
  { key: 'finesse', label: 'Finesse' },
  { key: 'versatile', label: 'Versatile' },
  { key: 'two-handed', label: 'Two-handed' },
  { key: 'light', label: 'Light' },
  { key: 'heavy', label: 'Heavy' },
  { key: 'reach', label: 'Reach' },
  { key: 'thrown', label: 'Thrown' },
  { key: 'ammunition', label: 'Ammunition' },
  { key: 'loading', label: 'Loading' },
];

/**
 * A weapon's kind. An absent `kind` on a new-shape weapon reads as melee.
 * A legacy weapon that still carries `handling` maps 'ranged' to ranged and
 * everything else to melee.
 * @param {InventoryItem | EnemyWeapon} weapon
 * @returns {WeaponKind}
 */
export function weaponKind(weapon) {
  if (weapon.kind === 'ranged' || weapon.kind === 'melee') return weapon.kind;
  return /** @type {{ handling?: string }} */ (weapon).handling === 'ranged' ? 'ranged' : 'melee';
}

/**
 * Whether the weapon carries the given property flag. A legacy weapon with
 * `handling: 'finesse'` reads as carrying the finesse property.
 * @param {InventoryItem | EnemyWeapon} weapon
 * @param {WeaponProperty} property
 * @returns {boolean}
 */
export function hasWeaponProperty(weapon, property) {
  if (weapon.properties?.includes(property)) return true;
  return (
    property === 'finesse' && /** @type {{ handling?: string }} */ (weapon).handling === 'finesse'
  );
}

/**
 * The ability score behind the weapon's attack and damage rolls. A ranged
 * weapon uses DEX. A finesse weapon uses the higher of the roller's STR and
 * DEX scores, with STR on a tie, because comparing raw scores compares
 * modifiers. Every other weapon uses STR.
 * @param {InventoryItem | EnemyWeapon} weapon
 * @param {Record<string, number>} stats the roller's ability scores
 * @returns {'STR' | 'DEX'}
 */
export function attackAbility(weapon, stats) {
  if (weaponKind(weapon) === 'ranged') return 'DEX';
  if (hasWeaponProperty(weapon, 'finesse')) {
    return (stats.DEX ?? 10) > (stats.STR ?? 10) ? 'DEX' : 'STR';
  }
  return 'STR';
}

/**
 * The ability label for a weapon shown without a roller, in item badges and
 * pickers. A finesse weapon reads "STR/DEX" because the choice depends on
 * who holds it.
 * @param {InventoryItem | EnemyWeapon} weapon
 * @returns {string}
 */
export function abilityLabel(weapon) {
  if (weaponKind(weapon) === 'ranged') return 'DEX';
  return hasWeaponProperty(weapon, 'finesse') ? 'STR/DEX' : 'STR';
}
