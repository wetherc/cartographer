import { abilityModifier } from './Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/entities.js').ArmorWeight} ArmorWeight */
/** @typedef {import('../types/entities.js').Equipment} Equipment */
/** @typedef {import('../types/entities.js').EquipmentSlot} EquipmentSlot */

/**
 * The wearable slots on a character, in display order. Each slot accepts only
 * the item types listed — a potion can't be worn as armor. Body armor (the
 * 'armor' type) goes in the chest slot; helmets, gloves, and greaves are
 * separate flat-bonus pieces.
 * @type {{ key: EquipmentSlot, label: string, accepts: ItemType[] }[]}
 */
export const EQUIPMENT_SLOTS = [
  { key: 'helmet', label: 'Helmet', accepts: ['helmet'] },
  { key: 'chest', label: 'Armor', accepts: ['armor'] },
  { key: 'gloves', label: 'Gloves', accepts: ['gloves'] },
  { key: 'greaves', label: 'Greaves', accepts: ['greaves'] },
  { key: 'mainHand', label: 'Main hand', accepts: ['weapon'] },
  { key: 'offHand', label: 'Off hand', accepts: ['shield', 'weapon'] },
  { key: 'ranged', label: 'Ranged', accepts: ['bow'] },
  { key: 'accessory', label: 'Ring 1', accepts: ['ring'] },
  { key: 'accessory2', label: 'Ring 2', accepts: ['ring'] },
];

/** The item classifications, in the add-form's display order. 'armor' is
 * body armor; consumables and gear can't be equipped anywhere.
 * @type {ItemType[]} */
export const ITEM_TYPES = ['gear', 'weapon', 'armor', 'helmet', 'gloves', 'greaves', 'shield', 'bow', 'ring', 'consumable'];

/**
 * The 5e armor weight classes. The weight alone fixes how DEX scales the
 * armor's AC — light adds the full DEX modifier, medium caps it at +2, heavy
 * ignores DEX entirely (never a penalty) — while the base AC stays
 * configurable per item, defaulting to a representative 5e value.
 * @type {{ key: ArmorWeight, label: string, dexCap: number, defaultBaseAC: number }[]}
 */
export const ARMOR_WEIGHTS = [
  { key: 'light', label: 'Light', dexCap: Infinity, defaultBaseAC: 11 },
  { key: 'medium', label: 'Medium', dexCap: 2, defaultBaseAC: 13 },
  { key: 'heavy', label: 'Heavy', dexCap: 0, defaultBaseAC: 16 },
];

/** Shields always grant a flat +2 AC, per 5e; not configurable. */
export const SHIELD_AC = 2;

/** The item types that carry weapon fields (handling, damage, status effects). */
export const WEAPON_TYPES = ['weapon', 'bow'];

/** Die sizes a damage term may roll, smallest to largest. */
export const DIE_SIZES = [4, 6, 8, 10, 12];

/** The 5e damage types, physical first. */
export const DAMAGE_TYPES = [
  'slashing', 'piercing', 'bludgeoning',
  'acid', 'cold', 'fire', 'force', 'lightning',
  'necrotic', 'poison', 'psychic', 'radiant', 'thunder',
];

/**
 * How a weapon is wielded, which alone fixes the ability behind its damage
 * roll: melee uses STR; finesse and ranged use DEX.
 * @type {{ key: import('../types/entities.js').WeaponHandling, label: string, ability: 'STR' | 'DEX' }[]}
 */
export const WEAPON_HANDLING = [
  { key: 'melee', label: 'Melee', ability: 'STR' },
  { key: 'finesse', label: 'Finesse', ability: 'DEX' },
  { key: 'ranged', label: 'Ranged', ability: 'DEX' },
];

/**
 * 5e-standard weapon presets: picking one fills a new weapon's base damage
 * and handling, which the GM may then adjust freely.
 * @type {{ name: string, type: ItemType, handling: import('../types/entities.js').WeaponHandling, damage: import('../types/entities.js').DamagePart[] }[]}
 */
