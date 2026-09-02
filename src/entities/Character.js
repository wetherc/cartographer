import {
  createResource,
  spend as spendPool,
  restore as restorePool,
  setMax,
  adjustMax,
} from './Resource.js';
import { HP_RESOURCE_ID } from './PoolIds.js';
import { updateById } from './Roster.js';
import { isSlotPool, isPactPool } from './SpellSlots.js';
import { isHitDicePool } from './HitDice.js';
import { derive } from './Progression.js';
import { clearDying, isDead } from './DeathSaves.js';
import { easeExhaustion, exhaustionFields } from './Exhaustion.js';
import { cantripLimit, preparedLimit } from './Classes.js';
import { emptyEquipment, migrateEquipment, migrateItem, pruneEquipment } from './Equipment.js';
import { ABILITY_SCORES } from './Modifiers.js';
import { emptyProficiencies, normalizeProficiencies } from './Proficiencies.js';
import { getClasses, sanitizeClasses } from './Multiclass.js';
import { migrateASIChoices } from './LevelUp.js';
import { clamp, clampInt } from '../util/num.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */
/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */

/** XP required to go from level N to N+1 is N * XP_PER_LEVEL. */
export const XP_PER_LEVEL = 100;

/** The highest level a character reaches. XP past the last threshold stays banked. */
export const MAX_LEVEL = 20;

/** The six ability scores every character carries, in conventional order.
 * Defined beside STAT_KEYS in Modifiers.js, so the enemy stat set derives
 * from it. Re-exported here because character code is its natural import
 * site. */
export { ABILITY_SCORES } from './Modifiers.js';

/** @returns {Record<string, number>} every ability score at the neutral 10 */
export function defaultStats() {
  return Object.fromEntries(ABILITY_SCORES.map((key) => [key, 10]));
}

/**
 * Reserved ResourcePool id for a character's hit points. HP is a regular
 * pool, so damage and heal reuse the existing spend and restore machinery.
 * A character without this pool simply has no HP tracking (older saves).
 * Declared in PoolIds.js, which the pool modules below this one can also
 * import. Re-exported here because character code is its natural import
 * site.
 */
export { HP_RESOURCE_ID } from './PoolIds.js';

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
 *
 * A hand-typed maximum also sets `hpOverride`. This takes the character off
 * the derived HP rule for good. From here on, `Progression.derive` leaves
 * the pool alone, rather than pulling it back to what the class list and
 * CON imply.
 * @param {Character} character
 * @param {number} max
 * @returns {Character}
 */
export function setMaxHP(character, max) {
  const clamped = Math.max(1, Math.floor(max) || 1);
  return {
    ...character,
    hpOverride: true,
    resources: updateById(character.resources, HP_RESOURCE_ID, (r) => setMax(r, clamped)),
  };
}

/**
 * Set the character's bonus HP: temporary hit points granted by items or
 * boons, tracked on top of the intrinsic HP pool. Never negative. This
 * function is pure.
 * @param {Character} character
 * @param {number} amount
 * @returns {Character}
 */
export function setBonusHP(character, amount) {
  return { ...character, bonusHP: Math.max(0, Math.floor(amount) || 0) };
}

/**
 * Set the character's unarmored base AC: normally 10, raised by effects like
 * Mage Armor (13 plus DEX). This only matters while no body armor is
 * equipped, since body armor replaces the unarmored baseline entirely. At
 * least 1. This function is pure.
 * @param {Character} character
 * @param {number} value
 * @returns {Character}
 */
export function setBaseAC(character, value) {
  const parsed = Math.floor(value);
  return { ...character, baseAC: Number.isFinite(parsed) ? Math.max(1, parsed) : 10 };
}

/**
 * Apply damage. Bonus HP absorbs it first (temporary points are lost before
 * real ones), and only the remainder drains the HP pool. Healing is separate
 * (restoreResource) and never refills bonus HP. Bonus HP is granted, not
 * healed.
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

/** The class-list accessor lives with the rest of the class-list mechanics.
 * Re-exported here because character code is its natural import site. */
export { getClasses } from './Multiclass.js';

/** @returns {Spellbook} an empty spellbook (no cantrips, known, or prepared). */
export function emptySpellbook() {
  return { cantrips: [], known: [], prepared: [] };
}

