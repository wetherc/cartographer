import { createResource, spend as spendPool, restore as restorePool } from './Resource.js';
import { isSlotPool, syncSlotsToLevel, migrateManaToSlots } from './SpellSlots.js';
import { cantripLimit, preparedLimit } from './Classes.js';
import { emptyEquipment, migrateEquipment, migrateItem, pruneEquipment } from './Equipment.js';
import { ABILITY_SCORES } from './Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */
/** @typedef {import('../types/class.js').ClassRef} ClassRef */

/** XP required to go from level N to N+1 is N * XP_PER_LEVEL. */
export const XP_PER_LEVEL = 100;

/** The six ability scores every character carries, in conventional order.
 * Defined beside STAT_KEYS in Modifiers.js so the enemy stat set derives from
 * it; re-exported here because character code is its natural import site. */
export { ABILITY_SCORES } from './Modifiers.js';

/** @returns {Record<string, number>} every ability score at the neutral 10 */
export function defaultStats() {
  return Object.fromEntries(ABILITY_SCORES.map((key) => [key, 10]));
}

/**
 * Reserved ResourcePool id for a character's hit points. HP is a regular pool
 * so damage/heal reuse the existing spend/restore machinery; a character
 * without this pool simply has no HP tracking (older saves).
 */
export const HP_RESOURCE_ID = 'hp';

/**
 * @param {Character} character
 * @returns {ResourcePool | null} the character's HP pool, if they have one
 */
export function getHP(character) {
  return character.resources.find((r) => r.id === HP_RESOURCE_ID) ?? null;
}

/**
 * Give a character an HP pool at full health, replacing any existing one.
 * @param {Character} character
 * @param {number} maxHP
 * @returns {Character}
 */
export function withHP(character, maxHP) {
  const hp = createResource(HP_RESOURCE_ID, 'HP', 'custom', maxHP);
  const others = character.resources.filter((r) => r.id !== HP_RESOURCE_ID);
  return { ...character, resources: [hp, ...others] };
}

/**
 * Set the HP pool's maximum (the GM's per-character override), keeping current
 * HP but clamping it down if it now exceeds the new maximum. At least 1. A
 * character without an HP pool is returned unchanged.
 * @param {Character} character
 * @param {number} max
 * @returns {Character}
 */
export function setMaxHP(character, max) {
  const clamped = Math.max(1, Math.floor(max) || 1);
  return {
    ...character,
    resources: character.resources.map((r) =>
      r.id === HP_RESOURCE_ID ? { ...r, max: clamped, current: Math.min(r.current, clamped) } : r,
    ),
  };
}

/**
 * Set the character's bonus HP — temporary hit points granted by items or
 * boons, tracked on top of the intrinsic HP pool. Never negative. Pure.
 * @param {Character} character
 * @param {number} amount
 * @returns {Character}
 */
export function setBonusHP(character, amount) {
  return { ...character, bonusHP: Math.max(0, Math.floor(amount) || 0) };
}

/**
 * Set the character's unarmored base AC — normally 10, raised by effects like
 * Mage Armor (13 + DEX). Only matters while no body armor is equipped, since
 * body armor replaces the unarmored baseline entirely. At least 1. Pure.
 * @param {Character} character
 * @param {number} value
 * @returns {Character}
 */
export function setBaseAC(character, value) {
  const parsed = Math.floor(value);
  return { ...character, baseAC: Number.isFinite(parsed) ? Math.max(1, parsed) : 10 };
}

/**
 * Apply damage: bonus HP absorbs it first (temporary points are lost before
 * real ones), and only the remainder drains the HP pool. Healing is separate
 * (restoreResource) and never refills bonus HP — that's granted, not healed.
 * @param {Character} character
 * @param {number} amount
 * @returns {Character}
 */
export function damageCharacter(character, amount) {
  const bonus = character.bonusHP ?? 0;
  const absorbed = Math.min(bonus, amount);
  const next = absorbed > 0 ? { ...character, bonusHP: bonus - absorbed } : character;
  const remainder = amount - absorbed;
  return remainder > 0 ? spendResource(next, HP_RESOURCE_ID, remainder) : next;
}

/**
 * A character's classes as a list — one entry today, since a character carries
 * a single `class`/`subclass`/`level`. Read classes through this accessor
 * rather than the raw fields so the deferred multiclass work (a real class
 * list) stays additive; see PLAN.md's multiclass design decision. A classless
 * legacy character yields an empty list.
 * @param {Character} character
 * @returns {ClassRef[]}
 */
export function getClasses(character) {
  if (!character.class) return [];
  return [{ classId: character.class, level: character.level, subclass: character.subclass }];
}

/** @returns {Spellbook} an empty spellbook (no cantrips, known, or prepared). */
export function emptySpellbook() {
  return { cantrips: [], known: [], prepared: [] };
}

/**
 * A character's spellbook, or an empty one for a character that predates
 * spellbooks (so callers never guard against undefined).
 * @param {Character} character
 * @returns {Spellbook}
 */
export function getSpellbook(character) {
  return character.spellbook ?? emptySpellbook();
}

