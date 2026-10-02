import {
  createResource,
  spend as spendPool,
  restore as restorePool,
  setMax,
  adjustMax,
} from './Resource.js';
import { HP_RESOURCE_ID } from './PoolIds.js';
import { updateById } from './Roster.js';
import { endOnDamage } from './Conditions.js';
import { isSlotPool, isPactPool } from './SpellSlots.js';
import { isHitDicePool, restoreHitDice } from './HitDice.js';
import { derive } from './Progression.js';
import { clearDying, isDead } from './DeathSaves.js';
import { easeExhaustion, exhaustionFields } from './Exhaustion.js';
import { emptyEquipment, migrateEquipment, migrateItem } from './Equipment.js';
import { ABILITY_SCORES } from './Modifiers.js';
import { emptyProficiencies, normalizeProficiencies } from './Proficiencies.js';
import { getClasses, sanitizeClasses } from './Multiclass.js';
import { migrateASIChoices } from './LevelUp.js';
import { clamp, clampInt } from '../util/num.js';
import {
  coerceHPBuffs,
  conditionList,
  recordList,
  spellbookOf,
  warlockPicks,
} from './LoadCoercion.js';
import { MAX_LEVEL, levelForXp, xpForLevel } from './Experience.js';
import { emptySpellbook } from './CharacterSpellbook.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ResourcePool} ResourcePool */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */
/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */

/** The highest level a character reaches. Declared in Experience.js with the
 * XP table. Re-exported here because character code is its natural import
 * site. */
export { MAX_LEVEL } from './Experience.js';

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
 * boons, tracked on top of the intrinsic HP pool. Never negative. A typed
 * amount belongs to the GM, so it no longer ends with the chip of a spell
 * that granted the old amount. This function is pure.
 * @param {Character} character
 * @param {number} amount
 * @returns {Character}
 */
