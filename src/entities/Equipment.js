import { abilityModifier } from './Modifiers.js';
import { abilityLabel, hasWeaponProperty, weaponKind } from './Weapons.js';
import { indexById } from '../util/indexById.js';
import { memoizeByIdentity } from '../util/memoize.js';
import { clampInt } from '../util/num.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../types/entities.js').ArmorWeight} ArmorWeight */
/** @typedef {import('../types/entities.js').Equipment} Equipment */
/** @typedef {import('../types/entities.js').EquipmentSlot} EquipmentSlot */

/**
 * The wearable slots on a character, in display order. Each slot accepts
 * only the item types listed. A potion cannot be worn as armor. Body armor
 * (the 'armor' type) goes in the chest slot. Helmets, gloves, and greaves
 * are separate flat-bonus pieces.
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

/** The item classifications, in the display order of the add form. 'armor'
 * is body armor. Consumables and gear cannot be equipped anywhere.
 * @type {ItemType[]} */
export const ITEM_TYPES = [
  'gear',
  'weapon',
  'armor',
  'helmet',
  'gloves',
  'greaves',
  'shield',
  'bow',
  'ring',
  'consumable',
];

/**
 * The 5e armor weight classes. The weight class alone fixes how DEX scales
 * the armor's AC. Light armor adds the full DEX modifier. Medium armor caps
 * the DEX modifier at +2. Heavy armor ignores DEX entirely and never applies
 * a penalty. The base AC stays configurable per item, and it defaults to a
 * representative 5e value.
 * @type {{ key: ArmorWeight, label: string, dexCap: number, defaultBaseAC: number }[]}
 */
export const ARMOR_WEIGHTS = [
  { key: 'light', label: 'Light', dexCap: Infinity, defaultBaseAC: 11 },
  { key: 'medium', label: 'Medium', dexCap: 2, defaultBaseAC: 13 },
  { key: 'heavy', label: 'Heavy', dexCap: 0, defaultBaseAC: 16 },
];

/** Shields always grant a flat +2 AC, per 5e rule. This value is not configurable. */
export const SHIELD_AC = 2;

/** The item types that carry weapon fields (handling, damage, status effects). */
export const WEAPON_TYPES = ['weapon', 'bow'];

/** Die sizes a damage term may roll, smallest to largest. */
export const DIE_SIZES = [4, 6, 8, 10, 12];

/** The 5e damage types, physical first. */
export const DAMAGE_TYPES = [
  'slashing',
  'piercing',
  'bludgeoning',
  'acid',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'poison',
  'psychic',
  'radiant',
  'thunder',
];

/** Restorative dice are not damage. Healing is its own one-entry vocabulary
 * instead of a fourteenth damage type. A weapon must not deal healing damage. */
export const HEALING_TYPE = 'healing';
export const HEALING_TYPES = [HEALING_TYPE];

/**
 * Coerce an unknown value into one well-formed damage term, with at least one
 * die, a die size, and a type drawn from `allowed`. This function lives here
 * because the type lists live here, so a change to either needs only one
 * validator update. A caller that normalizes restorative dice passes
 * `HEALING_TYPES`. This keeps a heal effect from being repaired into a
 * slashing effect. This function is pure.
 * @param {unknown} part
 * @param {string[]} [allowed] the damage types this term can carry
 * @returns {DamagePart}
 */
export function normalizeDamagePart(part, allowed = DAMAGE_TYPES) {
  const raw = /** @type {Record<string, unknown>} */ (part ?? {});
  const bonus = Math.trunc(Number(raw.bonus)) || 0;
  // A term with a flat bonus can roll no dice. This is how a fixed amount is
  // written. A term without a bonus always rolls at least one die, so a
  // garbled count still reads as 1 instead of as nothing.
  const floor = bonus === 0 ? 1 : 0;
  return {
    count: clampInt(raw.count, floor, Infinity, floor),
    sides: DIE_SIZES.includes(Number(raw.sides)) ? Number(raw.sides) : DIE_SIZES[0],
    damageType: /** @type {string} */ (
      allowed.includes(/** @type {string} */ (raw.damageType)) ? raw.damageType : allowed[0]
    ),
    ...(bonus === 0 ? {} : { bonus }),
  };
}