/**
 * Learn a cantrip, up to the class's cantrip limit. A duplicate, or a learn
 * that would exceed the limit, leaves the character unchanged. Pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function learnCantrip(character, spellId) {
  const book = getSpellbook(character);
  if (book.cantrips.includes(spellId) || book.cantrips.length >= cantripLimit(character)) {
    return character;
  }
  return { ...character, spellbook: { ...book, cantrips: [...book.cantrips, spellId] } };
}

/**
 * Forget a cantrip. Absent from the list -> unchanged. Pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function unlearnCantrip(character, spellId) {
  const book = getSpellbook(character);
  return {
    ...character,
    spellbook: { ...book, cantrips: book.cantrips.filter((id) => id !== spellId) },
  };
}

/**
 * Add a leveled spell to the known list. A duplicate leaves the character
 * unchanged. Known-list size is not capped here (no spells-known curve is
 * modeled yet); the prepared set is what the prepared limit bounds. Pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function learnSpell(character, spellId) {
  const book = getSpellbook(character);
  if (book.known.includes(spellId)) return character;
  return { ...character, spellbook: { ...book, known: [...book.known, spellId] } };
}

/**
 * Forget a leveled spell, dropping it from both the known and prepared lists.
 * Pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function unlearnSpell(character, spellId) {
  const book = getSpellbook(character);
  return {
    ...character,
    spellbook: {
      cantrips: book.cantrips,
      known: book.known.filter((id) => id !== spellId),
      prepared: book.prepared.filter((id) => id !== spellId),
    },
  };
}

/**
 * Prepare a known leveled spell, up to the prepared limit. A spell not in the
 * known list, a duplicate, or a prepare that would exceed the limit leaves the
 * character unchanged. Pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function prepareSpell(character, spellId) {
  const book = getSpellbook(character);
  if (
    !book.known.includes(spellId) ||
    book.prepared.includes(spellId) ||
    book.prepared.length >= preparedLimit(character)
  ) {
    return character;
  }
  return { ...character, spellbook: { ...book, prepared: [...book.prepared, spellId] } };
}

/**
 * Unprepare a spell, keeping it known. Absent from the prepared list ->
 * unchanged. Pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function unprepareSpell(character, spellId) {
  const book = getSpellbook(character);
  return {
    ...character,
    spellbook: { ...book, prepared: book.prepared.filter((id) => id !== spellId) },
  };
}

/**
 * Fill in fields a loaded character may predate: any missing ability score at
 * the neutral 10 (keeping existing values) and an empty-string race. No HP
 * pool is invented — its absence legitimately means "no HP tracking". A
 * mana-era save's mana pool is migrated to spell slots for the character's
 * level (see SpellSlots.js), and a pre-equipment save gets empty slots — with
 * the pre-piecewise 'armor' slot carrying over into 'chest'. A pre-spellbook
 * save gains an empty spellbook.
 * @param {Character} character
 * @returns {Character}
 */
export function withDefaults(character) {
  return migrateManaToSlots({
    ...character,
    race: character.race ?? '',
    stats: { ...defaultStats(), ...character.stats },
    conditions: character.conditions ?? [],
    equipment: migrateEquipment(character.equipment),
    inventory: (character.inventory ?? []).map(migrateItem),
    bonusHP: character.bonusHP ?? 0,
    baseAC: character.baseAC ?? 10,
    location: character.location ?? null,
    spellbook: character.spellbook ?? emptySpellbook(),
  });
}

/**
 * Create a level 1 character with no resources or inventory. All six ability
 * scores start at 10; `stats` overrides individual scores.
 * @param {string} id
 * @param {string} name
 * @param {Record<string, number>} [stats]
 * @param {string} [race]
 * @returns {Character}
 */
export function createCharacter(id, name, stats = {}, race = '') {
  return {
    id,
    name,
    race,
    level: 1,
    xp: 0,
    stats: { ...defaultStats(), ...stats },
    resources: [],
    inventory: [],
    conditions: [],
    equipment: emptyEquipment(),
    bonusHP: 0,
    baseAC: 10,
    location: null,
    spellbook: emptySpellbook(),
  };
}

/**
 * Default per-level growth for a pool: a tenth of its maximum, at least 1, so a
 * bigger pool scales faster while a small one still grows each level.
 * @param {number} max
 * @returns {number}
 */
function defaultGrowth(max) {
  return Math.max(1, Math.ceil(max * 0.1));
}

/**
 * Add XP, auto-leveling up (possibly multiple times) as thresholds are crossed.
 * Each level gained grows the HP pool's maximum (and current, so the gained
 * capacity is immediately usable) by a per-level amount — configurable via
 * `opts`, defaulting to a tenth of the pool's current max — and re-derives a
 * caster's spell-slot pools from the new level (spent slots stay spent).
 * Characters with no HP pool level up without any pool change.
 * @param {Character} character
 * @param {number} amount
 * @param {{ hpGrowth?: number }} [opts]
 * @returns {Character}
 */