export const WEAPON_PRESETS = [
  { name: 'Dagger', type: 'weapon', handling: 'finesse', damage: [{ count: 1, sides: 4, damageType: 'piercing' }] },
  { name: 'Shortsword', type: 'weapon', handling: 'finesse', damage: [{ count: 1, sides: 6, damageType: 'piercing' }] },
  { name: 'Rapier', type: 'weapon', handling: 'finesse', damage: [{ count: 1, sides: 8, damageType: 'piercing' }] },
  { name: 'Quarterstaff', type: 'weapon', handling: 'melee', damage: [{ count: 1, sides: 6, damageType: 'bludgeoning' }] },
  { name: 'Mace', type: 'weapon', handling: 'melee', damage: [{ count: 1, sides: 6, damageType: 'bludgeoning' }] },
  { name: 'Spear', type: 'weapon', handling: 'melee', damage: [{ count: 1, sides: 6, damageType: 'piercing' }] },
  { name: 'Longsword', type: 'weapon', handling: 'melee', damage: [{ count: 1, sides: 8, damageType: 'slashing' }] },
  { name: 'Battleaxe', type: 'weapon', handling: 'melee', damage: [{ count: 1, sides: 8, damageType: 'slashing' }] },
  { name: 'Warhammer', type: 'weapon', handling: 'melee', damage: [{ count: 1, sides: 8, damageType: 'bludgeoning' }] },
  { name: 'Glaive', type: 'weapon', handling: 'melee', damage: [{ count: 1, sides: 10, damageType: 'slashing' }] },
  { name: 'Greataxe', type: 'weapon', handling: 'melee', damage: [{ count: 1, sides: 12, damageType: 'slashing' }] },
  { name: 'Greatsword', type: 'weapon', handling: 'melee', damage: [{ count: 2, sides: 6, damageType: 'slashing' }] },
  { name: 'Maul', type: 'weapon', handling: 'melee', damage: [{ count: 2, sides: 6, damageType: 'bludgeoning' }] },
  { name: 'Shortbow', type: 'bow', handling: 'ranged', damage: [{ count: 1, sides: 6, damageType: 'piercing' }] },
  { name: 'Longbow', type: 'bow', handling: 'ranged', damage: [{ count: 1, sides: 8, damageType: 'piercing' }] },
  { name: 'Light Crossbow', type: 'bow', handling: 'ranged', damage: [{ count: 1, sides: 8, damageType: 'piercing' }] },
  { name: 'Heavy Crossbow', type: 'bow', handling: 'ranged', damage: [{ count: 1, sides: 10, damageType: 'piercing' }] },
];

/**
 * The ability score modifying a weapon's damage roll, from its handling:
 * melee (and absent handling) reads STR, finesse and ranged read DEX. Also
 * accepts an enemy's assigned weapon, which carries the same handling field.
 * @param {InventoryItem | import('../types/entities.js').EnemyWeapon} item
 * @returns {'STR' | 'DEX'}
 */
export function weaponAbility(item) {
  const handling = WEAPON_HANDLING.find((h) => h.key === (item.handling ?? 'melee'));
  return handling?.ability ?? 'STR';
}

/**
 * A damage roll's dice terms as text: "2d6 slashing + 1d4 fire".
 * @param {import('../types/entities.js').DamagePart[]} parts
 * @returns {string}
 */
export function formatDamage(parts) {
  return parts
    .filter((p) => p.count > 0)
    .map((p) => `${p.count}d${p.sides} ${p.damageType}`.trim())
    .join(' + ');
}

/** @returns {Equipment} every slot empty */
export function emptyEquipment() {
  return {
    helmet: null,
    chest: null,
    gloves: null,
    greaves: null,
    mainHand: null,
    offHand: null,
    ranged: null,
    accessory: null,
    accessory2: null,
  };
}

/**
 * Normalize an equipment record from any era: the pre-piecewise 'armor' slot
 * carries over into 'chest' (unless chest is already set), unknown keys drop,
 * and missing slots fill in empty. Pure.
 * @param {Record<string, string | null> | undefined} equipment
 * @returns {Equipment}
 */
export function migrateEquipment(equipment) {
  const empty = emptyEquipment();
  if (!equipment) return empty;
  /** @type {Equipment} */
  const next = { ...empty };
  for (const key of Object.keys(empty)) {
    const value = equipment[key];
    if (value !== undefined) next[/** @type {EquipmentSlot} */ (key)] = value;
  }
  if (next.chest === null && typeof equipment.armor === 'string') next.chest = equipment.armor;
  return next;
}

/**
 * An item's classification, defaulting the absent field on older saves.
 * @param {InventoryItem} item
 * @returns {ItemType}
 */
export function itemType(item) {
  return item.type ?? 'gear';
}