/**
 * Whether a damage term contributes anything: it either rolls dice or carries
 * a flat bonus. `rollDamage` makes the same check on its own instead of
 * importing this function, because the dice layer imports nothing.
 * @param {import('../types/entities.js').DamagePart} part
 * @returns {boolean}
 */
function damagePartRolls(part) {
  return part.count > 0 || (part.bonus ?? 0) !== 0;
}

/**
 * The legacy handling enum, kept only for the item form's select. The kind
 * and property fields in Weapons.js replace it, and the form moves to them
 * next.
 * @deprecated
 * @type {{ key: import('../types/entities.js').WeaponHandling, label: string, ability: 'STR' | 'DEX' }[]}
 */
export const WEAPON_HANDLING = [
  { key: 'melee', label: 'Melee', ability: 'STR' },
  { key: 'finesse', label: 'Finesse', ability: 'DEX' },
  { key: 'ranged', label: 'Ranged', ability: 'DEX' },
];

/**
 * A damage roll's dice terms as text, for example "2d6 slashing + 1d4 fire".
 * A term's flat bonus rides its dice, for example "1d4+1 force". A term with
 * no dice prints the bonus alone, for example "+1 healing".
 * @param {import('../types/entities.js').DamagePart[]} parts
 * @returns {string}
 */
