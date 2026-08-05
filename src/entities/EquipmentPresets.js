/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/entities.js').ArmorWeight} ArmorWeight */

/**
 * The built-in 5e equipment catalogs: weapon, armor, gear, and consumable
 * presets that seed the item form's pickers and the library's stock equipment
 * list. Split out of Equipment.js so that module keeps the equipment rules
 * (slots, AC, migrations) while this one holds only reference data.
 */

/**
 * A weapon preset: the SRD fields that a picked preset copies onto a new
 * item, which the GM can then adjust freely.
 * @typedef {{
 *   name: string,
 *   type: ItemType,
 *   kind: import('../types/entities.js').WeaponKind,
 *   category: import('../types/entities.js').WeaponCategory,
 *   properties?: import('../types/entities.js').WeaponProperty[],
 *   range?: import('../types/entities.js').WeaponRange,
 *   versatileDamage?: import('../types/entities.js').DamagePart[],
 *   damage: import('../types/entities.js').DamagePart[],
 * }} WeaponPreset
 */

/**
 * 5e-standard weapon presets, per the SRD weapon table. Other modules
 * resolve these entries by name (`Creature.DEFAULT_LOADOUTS`, migration
 * step 6), so a rename here breaks them.
 * @type {WeaponPreset[]}
 */
export const WEAPON_PRESETS = [
  {
    name: 'Dagger',
    type: 'weapon',
    kind: 'melee',
    category: 'simple',
    properties: ['finesse', 'light', 'thrown'],
    range: { normal: 20, long: 60 },
    damage: [{ count: 1, sides: 4, damageType: 'piercing' }],
  },
  {
    name: 'Shortsword',
    type: 'weapon',
    kind: 'melee',
    category: 'martial',
    properties: ['finesse', 'light'],
    damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
  },
  {
    name: 'Rapier',
    type: 'weapon',
    kind: 'melee',
    category: 'martial',
    properties: ['finesse'],
    damage: [{ count: 1, sides: 8, damageType: 'piercing' }],
  },
  {
    name: 'Quarterstaff',
    type: 'weapon',
    kind: 'melee',
    category: 'simple',
    properties: ['versatile'],
    versatileDamage: [{ count: 1, sides: 8, damageType: 'bludgeoning' }],
    damage: [{ count: 1, sides: 6, damageType: 'bludgeoning' }],
  },
  {
    name: 'Mace',
    type: 'weapon',
    kind: 'melee',
    category: 'simple',
    damage: [{ count: 1, sides: 6, damageType: 'bludgeoning' }],
  },
  {
    name: 'Spear',
    type: 'weapon',
    kind: 'melee',
    category: 'simple',
    properties: ['thrown', 'versatile'],
    range: { normal: 20, long: 60 },
    versatileDamage: [{ count: 1, sides: 8, damageType: 'piercing' }],
    damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
  },
  {
    name: 'Longsword',
    type: 'weapon',
    kind: 'melee',
    category: 'martial',
    properties: ['versatile'],
    versatileDamage: [{ count: 1, sides: 10, damageType: 'slashing' }],
    damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  },
  {
    name: 'Battleaxe',
    type: 'weapon',
    kind: 'melee',
    category: 'martial',
    properties: ['versatile'],
    versatileDamage: [{ count: 1, sides: 10, damageType: 'slashing' }],
    damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  },
  {
    name: 'Warhammer',
    type: 'weapon',
    kind: 'melee',
    category: 'martial',
    properties: ['versatile'],
    versatileDamage: [{ count: 1, sides: 10, damageType: 'bludgeoning' }],
    damage: [{ count: 1, sides: 8, damageType: 'bludgeoning' }],
  },
  {
    name: 'Glaive',
    type: 'weapon',
    kind: 'melee',
    category: 'martial',
    properties: ['heavy', 'reach', 'two-handed'],
    damage: [{ count: 1, sides: 10, damageType: 'slashing' }],
  },
  {
    name: 'Greataxe',
    type: 'weapon',
    kind: 'melee',
    category: 'martial',
    properties: ['heavy', 'two-handed'],
    damage: [{ count: 1, sides: 12, damageType: 'slashing' }],
  },
  {
    name: 'Greatsword',
    type: 'weapon',
    kind: 'melee',
    category: 'martial',
    properties: ['heavy', 'two-handed'],
    damage: [{ count: 2, sides: 6, damageType: 'slashing' }],
  },
  {
    name: 'Maul',
    type: 'weapon',
    kind: 'melee',
    category: 'martial',
    properties: ['heavy', 'two-handed'],
    damage: [{ count: 2, sides: 6, damageType: 'bludgeoning' }],
  },
  {
    name: 'Shortbow',
    type: 'bow',
    kind: 'ranged',
    category: 'simple',
    properties: ['ammunition', 'two-handed'],
    range: { normal: 80, long: 320 },
    damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
  },
  {
    name: 'Longbow',
    type: 'bow',
    kind: 'ranged',
    category: 'martial',
    properties: ['ammunition', 'heavy', 'two-handed'],
    range: { normal: 150, long: 600 },
    damage: [{ count: 1, sides: 8, damageType: 'piercing' }],
  },
  {
    name: 'Light Crossbow',
    type: 'bow',
    kind: 'ranged',
    category: 'simple',
    properties: ['ammunition', 'loading', 'two-handed'],
    range: { normal: 80, long: 320 },
    damage: [{ count: 1, sides: 8, damageType: 'piercing' }],
  },
  {
    name: 'Heavy Crossbow',
    type: 'bow',
    kind: 'ranged',
    category: 'martial',
    properties: ['ammunition', 'heavy', 'loading', 'two-handed'],
    range: { normal: 100, long: 400 },
    damage: [{ count: 1, sides: 10, damageType: 'piercing' }],
  },
];