export function setBonusHP(character, amount) {
  const { bonusHPFrom: _from, ...rest } = character;
  return { ...rest, bonusHP: Math.max(0, Math.floor(amount) || 0) };
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
 * healed. Any damage, even damage that bonus HP absorbs, ends a chip that
 * damage ends (Sleep).
 * @param {Character} character
 * @param {number} amount
 * @returns {Character}
 */
export function damageCharacter(character, amount) {
  const conditions =
    amount > 0 && character.conditions ? endOnDamage(character.conditions) : character.conditions;
  const woken = conditions === character.conditions ? character : { ...character, conditions };
  const bonus = woken.bonusHP ?? 0;
  const absorbed = Math.min(bonus, amount);
  const next = absorbed > 0 ? { ...woken, bonusHP: bonus - absorbed } : woken;
  const remainder = amount - absorbed;
  return remainder > 0 ? spendResource(next, HP_RESOURCE_ID, remainder) : next;
}

/** The class-list accessor lives with the rest of the class-list mechanics.
 * Re-exported here because character code is its natural import site. */
export { getClasses } from './Multiclass.js';

/** The spellbook and inventory writes live in their own modules. They are
 * re-exported here because most callers import the character model from
 * this file. */
export {
  emptySpellbook,
  copySpellbook,
  getSpellbook,
  spellSource,
  learnCantrip,
  unlearnCantrip,
  learnSpell,
  unlearnSpell,
  prepareSpell,
  unprepareSpell,
} from './CharacterSpellbook.js';
export { addItem, addGold, transferItem, updateItem, removeItem } from './CharacterInventory.js';

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
 * loses the chip. A warlock's invocation lists and pact boon go through
 * `warlockPicks`, which drops what is not a string id.
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
    invocations: _invocations,
    invocationUses: _uses,
    pactBoon: _boon,
    ...rest
  } = /** @type {Character & { class?: string, subclass?: string, expertise?: string[] }} */ (
    character
  );
  // The level and XP are clamped here, not only in the derived reads. A save
  // can carry a level as a string or far outside the range, and `addXP`
  // computes from the stored values. The XP total is at least the start of
  // the stored level, so a character made at level 3 starts at 900 XP and
  // the next award counts toward level 4.
  const level = clampInt(character.level, 1, MAX_LEVEL, 1);
  const classes = sanitizeClasses(
    character.classes ??
      (legacyClass ? [{ classId: legacyClass, level, subclass: legacySubclass }] : []),
    level,
  );
  return derive({
    ...coerceHPBuffs(rest),
    level,
    xp: clampInt(character.xp, xpForLevel(level), xpForLevel(MAX_LEVEL)),
    race: character.race ?? '',
    classes,
    stats: { ...defaultStats(), ...character.stats },
    resources: recordList(character.resources),
    ...exhaustionFields(character.exhaustion, conditionList(character.conditions)),
    concentration: character.concentration ?? null,
    deathSaves: character.deathSaves ?? null,
    equipment: migrateEquipment(character.equipment),
    inventory: recordList(character.inventory).map(migrateItem),
    bonusHP: character.bonusHP ?? 0,
    baseAC: character.baseAC ?? 10,
    location: character.location ?? null,
    spellbook: spellbookOf(character.spellbook) ?? emptySpellbook(),
    proficiencies: character.proficiencies
      ? normalizeProficiencies({
          ...character.proficiencies,
          expertise: character.proficiencies.expertise ?? legacyExpertise,
        })
      : emptyProficiencies(),
    asiChoices: migrateASIChoices(character.asiChoices ?? {}, classes[0]?.classId ?? ''),
    ...warlockPicks(character),
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
 * Add XP to the character's total, and level up (possibly several times)
 * for each threshold of the SRD table that the new total crosses. The total
 * stays between the start of the current level and the start of MAX_LEVEL,
 * so a negative amount never takes a level away, and the live value equals
 * what a reload of the same character gives. For a classed character,
 * every gained level stays pending until the player assigns it to a class
 * (see Multiclass.js's pendingLevels). HP growth, the hit die, spell
 * slots, and ASI or feature grants all follow the assigned class, so they
 * land in LevelAssign.assignLevel rather than here. Barring an explicit
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
  const floor = xpForLevel(startLevel);
  const xp = clamp(Math.max(character.xp, floor) + amount, floor, xpForLevel(MAX_LEVEL));
  const level = Math.max(startLevel, levelForXp(xp));
  const gained = level - startLevel;
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
 *
 * A dead character (three failed death saves) regains no HP, so the HP pool
 * and the tracker stay as they are. Only a spell that raises the dead brings
 * the character back, and it clears the tracker first (see
 * `CharacterHit.healCharacter`).
 * @param {Character} character
 * @param {string} resourceId
 * @param {number} amount
 * @returns {Character}
 */
export function restoreResource(character, resourceId, amount) {
  if (resourceId === HP_RESOURCE_ID && isDead(character)) return character;
  const next = {
    ...character,
    resources: updateById(character.resources, resourceId, (r) => restorePool(r, amount)),
  };
  if (resourceId !== HP_RESOURCE_ID || !character.deathSaves) return next;
  return (getHP(next)?.current ?? 0) > 0 ? clearDying(next) : next;
}

/**
 * Refill the resource pools that a rest of the given kind recharges. A long
 * rest refills HP, spell slots, pact slots, and every other pool, and it
 * restores half of the total hit dice (see `HitDice.restoreHitDice`). A
 * short rest refills pact slots and each pool whose `recharge` is 'short',
 * such as Second Wind, Action Surge, ki, and Channel Divinity. A pool with
 * no `recharge` refills only on a long rest, and a pool whose `recharge` is
 * 'none' refills on no rest. A short rest adds `shortRestRegain` points to a
 * pool that it does not refill in full. A short rest heals nothing,
 * because in 5e a short rest heals only through the hit dice a character
 * spends. A rest that lifts HP above 0 clears the dying state, the same as
 * any other heal (see `restoreResource`). A dead character regains no HP
 * from a rest. This function is pure.
 * @param {Character} character
 * @param {import('../types/entities.js').Recharge} kind
 * @returns {Character}
 */
export function restAll(character, kind) {
  const long = kind === 'long';
  const dead = isDead(character);
  const pools = character.resources.map((r) => {
    if ((r.id === HP_RESOURCE_ID && dead) || isHitDicePool(r)) return r;
    const special = r.id === HP_RESOURCE_ID || isSlotPool(r);
    const own = special || isPactPool(r) ? undefined : r.recharge;
    if (own === 'none') return r;
    const refills = long || isPactPool(r) || own === 'short';
    if (refills) return restorePool(r, r.max);
    return r.shortRestRegain ? restorePool(r, r.shortRestRegain) : r;
  });
  const resources = long ? restoreHitDice(pools) : pools;
  const rested = { ...character, resources };
  const before = getHP(character)?.current ?? 0;
  const after = getHP(rested)?.current ?? 0;
  return character.deathSaves && after > before ? clearDying(rested) : rested;
}

/**
 * A long rest: fully restore HP, spell slots, and every resource pool. It also
 * eases one level of exhaustion and gives back the once-per-rest invocations.
 *
 * A dead character keeps its level. The Time panel rests every character at
 * once and does not ask who is still alive, so the guard belongs here rather
 * than at the call site. `Exhaustion.easeExhaustion` cannot hold it, because it
 * cannot read a death-save tracker without an import cycle.
 * @param {Character} character
 * @returns {Character}
 */
export function longRest(character) {
  const { invocationUses: _uses, ...rest } = restAll(character, 'long');
  return isDead(rest) ? rest : easeExhaustion(rest);
}

/**
 * A short rest: refill pact slots and every short-rest pool. HP, spell
 * slots, hit dice, and the long-rest pools stay as they are, because in 5e a
 * short rest heals only through the hit dice a character spends.
 * @param {Character} character
 * @returns {Character}
 */
export function shortRest(character) {
  return restAll(character, 'short');
}