export function formatDamage(parts) {
  return parts
    .filter(damagePartRolls)
    .map((p) => {
      const bonus = p.bonus ?? 0;
      const sign = bonus === 0 ? '' : `${bonus > 0 ? '+' : '-'}${Math.abs(bonus)}`;
      const dice = p.count > 0 ? `${p.count}d${p.sides}` : '';
      return `${dice}${sign} ${p.damageType}`.trim();
    })
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
 * Normalize an equipment record from any era. The pre-piecewise 'armor' slot
 * carries over into 'chest' unless chest is already set. Unknown keys drop.
 * Missing slots fill in as empty. This function is pure.
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
 * An item's classification, with a default for the absent field on older saves.
 * @param {InventoryItem} item
 * @returns {ItemType}
 */
export function itemType(item) {
  return item.type ?? 'gear';
}

/**
 * Whether an item is a component pouch or a spellcasting focus. The flag is
 * the only signal. A stack named "Component Pouch" that nobody flagged is
 * ordinary gear, and a flagged "Wand of the War Mage" is a focus. Both preset
 * pickers and the item form set the flag, so there are two ways to get one.
 * @param {InventoryItem} item
 * @returns {boolean}
 */
export function isSpellFocus(item) {
  return item.spellFocus === true;
}

/**
 * Whether an inventory holds a pouch or a focus. Carrying one is enough. The
 * app does not track which hand is free, and gear has no equipment slot, so
 * requiring the focus to be equipped would make the common case unreachable.
 * A value that is not an array, which is every combatant without an
 * inventory, holds nothing.
 * @param {InventoryItem[] | undefined} inventory
 * @returns {boolean}
 */
export function carriesSpellFocus(inventory) {
  return Array.isArray(inventory) && inventory.some(isSpellFocus);
}

/**
 * Whether a slot accepts an item's type. The pickers filter by this rule, and
 * `equip` enforces it.
 * @param {EquipmentSlot} slot
 * @param {InventoryItem} item
 * @returns {boolean}
 */
export function slotAccepts(slot, item) {
  const spec = EQUIPMENT_SLOTS.find((s) => s.key === slot);
  return spec !== undefined && spec.accepts.includes(itemType(item));
}

/**
 * Equip an inventory item, by id, into a slot, or clear the slot with null.
 * Equipping an item that the slot does not accept, or an item not in the
 * inventory, does nothing. This keeps a potion from ever being worn as
 * armor. This function is pure.
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
 * The filled slots of a character, in `EQUIPMENT_SLOTS` order, resolved to
 * the inventory items behind them. This result is memoized on the character.
 * The character sheet asks what is worn a dozen or more times per render,
 * once per ability breakdown and again for AC. Each of those calls scanned
 * all nine slots against the whole inventory. Caching is safe because a
 * character is never mutated in place. Every writer returns a new object.
 * @type {(character: Character) => Map<EquipmentSlot, InventoryItem>}
 */
export const equippedIndex = memoizeByIdentity((/** @type {Character} */ character) => {
  /** @type {Map<EquipmentSlot, InventoryItem>} */
  const worn = new Map();
  const equipment = character.equipment;
  if (!equipment) return worn;
  const items = indexById(character.inventory);
  for (const slot of EQUIPMENT_SLOTS) {
    const id = equipment[slot.key] ?? null;
    const item = id === null ? undefined : items.get(id);
    if (item) worn.set(slot.key, item);
  }
  return worn;
});

/**
 * The inventory item equipped in a slot, or null when the slot is empty or
 * the referenced stack has left the inventory.
 * @param {Character} character
 * @param {EquipmentSlot} slot
 * @returns {InventoryItem | null}
 */
export function getEquipped(character, slot) {
  return equippedIndex(character).get(slot) ?? null;
}

/**
 * Normalize an inventory item from any era. Pre-weight-class body armor
 * carried a flat acBonus on top of 10 + DEX. This reads as light armor, with
 * full DEX scaling and the same total, and a base AC of 10 + the old bonus.
 * Shields drop any stored bonus, because shields are always +2 now. This
 * function is pure. Unchanged items return the same reference.
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
  return [...equippedIndex(character).values()];
}

/**
 * The equipped items a character can attack with. This is whatever occupies
 * the main hand, off hand, and ranged slots and carries a damage roll. A
 * shield in the off hand does not qualify. Order follows the slots, so the
 * main weapon lists first.
 * @param {Character} character
 * @returns {InventoryItem[]}
 */
export function equippedWeapons(character) {
  const worn = equippedIndex(character);
  return ['mainHand', 'offHand', 'ranged'].flatMap((slot) => {
    const item = worn.get(/** @type {EquipmentSlot} */ (slot));
    return item && WEAPON_TYPES.includes(itemType(item)) && item.damage?.length ? [item] : [];
  });
}

/**
 * The character's ability scores with equipped-item buffs folded in, for
 * example a ring's +2 STR. Unknown stats pass through untouched.
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
 * A character's armor class, in 5e style. Equipped body armor replaces the
 * unarmored baseline with its own base AC plus a DEX contribution set by its
 * weight class. Light armor adds the full DEX modifier. Medium armor caps
 * the DEX modifier at +2. Heavy armor ignores DEX. Unarmored AC is the base
 * AC, which is 10 by default or higher from an effect like Mage Armor, plus
 * the full DEX modifier. Shields add a flat +2. Every other equipped item
 * adds its own flat acBonus. DEX here includes equipped stat buffs.
 * @param {Character} character
 * @returns {number}
 */
export function armorClass(character) {
  const dexMod = abilityModifier(effectiveStats(character).DEX ?? 10);
  const body = getEquipped(character, 'chest');
  let ac;
  if (body && body.baseAC !== undefined) {
    const weight =
      ARMOR_WEIGHTS.find((w) => w.key === (body.armorWeight ?? 'light')) ?? ARMOR_WEIGHTS[0];
    // Heavy armor ignores DEX completely, so a negative modifier does not
    // hurt. Otherwise the modifier applies up to the weight's cap.
    ac = body.baseAC + (weight.dexCap === 0 ? 0 : Math.min(dexMod, weight.dexCap));
  } else {
    ac = (character.baseAC ?? 10) + dexMod;
  }
  for (const item of equippedItems(character)) {
    if (item === body) continue;
    ac += itemType(item) === 'shield' ? SHIELD_AC : (item.acBonus ?? 0);
  }
  return ac;
}

/**
 * An item's mechanical effects, as one short phrase each, for example
 * "light armor, AC 12 + DEX", "+2 AC", "+2 STR", or "inflicts burning". A
 * modifier-heavy item can show one badge per effect. This list is empty for
 * a plain item.
 * @param {InventoryItem} item
 * @returns {string[]}
 */
export function itemEffects(item) {
  /** @type {string[]} */
  const parts = [];
  const type = itemType(item);
  if (type === 'armor' && item.baseAC !== undefined) {
    const weight =
      ARMOR_WEIGHTS.find((w) => w.key === (item.armorWeight ?? 'light')) ?? ARMOR_WEIGHTS[0];
    const dex =
      weight.dexCap === 0
        ? ''
        : weight.dexCap === Infinity
          ? ' + DEX'
          : ` + DEX (max ${weight.dexCap})`;
    parts.push(`${weight.key} armor, AC ${item.baseAC}${dex}`);
  } else if (type === 'shield') {
    parts.push(`+${SHIELD_AC} AC`);
  } else if (item.acBonus) {
    parts.push(`+${item.acBonus} AC`);
  }
  if (WEAPON_TYPES.includes(type) && item.damage?.length) {
    const dice = formatDamage(item.damage);
    if (dice) parts.push(`${dice} (${abilityLabel(item)})`);
    if (hasWeaponProperty(item, 'versatile') && item.versatileDamage?.length) {
      parts.push(`versatile ${formatDamage(item.versatileDamage)}`);
    }
    if (item.properties?.length) parts.push(item.properties.join(', '));
    if (weaponKind(item) === 'ranged' || hasWeaponProperty(item, 'thrown')) {
      if (item.range) parts.push(`range ${item.range.normal}/${item.range.long}`);
    }
  }
  for (const [stat, delta] of Object.entries(item.statBonuses ?? {})) {
    if (delta !== 0) parts.push(`${delta > 0 ? '+' : ''}${delta} ${stat}`);
  }
  if (item.statusEffects?.length) parts.push(`inflicts ${item.statusEffects.join(', ')}`);
  // This is what tells a GM, from the inventory list alone, which stack is
  // covering the cost-free components of every spell.
  if (isSpellFocus(item)) parts.push('spellcasting focus');
  return parts;
}

/**
 * The same effects joined into one line, for plain-text spots like the
 * equipment slot pickers' option labels. Empty string for a plain item.
 * @param {InventoryItem} item
 * @returns {string}
 */
export function itemSummary(item) {
  return itemEffects(item).join(', ');
}

/**
 * Filter an inventory for display and put it in name order. A
 * case-insensitive text query matches against name and description, with an
 * optional type to keep. Type ordering is the job of `groupItemsByType`,
 * because the panel shows the list under one heading per type.
 * This function is pure and never mutates the input.
 * @param {InventoryItem[]} items
 * @param {{ query?: string, type?: ItemType | '' }} [view]
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
  return matches.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Split an already-filtered item list into one group per classification, in
 * `ITEM_TYPES` order, and keep each group's incoming order. Types that
 * nobody carries are left out, so the caller renders only the groups that
 * have contents. This function is pure and never mutates the input.
 * @param {InventoryItem[]} items
 * @returns {{ type: ItemType, items: InventoryItem[] }[]}
 */
export function groupItemsByType(items) {
  /** @type {Map<ItemType, InventoryItem[]>} */
  const groups = new Map();
  for (const item of items) {
    const type = itemType(item);
    const group = groups.get(type);
    if (group) group.push(item);
    else groups.set(type, [item]);
  }
  return ITEM_TYPES.filter((type) => groups.has(type)).map((type) => ({
    type,
    items: /** @type {InventoryItem[]} */ (groups.get(type)),
  }));
}

/**
 * Whether an item is spent by using it. This is the one classification whose
 * stack count decreases through play, not because the GM removes it.
 * @param {InventoryItem} item
 * @returns {boolean}
 */
export function isConsumable(item) {
  return itemType(item) === 'consumable';
}

/**
 * Clear any slot that references an item no longer in the inventory, or an
 * item the slot no longer accepts. Removing the last of a stack also
 * unequips it. Editing a worn ring into gear also takes it off. This
 * function returns the character unchanged when nothing dangles. It is pure.
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
