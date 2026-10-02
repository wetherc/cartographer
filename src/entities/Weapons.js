/**
 * The weapon property model: the kind and property vocabularies, and the
 * reads that pick a weapon's attack ability from them. This lives apart from
 * Equipment.js, which keeps the slot, AC, and item-repair rules. The property
 * strings 'light' and 'heavy' also exist as armor weight classes, so the two
 * vocabularies stay in separate constants on purpose.
 *
 * The functions here read both an InventoryItem and an EnemyWeapon, the same
 * way `weaponAbility` did before them. They read only the current fields.
 * `coerceWeapon` in EquipmentPresets.js rewrites a legacy weapon before it
 * gets here.
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

/** The default range in feet of a weapon that states none, by kind. A ranged
 * weapon reads as a shortbow and a thrown melee weapon as a dagger.
 * @type {Record<WeaponKind, import('../types/entities.js').WeaponRange>} */
export const DEFAULT_RANGES = {
  ranged: { normal: 80, long: 320 },
  melee: { normal: 20, long: 60 },
};

/**
 * A range as two whole counts of feet, with the long range never shorter than
 * the normal one. A value that does not read as a number falls back to the
 * matching field of `fallback`. Both the item form and the legacy coercer
 * clamp here, so a hand-edited file cannot carry a range the form refuses to
 * produce.
 * @param {{ normal?: unknown, long?: unknown }} value
 * @param {import('../types/entities.js').WeaponRange} fallback
 * @returns {import('../types/entities.js').WeaponRange}
 */
export function clampWeaponRange(value, fallback) {
  const normal = feet(value.normal, fallback.normal);
  return { normal, long: Math.max(normal, feet(value.long, fallback.long)) };
}

/** One range field as whole feet. Anything under one foot, and anything that
 * does not read as a number at all, falls back rather than clamping up to a
 * one-foot reach.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number} */
function feet(value, fallback) {
  const whole = Math.floor(Number(value));
  return Number.isFinite(whole) && whole >= 1 ? whole : fallback;
}

/**
 * A weapon's kind. An absent `kind` reads as melee.
 * @param {InventoryItem | EnemyWeapon} weapon
 * @returns {WeaponKind}
 */
export function weaponKind(weapon) {
  return weapon.kind === 'ranged' ? 'ranged' : 'melee';
}

/**
 * Whether the weapon carries the given property flag.
 * @param {InventoryItem | EnemyWeapon} weapon
 * @param {WeaponProperty} property
 * @returns {boolean}
 */
export function hasWeaponProperty(weapon, property) {
  return weapon.properties?.includes(property) === true;
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