/**
 * A detached copy of a spellbook, arrays and the sources map included. Used
 * where a library template's spellbook is stamped onto a campaign entity.
 * The template is shared, read-only data, so the entity needs its own lists
 * to learn or prepare spells through. This function is pure.
 * @param {Spellbook} book
 * @returns {Spellbook}
 */
export function copySpellbook(book) {
  return {
    cantrips: [...(book.cantrips ?? [])],
    known: [...(book.known ?? [])],
    prepared: [...(book.prepared ?? [])],
    ...(book.sources ? { sources: { ...book.sources } } : {}),
  };
}

/**
 * A character's spellbook, or an empty one for a character that predates
 * spellbooks (so callers never guard against undefined).
 * @param {{ spellbook?: Spellbook }} character
 * @returns {Spellbook}
 */
export function getSpellbook(character) {
  return character.spellbook ?? emptySpellbook();
}

/**
 * Record which class a spell was learned under, when the caller names one.
 * @param {Spellbook} book
 * @param {string} spellId
 * @param {string} [classId]
 * @returns {Spellbook}
 */
function withSource(book, spellId, classId) {
  if (!classId) return book;
  return { ...book, sources: { ...book.sources, [spellId]: classId } };
}

/**
 * Drop a forgotten spell's source record, if it had one.
 * @param {Spellbook} book
 * @param {string} spellId
 * @returns {Spellbook}
 */
function withoutSource(book, spellId) {
  if (!book.sources || !(spellId in book.sources)) return book;
  const sources = { ...book.sources };
  delete sources[spellId];
  return { ...book, sources };
}

/**
 * The class a spell was learned under, or null when none was recorded (a
 * single-class book, or an older save). Casting falls back to the first
 * caster class then.
 * @param {{ spellbook?: Spellbook }} character
 * @param {string} spellId
 * @returns {string | null}
 */
export function spellSource(character, spellId) {
  return getSpellbook(character).sources?.[spellId] ?? null;
}

/**
 * Learn a cantrip, up to the class's cantrip limit. A duplicate, or a learn
 * that exceeds the limit leaves the character unchanged. `classId`
 * (optional) records which class the cantrip is learned under, for a
 * multiclass caster's per-class spell ability. This function is pure.
 * @param {Character} character
 * @param {string} spellId
 * @param {string} [classId]
 * @returns {Character}
 */
export function learnCantrip(character, spellId, classId) {
  const book = getSpellbook(character);
  if (book.cantrips.includes(spellId) || book.cantrips.length >= cantripLimit(character)) {
    return character;
  }
  const next = withSource({ ...book, cantrips: [...book.cantrips, spellId] }, spellId, classId);
  return { ...character, spellbook: next };
}

/**
 * Forget a cantrip. Absent from the list -> unchanged. This function is pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function unlearnCantrip(character, spellId) {
  const book = getSpellbook(character);
  const next = withoutSource(
    { ...book, cantrips: book.cantrips.filter((id) => id !== spellId) },
    spellId,
  );
  return { ...character, spellbook: next };
}

/**
 * Add a leveled spell to the known list. A duplicate leaves the character
 * unchanged. Known-list size is not capped here (no spells-known curve is
 * modeled yet). The prepared set is what the prepared limit bounds.
 * `classId` (optional) records which class the spell is learned under. This
 * function is pure.
 * @param {Character} character
 * @param {string} spellId
 * @param {string} [classId]
 * @returns {Character}
 */
export function learnSpell(character, spellId, classId) {
  const book = getSpellbook(character);
  if (book.known.includes(spellId)) return character;
  const next = withSource({ ...book, known: [...book.known, spellId] }, spellId, classId);
  return { ...character, spellbook: next };
}

/**
 * Forget a leveled spell, dropping it from both the known and prepared lists.
 * This function is pure.
 * @param {Character} character
 * @param {string} spellId
 * @returns {Character}
 */
export function unlearnSpell(character, spellId) {
  const book = getSpellbook(character);
  const next = withoutSource(
    {
      ...book,
      known: book.known.filter((id) => id !== spellId),
      prepared: book.prepared.filter((id) => id !== spellId),
    },
    spellId,
  );
  return { ...character, spellbook: next };
}

