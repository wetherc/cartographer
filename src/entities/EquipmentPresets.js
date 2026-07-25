/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/entities.js').ArmorWeight} ArmorWeight */

/**
 * The built-in 5e equipment catalogs: weapon, armor, gear, and consumable
 * presets that seed the item form's pickers and the library's stock equipment
 * list. Split out of Equipment.js so that module keeps the equipment rules
 * (slots, AC, migrations) while this one holds only reference data.
 */

/**
 * 5e-standard weapon presets: picking one fills a new weapon's base damage
 * and handling, which the GM may then adjust freely.
 * @type {{ name: string, type: ItemType, handling: import('../types/entities.js').WeaponHandling, damage: import('../types/entities.js').DamagePart[] }[]}
 */
export const WEAPON_PRESETS = [
  {
    name: 'Dagger',
    type: 'weapon',
    handling: 'finesse',
    damage: [{ count: 1, sides: 4, damageType: 'piercing' }],
  },
  {
    name: 'Shortsword',
    type: 'weapon',
    handling: 'finesse',
    damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
  },
  {
    name: 'Rapier',
    type: 'weapon',
    handling: 'finesse',
    damage: [{ count: 1, sides: 8, damageType: 'piercing' }],
  },
  {
    name: 'Quarterstaff',
    type: 'weapon',
    handling: 'melee',
    damage: [{ count: 1, sides: 6, damageType: 'bludgeoning' }],
  },
  {
    name: 'Mace',
    type: 'weapon',
    handling: 'melee',
    damage: [{ count: 1, sides: 6, damageType: 'bludgeoning' }],
  },
  {
    name: 'Spear',
    type: 'weapon',
    handling: 'melee',
    damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
  },
  {
    name: 'Longsword',
    type: 'weapon',
    handling: 'melee',
    damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  },
  {
    name: 'Battleaxe',
    type: 'weapon',
    handling: 'melee',
    damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  },
  {
    name: 'Warhammer',
    type: 'weapon',
    handling: 'melee',
    damage: [{ count: 1, sides: 8, damageType: 'bludgeoning' }],
  },
  {
    name: 'Glaive',
    type: 'weapon',
    handling: 'melee',
    damage: [{ count: 1, sides: 10, damageType: 'slashing' }],
  },
  {
    name: 'Greataxe',
    type: 'weapon',
    handling: 'melee',
    damage: [{ count: 1, sides: 12, damageType: 'slashing' }],
  },
  {
    name: 'Greatsword',
    type: 'weapon',
    handling: 'melee',
    damage: [{ count: 2, sides: 6, damageType: 'slashing' }],
  },
  {
    name: 'Maul',
    type: 'weapon',
    handling: 'melee',
    damage: [{ count: 2, sides: 6, damageType: 'bludgeoning' }],
  },
  {
    name: 'Shortbow',
    type: 'bow',
    handling: 'ranged',
    damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
  },
  {
    name: 'Longbow',
    type: 'bow',
    handling: 'ranged',
    damage: [{ count: 1, sides: 8, damageType: 'piercing' }],
  },
  {
    name: 'Light Crossbow',
    type: 'bow',
    handling: 'ranged',
    damage: [{ count: 1, sides: 8, damageType: 'piercing' }],
  },
  {
    name: 'Heavy Crossbow',
    type: 'bow',
    handling: 'ranged',
    damage: [{ count: 1, sides: 10, damageType: 'piercing' }],
  },
];

/**
 * 5e-standard body armors: picking one fills a new armor item's weight class
 * and base AC, both still adjustable. Also the source of the enemy form's
 * armor choices, via `enemyArmor`.
 * @type {{ name: string, armorWeight: ArmorWeight, baseAC: number }[]}
 */
export const ARMOR_PRESETS = [
  { name: 'Padded', armorWeight: 'light', baseAC: 11 },
  { name: 'Leather Armor', armorWeight: 'light', baseAC: 11 },
  { name: 'Studded Leather', armorWeight: 'light', baseAC: 12 },
  { name: 'Hide', armorWeight: 'medium', baseAC: 12 },
  { name: 'Chain Shirt', armorWeight: 'medium', baseAC: 13 },
  { name: 'Scale Mail', armorWeight: 'medium', baseAC: 14 },
  { name: 'Breastplate', armorWeight: 'medium', baseAC: 14 },
  { name: 'Half Plate', armorWeight: 'medium', baseAC: 15 },
  { name: 'Ring Mail', armorWeight: 'heavy', baseAC: 14 },
  { name: 'Chain Mail', armorWeight: 'heavy', baseAC: 16 },
  { name: 'Splint', armorWeight: 'heavy', baseAC: 17 },
  { name: 'Plate', armorWeight: 'heavy', baseAC: 18 },
];

/**
 * Standard adventuring gear: picking one fills a new gear item's name and
 * description. Names follow the 5e equipment list.
 * @type {{ name: string, description: string }[]}
 */
export const GEAR_PRESETS = [
  { name: 'Bedroll', description: 'Sleeping roll for camping' },
  { name: 'Crowbar', description: 'Grants advantage on checks where leverage applies' },
  { name: 'Grappling Hook', description: 'Anchors a rope to a ledge or battlement' },
  { name: "Healer's Kit", description: 'Ten uses; stabilizes a dying creature' },
  { name: 'Lantern (hooded)', description: 'Bright light 30 ft; burns oil' },
  { name: 'Oil Flask', description: 'One pint; fuels a lantern or splashes a target' },
  { name: 'Rations (1 day)', description: 'Dry food for one day of travel' },
  { name: 'Rope (50 ft)', description: 'Hempen rope; holds up to 300 lb' },
  { name: "Thieves' Tools", description: 'Picks and probes for locks and traps' },
  { name: 'Tinderbox', description: 'Flint, steel, and tinder for lighting fires' },
  { name: 'Torch', description: 'Bright light 20 ft; burns for one hour' },
  { name: 'Waterskin', description: 'Holds four pints of liquid' },
];

/**
 * Standard consumables: picking one fills a new consumable's name and
 * description (the mechanical effect stays a table ruling — consumables carry
 * no automated fields).
 * @type {{ name: string, description: string }[]}
 */
export const CONSUMABLE_PRESETS = [
  { name: 'Acid Vial', description: 'Thrown: 2d6 acid damage' },
  { name: "Alchemist's Fire", description: 'Thrown: 1d4 fire damage per round until doused' },
  { name: 'Antitoxin', description: 'Advantage on saves against poison for 1 hour' },
  { name: 'Holy Water', description: 'Thrown: 2d6 radiant damage to fiends and undead' },
  { name: 'Potion of Healing', description: 'Drink to regain 2d4 + 2 HP' },
  { name: 'Potion of Greater Healing', description: 'Drink to regain 4d4 + 4 HP' },
];

/**
 * An armor preset as an enemy's worn armor. Enemy AC is the stat block's AC
 * plus a flat armor bonus, so the preset's base AC reads as its margin over
 * the unarmored 10. Unknown names return null.
 * @param {string} name
 * @returns {import('../types/entities.js').EnemyArmor | null}
 */
export function enemyArmor(name) {
  const preset = ARMOR_PRESETS.find((p) => p.name === name);
  return preset ? { name: preset.name, acBonus: preset.baseAC - 10 } : null;
}
