import { abilityModifier } from './Modifiers.js';
import { isProficientArmor } from './Proficiencies.js';
import { unarmoredDefenses } from './Classes.js';
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

/** The AC a shield adds when it carries no bonus of its own. A shield stores
 * its bonus in `acBonus`, the same field every other worn piece uses, so a
 * homebrew tower shield can add more than the 5e standard +2. An absent field
 * reads as this value. */
export const SHIELD_AC = 2;

/** The item types that carry weapon fields (kind, properties, damage, status effects). */
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
 * This function is pure. Unchanged items return the same reference.
 * @param {InventoryItem} item
 * @returns {InventoryItem}
 */
export function migrateItem(item) {
  if (item.type === 'armor' && item.baseAC === undefined) {
    const { acBonus, ...rest } = item;
    return { ...rest, armorWeight: item.armorWeight ?? 'light', baseAC: 10 + (acBonus ?? 0) };
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
 * the full DEX modifier. A Barbarian or a Monk with an empty chest slot also
 * gets the unarmored defense formula of its class, and takes whichever result
 * is higher. A shield adds its own bonus, which is +2 unless the item says
 * otherwise. Every other equipped item adds its own flat acBonus. DEX here
 * includes equipped stat buffs.
 * @param {Character} character
 * @returns {number}
 */
export function armorClass(character) {
  const stats = effectiveStats(character);
  const dexMod = abilityModifier(stats.DEX ?? 10);
  const worn = equippedIndex(character);
  const body = worn.get('chest');
  let ac;
  if (body && body.baseAC !== undefined) {
    const weight =
      ARMOR_WEIGHTS.find((w) => w.key === (body.armorWeight ?? 'light')) ?? ARMOR_WEIGHTS[0];
    // Heavy armor ignores DEX completely, so a negative modifier does not
    // hurt. Otherwise the modifier applies up to the weight's cap.
    ac = body.baseAC + (weight.dexCap === 0 ? 0 : Math.min(dexMod, weight.dexCap));
  } else {
    const base = character.baseAC ?? 10;
    ac = base + dexMod;
    // The formula runs only with the chest slot empty. A chest item with no
    // base AC lands in this branch too, and something is worn in that case,
    // so the class feature does not apply.
    //
    // A base AC below 10 is a GM-applied debuff. The formula would erase it,
    // because it starts from a literal 10, so a debuffed character keeps the
    // ordinary result instead.
    if (!body && base >= 10) {
      const off = worn.get('offHand');
      const shielded = !!off && itemType(off) === 'shield';
      for (const grant of unarmoredDefenses(character)) {
        if (shielded && !grant.shield) continue;
        ac = Math.max(ac, 10 + dexMod + abilityModifier(stats[grant.ability] ?? 10));
      }
    }
  }
  for (const item of equippedItems(character)) {
    if (item === body) continue;
    ac += itemACBonus(item);
  }
  return ac;
}

/**
 * The worn pieces the character is not proficient with, as short phrases for
 * a message, for example `['medium armor', 'shield']`. Body armor checks its
 * weight class and a worn shield checks the shield grant. An empty list means
 * the character wears nothing beyond its training. A character without
 * proficiency lists predates them, so it reads as proficient with everything,
 * the same as the weapon gate.
 *
 * Two slots are enough to cover every piece. `armorClass` reads body armor
 * from the chest slot, and `EQUIPMENT_SLOTS` lets a shield into the off hand
 * alone, so no other slot can hold something this gate would name.
 * @param {Character} character
 * @returns {string[]}
 */
export function unproficientWear(character) {
  if (!character.proficiencies) return [];
  const worn = equippedIndex(character);
  const phrases = [];
  const body = worn.get('chest');
  if (body && body.baseAC !== undefined) {
    const weight = body.armorWeight ?? 'light';
    if (!isProficientArmor(character, weight)) phrases.push(`${weight} armor`);
  }
  const off = worn.get('offHand');
  if (off && itemType(off) === 'shield' && !isProficientArmor(character, 'shield')) {
    phrases.push('a shield');
  }
  return phrases;
}

/**
 * The two body-armor traits of an item, read tolerantly. A library file can
 * put anything in either field, because `Library.normalizeLibrary` passes a
 * non-weapon entry through untouched, so this is the one place that decides
 * what the stored values mean. Anything but a literal `true` is quiet armor,
 * and a Strength requirement that is not a positive whole number is no
 * requirement. An item that is not body armor has neither trait.
 * @param {InventoryItem | null | undefined} item
 * @returns {{ stealthDisadvantage: boolean, strength: number }}
 */
export function armorTraits(item) {
  if (!item || itemType(item) !== 'armor') return { stealthDisadvantage: false, strength: 0 };
  const strength = Math.floor(Number(item.strength));
  return {
    stealthDisadvantage: item.stealthDisadvantage === true,
    strength: strength > 0 ? strength : 0,
  };
}

/**
 * The flat AC an equipped item adds, read tolerantly for the same reason as
 * `armorTraits`: a library file or a hand-edited save can store anything in
 * `acBonus`. A value that is not a whole number reads as absent. A shield
 * whose stored value is absent or not a positive whole number adds the 5e
 * standard `SHIELD_AC`, because the item form never writes a zero for one.
 * Any other item with no usable value adds nothing.
 * @param {InventoryItem} item
 * @returns {number}
 */
export function itemACBonus(item) {
  const bonus = Math.trunc(Number(item.acBonus));
  if (itemType(item) === 'shield') return bonus > 0 ? bonus : SHIELD_AC;
  return Number.isFinite(bonus) ? bonus : 0;
}

/**
 * The name of the worn body armor when it slants Stealth, else null. Noisy
 * armor gives the wearer disadvantage on every Stealth check, whether or not
 * the character is trained for the armor.
 * @param {Character} character
 * @returns {string | null}
 */
export function stealthPenalty(character) {
  const body = equippedIndex(character).get('chest');
  return armorTraits(body).stealthDisadvantage ? (body?.name ?? 'armor') : null;
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
    const traits = armorTraits(item);
    if (traits.strength) parts.push(`needs STR ${traits.strength}`);
    if (traits.stealthDisadvantage) parts.push('stealth disadvantage');
  } else if (type === 'shield') {
    // A shield with no stored bonus adds the 5e standard, so the badge states
    // that value rather than nothing.
    parts.push(`+${itemACBonus(item)} AC`);
  } else if (itemACBonus(item)) {
    parts.push(`+${itemACBonus(item)} AC`);
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