/**
 * Prepare a known leveled spell, up to the prepared limit. A spell not in the
 * known list, a duplicate, or a prepare that exceeds the limit leaves the
 * character unchanged. This function is pure.
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
 * unchanged. This function is pure.
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
 * Fill in fields that a loaded character can predate: any missing ability
 * score at the neutral 10 (keeping existing values), and an empty-string
 * race. The function does not invent an HP pool. Its absence legitimately
 * means "no HP tracking". A pre-equipment save gets empty slots, with the
 * pre-piecewise 'armor' slot carrying over into 'chest'. A pre-spellbook
 * save gains an empty spellbook. A pre-proficiency save gains empty
 * proficiency lists. A save whose weapon proficiencies are one flat list has
 * them sorted into the category and named lists they are now kept in. A save
 * that keeps expertise beside the proficiencies, rather than inside them, has
 * it folded in. A pre-multiclass save's scalar `class` and `subclass` fields
 * fold into a one-entry class list at the character's level. The class
 * list is sanitized on the way in, so a hand-edited one whose levels
 * oversell the character's level comes back trimmed to fit, instead of
 * hiding levels still to be assigned. A save whose ability-score-improvement
 * choices are still an array becomes the record keyed by slot, with each
 * choice keeping its position as its order. A save that carries exhaustion as
 * a condition chip, from before it had a level behind it, reads as level 1 and
 * loses the chip.
 *
 * Shape is only half the job. The loaded pools are also reconciled against
 * the class list, level, and CON through `Progression.derive`. A save
 * hand-edited between sessions, or one written before a class definition's
 * hit die or caster type changed in the library, comes back consistent
 * instead of carrying the stale maxima forever.
 * @param {Character} character
 * @returns {Character}
 */
export function withDefaults(character) {
  const {
    class: legacyClass,
    subclass: legacySubclass,
    expertise: legacyExpertise,
    ...rest
  } = /** @type {Character & { class?: string, subclass?: string, expertise?: string[] }} */ (
    character
  );
  // The level and XP are clamped here, not only in the derived reads. A save
  // can carry a level as a string or far outside the range, and `addXP`
  // computes from the stored values.
  const level = clampInt(character.level, 1, MAX_LEVEL, 1);
  const classes = sanitizeClasses(
    character.classes ??
      (legacyClass ? [{ classId: legacyClass, level, subclass: legacySubclass }] : []),
    level,
  );
  return derive({
    ...rest,
    level,
    xp: clampInt(character.xp, 0, XP_PER_LEVEL * MAX_LEVEL, 0),
    race: character.race ?? '',
    classes,
    stats: { ...defaultStats(), ...character.stats },
    resources: character.resources ?? [],
    ...exhaustionFields(character.exhaustion, character.conditions ?? []),
    concentration: character.concentration ?? null,
    deathSaves: character.deathSaves ?? null,
    equipment: migrateEquipment(character.equipment),
    inventory: (character.inventory ?? []).map(migrateItem),
    bonusHP: character.bonusHP ?? 0,
    baseAC: character.baseAC ?? 10,
    location: character.location ?? null,
    spellbook: character.spellbook ?? emptySpellbook(),
    proficiencies: character.proficiencies
      ? normalizeProficiencies({
          ...character.proficiencies,
          expertise: character.proficiencies.expertise ?? legacyExpertise,
        })
      : emptyProficiencies(),
    asiChoices: migrateASIChoices(character.asiChoices ?? {}, classes[0]?.classId ?? ''),
  });
}

/**
 * Create a level 1 character with no resources or inventory. All six ability
 * scores start at 10. `stats` overrides individual scores.
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
    classes: [],
    level: 1,
    xp: 0,
    stats: { ...defaultStats(), ...stats },
    resources: [],
    inventory: [],
    conditions: [],
    concentration: null,
    deathSaves: null,
    equipment: emptyEquipment(),
    bonusHP: 0,
    baseAC: 10,
    location: null,
    spellbook: emptySpellbook(),
    proficiencies: emptyProficiencies(),
  };
}

/**
 * Default per-level growth for a pool: a tenth of its maximum, at least 1, so
 * a bigger pool scales faster while a small one still grows each level. This
 * is the fallback for classless characters, whose growth cannot come from a
 * hit die.
 * @param {number} max
 * @returns {number}
 */
