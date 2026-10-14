/**
 * The default weapon and armor of a new foe, by tier and level band.
 * `createCreature` stamps them on a creature that has a level, and the
 * creature form offers them as the gear pickers' defaults.
 */

import { WEAPON_PRESETS, enemyArmor, copyEnemyWeapon } from './EquipmentPresets.js';

/** @typedef {import('../types/entities.js').CreatureTier} CreatureTier */
/** @typedef {import('../types/entities.js').CreatureWeapon} CreatureWeapon */
/** @typedef {import('../types/entities.js').CreatureArmor} CreatureArmor */

/**
 * Resolve one default loadout against the shared preset lists. Called while
 * this module loads rather than per creature, so a rename in
 * EquipmentPresets.js raises one named error at startup instead of a
 * non-null cast crashing on `undefined.name` the first time a campaign
 * loads.
 * @param {string} weaponName
 * @param {string} armorName
 * @returns {{ weapon: (typeof WEAPON_PRESETS)[number], armor: CreatureArmor }}
 */
function requireLoadout(weaponName, armorName) {
  const weapon = WEAPON_PRESETS.find((p) => p.name === weaponName);
  const armor = enemyArmor(armorName);
  if (!weapon) throw new Error(`Unknown weapon preset: ${weaponName}`);
  if (!armor) throw new Error(`Unknown armor preset: ${armorName}`);
  return { weapon, armor };
}

/**
 * The arms a new foe defaults to, per tier and level band. Mobs carry
 * simple gear that steps up with level. Legends carry heavy gear from the
 * start. This is read-only reference data. `defaultEnemyGear` hands out
 * copies.
 */
const DEFAULT_LOADOUTS = {
  mob: {
    low: requireLoadout('Shortsword', 'Leather Armor'),
    high: requireLoadout('Longsword', 'Chain Shirt'),
  },
  legend: {
    low: requireLoadout('Longsword', 'Chain Mail'),
    high: requireLoadout('Greatsword', 'Plate'),
  },
};

/**
 * A generic weapon and armor for a foe of a given level and tier, so every
 * new foe can attack by default. Both come from the shared 5e preset lists
 * (armor bonuses read as the preset's margin over the unarmored 10) as
 * fresh copies, so everything stays editable on the creature without
 * writing through to the presets.
 * @param {number} level
 * @param {CreatureTier} tier
 * @returns {{ weapon: CreatureWeapon, armor: CreatureArmor }}
 */
export function defaultEnemyGear(level, tier) {
  const lvl = Math.max(1, Math.floor(level) || 1);
  const loadout = DEFAULT_LOADOUTS[tier === 'legend' ? 'legend' : 'mob'][lvl < 5 ? 'low' : 'high'];
  return { weapon: copyEnemyWeapon(loadout.weapon), armor: { ...loadout.armor } };
}