/**
 * Whether a slot accepts an item's type — the rule the pickers filter by and
 * `equip` enforces.
 * @param {EquipmentSlot} slot
 * @param {InventoryItem} item
 * @returns {boolean}
 */
export function slotAccepts(slot, item) {
  const spec = EQUIPMENT_SLOTS.find((s) => s.key === slot);
  return spec !== undefined && spec.accepts.includes(itemType(item));
}

/**
 * Equip an inventory item (by id) into a slot, or clear the slot with null.
 * Equipping an item the slot doesn't accept (or one not in the inventory) is
 * a no-op, so a potion can never end up worn as armor. Pure.
 * @param {Character} character
 * @param {EquipmentSlot} slot
 * @param {string | null} itemId
 * @returns {Character}
 */
export function equip(character, slot, itemId) {
  if (itemId !== null) {
    const item = character.inventory.find((i) => i.id === itemId);
    if (!item || !slotAccepts(slot, item)) return character;
  }
  return { ...character, equipment: { ...migrateEquipment(character.equipment), [slot]: itemId } };
}

/**
 * The inventory item equipped in a slot, or null when the slot is empty or
 * the referenced stack has left the inventory.
 * @param {Character} character
 * @param {EquipmentSlot} slot
 * @returns {InventoryItem | null}
 */
export function getEquipped(character, slot) {
  const id = character.equipment?.[slot] ?? null;
  return id === null ? null : character.inventory.find((i) => i.id === id) ?? null;
}

/**
 * Normalize an inventory item from any era. Pre-weight-class body armor
 * carried a flat acBonus on top of 10 + DEX; that reads as light armor (full
 * DEX scaling, same total) with a base AC of 10 + the old bonus. Shields drop
 * any stored bonus — they are always +2 now. Pure; unchanged items return
 * the same reference.
 * @param {InventoryItem} item
 * @returns {InventoryItem}
 */
export function migrateItem(item) {
  if (item.type === 'armor' && item.baseAC === undefined) {
    const { acBonus, ...rest } = item;
    return { ...rest, armorWeight: item.armorWeight ?? 'light', baseAC: 10 + (acBonus ?? 0) };
  }
  if (item.type === 'shield' && item.acBonus !== undefined) {
    const { acBonus: _dropped, ...rest } = item;
    return rest;
  }
  return item;
}

/** Every item currently equipped in some slot.
 * @param {Character} character
 * @returns {InventoryItem[]} */
function equippedItems(character) {
  return EQUIPMENT_SLOTS.flatMap((slot) => {
    const item = getEquipped(character, slot.key);
    return item ? [item] : [];
  });
}

/**
 * The equipped items a character can attack with: whatever occupies the main
 * hand, off hand, and ranged slots and carries a damage roll (a shield in the
 * off hand doesn't qualify). Order follows the slots, so the main weapon
 * lists first.
 * @param {Character} character
 * @returns {InventoryItem[]}
 */
export function equippedWeapons(character) {
  return ['mainHand', 'offHand', 'ranged'].flatMap((slot) => {
    const item = getEquipped(character, /** @type {EquipmentSlot} */ (slot));
    return item && WEAPON_TYPES.includes(itemType(item)) && item.damage?.length ? [item] : [];
  });
}

/**
 * The character's ability scores with equipped-item buffs (e.g. a ring's
 * +2 STR) folded in. Unknown stats pass through untouched.
 * @param {Character} character
 * @returns {Record<string, number>}
 */
export function effectiveStats(character) {
  const stats = { ...character.stats };
  for (const item of equippedItems(character)) {
    for (const [stat, delta] of Object.entries(item.statBonuses ?? {})) {
      stats[stat] = (stats[stat] ?? 10) + delta;
    }
  }
  return stats;
}

/**
 * A character's armor class, 5e-style. Equipped body armor replaces the
 * unarmored baseline with its own base AC plus a DEX contribution fixed by
 * its weight class (light: full modifier, medium: capped at +2, heavy: none);
 * unarmored is the character's base AC (10 unless raised by an effect like
 * Mage Armor) + full DEX. Shields add a flat +2, and every other equipped
 * item adds its flat acBonus. DEX here includes equipped stat buffs.
 * @param {Character} character
 * @returns {number}
 */