function defaultGrowth(max) {
  return Math.max(1, Math.ceil(max * 0.1));
}

/**
 * The XP a climb from level `from` to level `to` costs: the sum of
 * n * XP_PER_LEVEL for every level n from `from` up to `to - 1`.
 * @param {number} from
 * @param {number} to
 * @returns {number}
 */
function xpBetween(from, to) {
  const steps = to - from;
  return XP_PER_LEVEL * (steps * from + (steps * (steps - 1)) / 2);
}

/**
 * How many levels `xp` points buy from `level`, capped at MAX_LEVEL. This is
 * the closed form of "spend one threshold and climb while the bank covers
 * it". The largest whole k with xpBetween(level, level + k) <= xp is the
 * positive root of k^2 + (2 * level - 1) * k - 2 * xp / XP_PER_LEVEL. A loop
 * over the thresholds does the same work, but its length grows with the
 * stored values, and a level far below 1 from a bad save never finished.
 * @param {number} level
 * @param {number} xp
 * @returns {number}
 */
function levelsGained(level, xp) {
  const b = 2 * level - 1;
  const k = Math.floor((-b + Math.sqrt(b * b + (8 * xp) / XP_PER_LEVEL)) / 2);
  return Math.max(0, Math.min(MAX_LEVEL - level, k || 0));
}

/**
 * Add XP, auto-leveling up (possibly multiple times) as the character
 * crosses thresholds. For a classed character, every gained level stays
 * pending until the player assigns it to a class (see Multiclass.js's
 * pendingLevels). HP growth, the hit die, spell slots, and ASI or feature
 * grants all follow the assigned class, so they land in
 * LevelAssign.assignLevel rather than here. Barring an explicit
 * `opts.hpGrowth`, the HP pool stays untouched. A classless character has
 * nothing to assign, so its HP pool grows immediately: by `opts.hpGrowth`
 * if given, otherwise a tenth of the pool's max per level. Characters with
 * no HP pool level up without any pool change.
 *
 * `opts.hpGrowth` on a classed character is a deliberate step outside the
 * class HP rule, so it sets `hpOverride` the same way a hand-typed maximum
 * does. Without that, the reconcile at the end pulls the pool straight
 * back to the class-derived value.
 * @param {Character} character
 * @param {number} amount
 * @param {{ hpGrowth?: number }} [opts]
 * @returns {Character}
 */