/**
 * 5e-standard body armors: picking one fills a new armor item's weight class
 * and base AC, both still adjustable. This is also the source of the enemy
 * form's armor choices, via `enemyArmor`.
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
 * description. Names follow the 5e equipment list. The four entries that set
 * `spellFocus` are the component pouch and the three focus kinds. Carrying
 * one of them covers a spell's cost-free material component, which is the
 * rule `Casting.materialCheck` applies.
 * @type {{ name: string, description: string, spellFocus?: boolean }[]}
 */
export const GEAR_PRESETS = [
  {
    name: 'Arcane Focus',
    description: 'Orb, rod, staff, or wand; covers cost-free material components',
    spellFocus: true,
  },
  { name: 'Bedroll', description: 'Sleeping roll for camping' },
  {
    name: 'Component Pouch',
    description: 'Holds the cost-free material components of any spell',
    spellFocus: true,
  },
  { name: 'Crowbar', description: 'Grants advantage on checks where leverage applies' },
  {
    name: 'Druidic Focus',
    description: 'Sprig of mistletoe, totem, or yew wand; covers cost-free material components',
    spellFocus: true,
  },
  { name: 'Grappling Hook', description: 'Anchors a rope to a ledge or battlement' },
  { name: "Healer's Kit", description: 'Ten uses; stabilizes a dying creature' },
  {
    name: 'Holy Symbol',
    description: 'Amulet, emblem, or reliquary; covers cost-free material components',
    spellFocus: true,
  },
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
 * description. The mechanical effect stays a table ruling. Consumables
 * carry no automated fields.
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

/** The valid property strings, for the coercer's filter. */
const PROPERTY_KEYS = new Set([
  'finesse',
  'versatile',
  'two-handed',
  'light',
  'heavy',
  'reach',
  'thrown',
  'ammunition',
  'loading',
]);

/**
 * Clone a damage array, dropping non-object terms. The coercer runs on
 * untrusted data, so it cannot assume the array holds damage parts.
 * @param {unknown} parts
 * @returns {import('../types/entities.js').DamagePart[]}
 */
function cloneDamage(parts) {
  return Array.isArray(parts)
    ? parts.filter((d) => d && typeof d === 'object').map((d) => ({ ...d }))
    : [];
}

/**
 * A weapon-shaped value from any era as the current weapon fields. The
 * function reads three sources, in this order:
 *
 * 1. A name match against `WEAPON_PRESETS` (trimmed, case-insensitive)
 *    adopts the preset's kind, category, properties, range, and versatile
 *    damage. The input's own damage dice stay, because a GM can edit them.
 * 2. An input that already carries `kind` keeps its own fields, filtered to
 *    the known vocabulary.
 * 3. A legacy input maps its `handling`: 'ranged' becomes a ranged weapon
 *    with the shortbow range, 'finesse' becomes a melee weapon with the
 *    finesse property, and anything else becomes a plain melee weapon. An
 *    unmatched legacy weapon gets the 'simple' category, because every class
 *    is proficient with simple weapons, and that keeps the old
 *    always-proficient rolls unchanged. A new-shape weapon without a
 *    category keeps none: it is a natural weapon, for example a bite.
 *
 * This is the one long-term reader of the legacy `handling` field. Exported
 * library JSON carries no version, so a file from before the overhaul can
 * arrive at any time. Migration step 6 also runs saves through here once.
 * The function is pure and defends against untrusted input.
 * @param {Record<string, any>} raw
 * @returns {{
 *   kind: import('../types/entities.js').WeaponKind,
 *   category?: import('../types/entities.js').WeaponCategory,
 *   properties?: import('../types/entities.js').WeaponProperty[],
 *   range?: import('../types/entities.js').WeaponRange,
 *   versatileDamage?: import('../types/entities.js').DamagePart[],
 * }}
 */
export function coerceWeapon(raw) {
  const name = typeof raw.name === 'string' ? raw.name.trim().toLowerCase() : '';
  const preset = WEAPON_PRESETS.find((p) => p.name.toLowerCase() === name);
  if (preset) {
    return {
      kind: preset.kind,
      category: preset.category,
      ...(preset.properties ? { properties: [...preset.properties] } : {}),
      ...(preset.range ? { range: { ...preset.range } } : {}),
      ...(preset.versatileDamage ? { versatileDamage: cloneDamage(preset.versatileDamage) } : {}),
    };
  }
  const kind = raw.kind === 'ranged' || raw.handling === 'ranged' ? 'ranged' : 'melee';
  const properties = Array.isArray(raw.properties)
    ? raw.properties.filter((/** @type {unknown} */ p) =>
        PROPERTY_KEYS.has(/** @type {string} */ (p)),
      )
    : raw.handling === 'finesse'
      ? ['finesse']
      : [];
  const range = raw.range;
  const hasRange =
    range &&
    typeof range === 'object' &&
    Number.isFinite(range.normal) &&
    Number.isFinite(range.long);
  const versatile = cloneDamage(raw.versatileDamage);
  const category =
    raw.category === 'martial' || raw.category === 'simple'
      ? raw.category
      : typeof raw.handling === 'string'
        ? 'simple'
        : undefined;
  return {
    kind,
    ...(category ? { category } : {}),
    ...(properties.length ? { properties: [...properties] } : {}),
    ...(hasRange
      ? { range: { normal: range.normal, long: range.long } }
      : kind === 'ranged'
        ? { range: { normal: 80, long: 320 } }
        : {}),
    ...(versatile.length ? { versatileDamage: versatile } : {}),
  };
}

/**
 * A weapon-shaped value (a preset, a library template, another enemy's
 * weapon) as a detached enemy weapon, with the structured damage parts
 * cloned. Every path that arms an enemy from shared data goes through here,
 * so a preset's damage array is never the array a campaign encounter
 * carries. A legacy value coerces to the current fields on the way through.
 * This function is pure.
 * @param {Record<string, any>} weapon
 * @returns {import('../types/entities.js').EnemyWeapon}
 */
export function copyEnemyWeapon(weapon) {
  return {
    name: weapon.name,
    ...coerceWeapon(weapon),
    damage: cloneDamage(weapon.damage),
  };
}
