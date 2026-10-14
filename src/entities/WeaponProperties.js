/**
 * The rules of the Ammunition, Heavy, and Loading weapon properties. The code
 * is pure, and each function reads an attacker and a weapon.
 *
 * - Ammunition: each shot spends one piece from a matching stack in the
 *   attacker's inventory. A stack matches by name, so "Arrows" feeds a bow
 *   and "Crossbow Bolts" feeds a crossbow.
 * - Heavy: a Small attacker rolls the attack at disadvantage.
 * - Loading: the weapon fires once per action, whatever Extra Attack grants,
 *   unless the attacker has the Crossbow Expert feat.
 */

/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').CreatureWeapon} CreatureWeapon */
/** @typedef {InventoryItem | CreatureWeapon} Weapon */

/**
 * @param {Weapon} weapon
 * @param {import('../types/entities.js').WeaponProperty} property
 * @returns {boolean}
 */
function hasProperty(weapon, property) {
  return Array.isArray(weapon.properties) && weapon.properties.includes(property);
}

/**
 * The ammunition kinds by the weapon name that fires them. The first row
 * whose weapon pattern matches wins, so "crossbow" comes before "bow".
 * @type {{ weapon: RegExp, ammo: RegExp, noun: string }[]}
 */
const AMMO_KINDS = [
  { weapon: /crossbow/i, ammo: /\bbolts?\b/i, noun: 'bolts' },
  { weapon: /bow/i, ammo: /\barrows?\b/i, noun: 'arrows' },
  { weapon: /sling/i, ammo: /\bbullets?\b/i, noun: 'sling bullets' },
  { weapon: /blowgun/i, ammo: /\bneedles?\b/i, noun: 'blowgun needles' },
];

/** The ammunition of a weapon whose name names no known kind. */
const ANY_AMMO = { ammo: /\b(arrows?|bolts?|bullets?|needles?|ammunition)\b/i, noun: 'ammunition' };

/**
 * The ammunition a weapon fires, or null when it has no Ammunition property.
 * @param {Weapon} weapon
 * @returns {{ ammo: RegExp, noun: string } | null}
 */
export function ammunitionOf(weapon) {
  if (!hasProperty(weapon, 'ammunition')) return null;
  return AMMO_KINDS.find((kind) => kind.weapon.test(weapon.name)) ?? ANY_AMMO;
}

/**
 * The inventory stack that feeds a shot from this weapon, or null when the
 * weapon needs none or the attacker carries none. The weapon itself never
 * matches, so a bow named "Bow of Arrows" does not feed itself.
 * @param {{ inventory?: InventoryItem[] }} attacker
 * @param {Weapon} weapon
 * @returns {InventoryItem | null}
 */
export function ammunitionStack(attacker, weapon) {
  const kind = ammunitionOf(weapon);
  if (!kind || !Array.isArray(attacker.inventory)) return null;
  return (
    attacker.inventory.find(
      (item) => item !== weapon && item.quantity > 0 && kind.ammo.test(item.name),
    ) ?? null
  );
}

/**
 * The disadvantage slant of a heavy weapon in the hands of a Small attacker,
 * or null. Only a character from the race catalog records its size, so a
 * creature never takes this slant.
 * @param {{ raceTraits?: { size?: string } }} attacker
 * @param {Weapon} weapon
 * @returns {'disadvantage' | null}
 */
export function heavySlant(attacker, weapon) {
  return hasProperty(weapon, 'heavy') && attacker.raceTraits?.size === 'small'
    ? 'disadvantage'
    : null;
}

/**
 * Whether the attacker took the Crossbow Expert feat, by catalog id or by a
 * hand-typed name.
 * @param {{ asiChoices?: unknown }} attacker
 * @returns {boolean}
 */
export function hasCrossbowExpert(attacker) {
  if (!Array.isArray(attacker.asiChoices)) return false;
  return attacker.asiChoices.some(
    (choice) =>
      choice?.type === 'feat' &&
      (choice.featId === 'crossbow-expert' ||
        /^crossbow expert$/i.test(String(choice.feat).trim())),
  );
}

/**
 * The swings one Attack action buys with this weapon, after the Loading
 * property. A loading weapon fires once per action unless the attacker has
 * Crossbow Expert.
 * @param {{ asiChoices?: unknown }} attacker
 * @param {Weapon} weapon
 * @param {number} swings the swings that Extra Attack grants
 * @returns {number}
 */
export function loadedSwings(attacker, weapon, swings) {
  return hasProperty(weapon, 'loading') && !hasCrossbowExpert(attacker) ? 1 : swings;
}