export function addXP(character, amount, opts = {}) {
  const startLevel = character.level;
  const banked = character.xp + amount;
  const gained = levelsGained(startLevel, banked);
  const level = startLevel + gained;
  // At the top level the bank stops at the last threshold, so the live value
  // equals what a reload of the same character gives.
  const spent = banked - xpBetween(startLevel, level);
  const xp = level === MAX_LEVEL ? Math.min(spent, XP_PER_LEVEL * MAX_LEVEL) : spent;
  if (gained === 0) return { ...character, level, xp };

  const classed = getClasses(character).length > 0;
  const resources = updateById(character.resources, HP_RESOURCE_ID, (r) => {
    const perLevel = opts.hpGrowth ?? (classed ? 0 : defaultGrowth(r.max));
    return adjustMax(r, r.max + perLevel * gained);
  });
  const overridden = opts.hpGrowth !== undefined ? { hpOverride: true } : {};
  return derive({ ...character, ...overridden, level, xp, resources });
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
 * Spend from one of an entity's resource pools. This function is generic
 * over the holder. A caster that is not a Character (a spellcasting foe or
 * NPC, seen through `Caster.toCaster`) can spend a spell slot through the
 * same function and get its own type back.
 * @template {{ resources: ResourcePool[] }} T
 * @param {T} character
 * @param {string} resourceId
 * @param {number} amount
 * @returns {T}
 */
export function spendResource(character, resourceId, amount) {
  return {
    ...character,
    resources: updateById(character.resources, resourceId, (r) => spendPool(r, amount)),
  };
}

/**
 * Put points back into one pool.
 *
 * Healing the HP pool above 0 also ends a death-save tracker, and takes the
 * Unconscious chip with it. The rule lives here because this is the one
 * function every heal goes through: the combat screen's heal control, the
 * sheet's HP stepper, a healing spell, and a rest. Any of them can be the one
 * that brings a character back, and a character standing at 5 HP must not
 * still read as dying.
 * @param {Character} character
 * @param {string} resourceId
 * @param {number} amount
 * @returns {Character}
 */
export function restoreResource(character, resourceId, amount) {
  const next = {
    ...character,
    resources: updateById(character.resources, resourceId, (r) => restorePool(r, amount)),
  };
  if (resourceId !== HP_RESOURCE_ID || !character.deathSaves) return next;
  return (getHP(next)?.current ?? 0) > 0 ? clearDying(next) : next;
}

/**
 * Restore every resource pool (HP and any custom pool) by a fraction of its
 * max, clamped to full. The rest model: a long rest restores everything
 * (fraction 1), and a short rest restores half (fraction 0.5). Spell slots
 * follow the D&D rule instead. Only a full rest (fraction 1) refills them.
 * Anything less leaves them untouched. Pact slots refill in full on a short
 * or long rest (fraction 0.5 and up). Hit dice ignore short rests, since
 * they are what a short rest spends. A long rest restores half of each
 * die-size pool, at least one die. This function is pure.
 * @param {Character} character
 * @param {number} fraction 0..1
 * @returns {Character}
 */
export function restAll(character, fraction) {
  const clamped = clamp(fraction, 0, 1);
  return {
    ...character,
    resources: character.resources.map((r) => {
      if (isSlotPool(r)) return clamped < 1 ? r : restorePool(r, r.max);
      if (isPactPool(r)) return clamped < 0.5 ? r : restorePool(r, r.max);
      if (isHitDicePool(r)) {
        return clamped < 1 ? r : restorePool(r, Math.max(1, Math.floor(r.max / 2)));
      }
      return restorePool(r, Math.ceil(r.max * clamped));
    }),
  };
}

/**
 * A long rest: fully restore HP, spell slots, and every resource pool. It also
 * eases one level of exhaustion.
 *
 * A dead character keeps its level. The Time panel rests every character at
 * once and does not ask who is still alive, so the guard belongs here rather
 * than at the call site. `Exhaustion.easeExhaustion` cannot hold it, because it
 * cannot read a death-save tracker without an import cycle.
 * @param {Character} character
 * @returns {Character}
 */
export function longRest(character) {
  const rested = restAll(character, 1);
  return isDead(rested) ? rested : easeExhaustion(rested);
}

/**
 * A short rest: restore half of each pool's maximum. Spell slots stay spent.
 * Pact slots refill in full.
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
    inventory: updateById(character.inventory, item.id, (i) => ({
      ...i,
      quantity: i.quantity + item.quantity,
    })),
  };
}

/**
 * Hand part of a stack (or all of it) from one party member to another. The
 * giver loses `quantity`, unequipping the item if the whole stack goes, and
 * the receiver gains it, merging into an existing stack with the same id.
 * A missing item, a non-positive count, or self-transfer changes nothing.
 * This function is pure and returns both updated characters.
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
 * edited item as a whole, not a patch. A field absent from `next` is gone.
 * Any slot that no longer accepts the edited item unequips it. This
 * function is pure.
 * @param {Character} character
 * @param {string} itemId
 * @param {InventoryItem} next
 * @returns {Character}
 */
export function updateItem(character, itemId, next) {
  return pruneEquipment({
    ...character,
    inventory: updateById(character.inventory, itemId, (i) => ({ ...next, id: i.id })),
  });
}

/**
 * Remove quantity from a stack, dropping it from the inventory entirely once
 * it hits 0, and unequipping it from any slot it occupied.
 * @param {Character} character
 * @param {string} itemId
 * @param {number} quantity
 * @returns {Character}
 */
export function removeItem(character, itemId, quantity) {
  const inventory = updateById(character.inventory, itemId, (i) => ({
    ...i,
    quantity: Math.max(0, i.quantity - quantity),
  })).filter((i) => i.quantity > 0);
  return pruneEquipment({ ...character, inventory });
}