export function addXP(character, amount, opts = {}) {
  let { level, xp } = character;
  const startLevel = level;
  xp += amount;
  while (xp >= level * XP_PER_LEVEL) {
    xp -= level * XP_PER_LEVEL;
    level += 1;
  }
  const gained = level - startLevel;
  if (gained === 0) return { ...character, level, xp };

  const resources = character.resources.map((r) => {
    if (r.id !== HP_RESOURCE_ID) return r;
    const added = (opts.hpGrowth ?? defaultGrowth(r.max)) * gained;
    return { ...r, max: r.max + added, current: Math.min(r.max + added, r.current + added) };
  });
  return syncSlotsToLevel({ ...character, level, xp, resources });
}

/**
 * @param {Character} character
 * @param {string} key
 * @param {number} value
 * @returns {Character}
 */
export function setStat(character, key, value) {
  return { ...character, stats: { ...character.stats, [key]: value } };
}

/**
 * @param {Character} character
 * @param {ResourcePool} pool
 * @returns {Character}
 */
export function addResource(character, pool) {
  return { ...character, resources: [...character.resources, pool] };
}

/**
 * @param {Character} character
 * @param {string} resourceId
 * @param {number} amount
 * @returns {Character}
 */
export function spendResource(character, resourceId, amount) {
  return {
    ...character,
    resources: character.resources.map((r) => (r.id === resourceId ? spendPool(r, amount) : r)),
  };
}

/**
 * @param {Character} character
 * @param {string} resourceId
 * @param {number} amount
 * @returns {Character}
 */
export function restoreResource(character, resourceId, amount) {
  return {
    ...character,
    resources: character.resources.map((r) => (r.id === resourceId ? restorePool(r, amount) : r)),
  };
}

/**
 * Restore every resource pool (HP and any custom pool) by a fraction of its
 * max, clamped to full. The rest model: a long rest restores everything
 * (fraction 1), a short rest restores half (fraction 0.5). Spell slots follow
 * the D&D rule instead: only a full rest (fraction 1) refills them; anything
 * less leaves them untouched. Pure.
 * @param {Character} character
 * @param {number} fraction 0..1
 * @returns {Character}
 */
export function restAll(character, fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return {
    ...character,
    resources: character.resources.map((r) =>
      isSlotPool(r) && clamped < 1 ? r : restorePool(r, Math.ceil(r.max * clamped)),
    ),
  };
}

/**
 * A long rest: fully restore HP, spell slots, and every resource pool.
 * @param {Character} character
 * @returns {Character}
 */
export function longRest(character) {
  return restAll(character, 1);
}

/**
 * A short rest: restore half of each pool's maximum; spell slots stay spent.
 * @param {Character} character
 * @returns {Character}
 */
export function shortRest(character) {
  return restAll(character, 0.5);
}

/**
 * Add an item, merging quantity into an existing stack with the same id.
 * @param {Character} character
 * @param {InventoryItem} item
 * @returns {Character}
 */
export function addItem(character, item) {
  const existing = character.inventory.find((i) => i.id === item.id);
  if (!existing) return { ...character, inventory: [...character.inventory, item] };

  return {
    ...character,
    inventory: character.inventory.map((i) =>
      i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i,
    ),
  };
}

/**
 * Hand part of a stack (or all of it) from one party member to another. The
 * giver loses `quantity` — unequipping the item if the whole stack goes — and
 * the receiver gains it, merging into an existing stack with the same id.
 * A missing item, a non-positive count, or self-transfer changes nothing.
 * Pure: returns both updated characters.
 * @param {Character} giver
 * @param {Character} receiver
 * @param {string} itemId
 * @param {number} quantity
 * @returns {{ giver: Character, receiver: Character }}
 */
export function transferItem(giver, receiver, itemId, quantity) {
  const item = giver.inventory.find((i) => i.id === itemId);
  const count = Math.min(Math.floor(quantity), item?.quantity ?? 0);
  if (!item || count < 1 || giver.id === receiver.id) return { giver, receiver };
  return {
    giver: removeItem(giver, itemId, count),
    receiver: addItem(receiver, { ...item, quantity: count }),
  };
}

/**
 * Replace an inventory item's fields wholesale (the GM's post-creation edit),
 * keeping its id so equipment references survive. The replacement is the
 * edited item as a whole, not a patch — a field absent from `next` is gone.
 * Any slot that no longer accepts the edited item unequips it. Pure.
 * @param {Character} character
 * @param {string} itemId
 * @param {InventoryItem} next
 * @returns {Character}
 */
export function updateItem(character, itemId, next) {
  return pruneEquipment({
    ...character,
    inventory: character.inventory.map((i) => (i.id === itemId ? { ...next, id: i.id } : i)),
  });
}

/**
 * Remove quantity from a stack, dropping it from the inventory entirely once
 * it hits 0 — and unequipping it from any slot it occupied.
 * @param {Character} character
 * @param {string} itemId
 * @param {number} quantity
 * @returns {Character}
 */
export function removeItem(character, itemId, quantity) {
  const inventory = character.inventory
    .map((i) => (i.id === itemId ? { ...i, quantity: Math.max(0, i.quantity - quantity) } : i))
    .filter((i) => i.quantity > 0);
  return pruneEquipment({ ...character, inventory });
}