export function armorClass(character) {
  const dexMod = abilityModifier(effectiveStats(character).DEX ?? 10);
  const body = getEquipped(character, 'chest');
  let ac;
  if (body && body.baseAC !== undefined) {
    const weight = ARMOR_WEIGHTS.find((w) => w.key === (body.armorWeight ?? 'light')) ?? ARMOR_WEIGHTS[0];
    // Heavy armor ignores DEX outright (a negative modifier doesn't hurt);
    // otherwise the modifier applies up to the weight's cap.
    ac = body.baseAC + (weight.dexCap === 0 ? 0 : Math.min(dexMod, weight.dexCap));
  } else {
    ac = (character.baseAC ?? 10) + dexMod;
  }
  for (const item of equippedItems(character)) {
    if (item === body) continue;
    ac += itemType(item) === 'shield' ? SHIELD_AC : item.acBonus ?? 0;
  }
  return ac;
}

/**
 * A short human-readable summary of an item's mechanical effects, for the
 * inventory list and slot pickers: "light armor, AC 12 + DEX", "+2 AC",
 * "+2 STR"... Empty string for a plain item.
 * @param {InventoryItem} item
 * @returns {string}
 */
export function itemSummary(item) {
  /** @type {string[]} */
  const parts = [];
  const type = itemType(item);
  if (type === 'armor' && item.baseAC !== undefined) {
    const weight = ARMOR_WEIGHTS.find((w) => w.key === (item.armorWeight ?? 'light')) ?? ARMOR_WEIGHTS[0];
    const dex = weight.dexCap === 0 ? '' : weight.dexCap === Infinity ? ' + DEX' : ` + DEX (max ${weight.dexCap})`;
    parts.push(`${weight.key} armor, AC ${item.baseAC}${dex}`);
  } else if (type === 'shield') {
    parts.push(`+${SHIELD_AC} AC`);
  } else if (item.acBonus) {
    parts.push(`+${item.acBonus} AC`);
  }
  if (WEAPON_TYPES.includes(type) && item.damage?.length) {
    const dice = formatDamage(item.damage);
    if (dice) parts.push(`${dice} (${weaponAbility(item)})`);
  }
  for (const [stat, delta] of Object.entries(item.statBonuses ?? {})) {
    if (delta !== 0) parts.push(`${delta > 0 ? '+' : ''}${delta} ${stat}`);
  }
  if (item.statusEffects?.length) parts.push(`inflicts ${item.statusEffects.join(', ')}`);
  return parts.join(', ');
}

/**
 * Filter and order an inventory for display: a case-insensitive text query
 * matched against name and description, an optional type to keep, and a sort
 * key — by name, by type (then name), or by quantity (largest stacks first).
 * Pure; never mutates the input.
 * @param {InventoryItem[]} items
 * @param {{ query?: string, type?: ItemType | '', sort?: 'name' | 'type' | 'quantity' }} [view]
 * @returns {InventoryItem[]}
 */
export function filterItems(items, view = {}) {
  const query = (view.query ?? '').trim().toLowerCase();
  const matches = items.filter((item) => {
    if (view.type && itemType(item) !== view.type) return false;
    if (!query) return true;
    return (
      item.name.toLowerCase().includes(query) ||
      (item.description ?? '').toLowerCase().includes(query)
    );
  });
  const sort = view.sort ?? 'name';
  return matches.sort((a, b) => {
    if (sort === 'quantity') return b.quantity - a.quantity || a.name.localeCompare(b.name);
    if (sort === 'type') return itemType(a).localeCompare(itemType(b)) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}

/**
 * Clear any slot referencing an item no longer in the inventory (removing the
 * last of a stack also unequips it) or one the slot no longer accepts (editing
 * a worn ring into gear also takes it off). Returns the character unchanged
 * when nothing dangles. Pure.
 * @param {Character} character
 * @returns {Character}
 */
export function pruneEquipment(character) {
  const equipment = character.equipment;
  if (!equipment) return character;
  const items = new Map(character.inventory.map((i) => [i.id, i]));
  /** @param {string} slot @param {string | null} id */
  const valid = (slot, id) => {
    if (id === null) return true;
    const item = items.get(id);
    return item !== undefined && slotAccepts(/** @type {EquipmentSlot} */ (slot), item);
  };
  const entries = Object.entries(equipment);
  if (entries.every(([slot, id]) => valid(slot, id))) return character;
  return {
    ...character,
    equipment: /** @type {Equipment} */ (
      Object.fromEntries(entries.map(([slot, id]) => [slot, valid(slot, id) ? id : null]))
    ),
  };
}
