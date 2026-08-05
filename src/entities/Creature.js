import { normalizeStatBlock } from './Modifiers.js';
import { WEAPON_PRESETS, enemyArmor, copyEnemyWeapon } from './EquipmentPresets.js';
import { copySpellbook } from './Character.js';
import { withCasterFields, ensureCasterFields, casterTemplateFields } from './Caster.js';
import { isCasterClass } from './Classes.js';
import { isSlotPool } from './SpellSlots.js';
import { atDeathLevel, easeExhaustion, exhaustionFields } from './Exhaustion.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/creature.js').Disposition} Disposition */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */
/** @typedef {import('../types/entities.js').StatModifier} StatModifier */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('../types/entities.js').EnemyArmor} EnemyArmor */
/** @typedef {import('../types/entities.js').Spellbook} Spellbook */

/** The hit points a creature gets when nobody types a number: the 5e
 * commoner's 4. */
export const DEFAULT_CREATURE_HP = 4;

/** The dispositions a creature can hold toward the party. */
export const DISPOSITIONS = /** @type {Disposition[]} */ (['friendly', 'neutral', 'hostile']);

/** The dispositions as select options, shared by every creature form.
 * @returns {{ value: Disposition, label: string }[]} */
export function dispositionOptions() {
  return DISPOSITIONS.map((d) => ({ value: d, label: capitalize(d) }));
}

/**
 * True for a creature, false for a character. A creature always carries a
 * `disposition`, and a character never does. Every consumer that must tell
 * the two apart reads this one test.
 * @param {object} entity
 * @returns {boolean}
 */
export function isCreature(entity) {
  return 'disposition' in entity;
}

/**
 * Resolve one default loadout against the shared preset lists. Called while
 * this module loads rather than per creature, so a rename in
 * EquipmentPresets.js raises one named error at startup instead of a
 * non-null cast crashing on `undefined.name` the first time a campaign
 * loads.
 * @param {string} weaponName
 * @param {string} armorName
 * @returns {{ weapon: (typeof WEAPON_PRESETS)[number], armor: EnemyArmor }}
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
 * @param {EnemyTier} tier
 * @returns {{ weapon: EnemyWeapon, armor: EnemyArmor }}
 */
export function defaultEnemyGear(level, tier) {
  const lvl = Math.max(1, Math.floor(level) || 1);
  const loadout = DEFAULT_LOADOUTS[tier === 'legend' ? 'legend' : 'mob'][lvl < 5 ? 'low' : 'high'];
  return { weapon: copyEnemyWeapon(loadout.weapon), armor: { ...loadout.armor } };
}

/**
 * Clamp a typed maximum to a live creature: at least 1, whole, with the
 * commoner default for a blank or nonsense value.
 * @param {number | undefined} maxHP
 * @returns {number}
 */
function clampMaxHP(maxHP) {
  return Math.max(1, Math.floor(maxHP ?? DEFAULT_CREATURE_HP) || DEFAULT_CREATURE_HP);
}

/**
 * Create a creature at full health. The stat block is closed over the fixed
 * stat set (six abilities plus AC), and AC defaults to 10 plus the DEX
 * modifier.
 *
 * The gear rule is resolved here, once: an explicit weapon or armor is
 * kept, null included. An absent one takes the level or tier default when
 * the creature has a level, and null when it has none. The stored value is
 * always explicit, so no read path derives gear again.
 * @param {string} id
 * @param {string} name
 * @param {{ disposition?: Disposition, maxHP?: number, stats?: Record<string, number>, location?: EncounterLocation | null, met?: boolean, weapon?: EnemyWeapon | null, armor?: EnemyArmor | null, level?: number, tier?: EnemyTier, role?: string, notes?: string, class?: string, subclass?: string, casterLevel?: number, spellbook?: Spellbook }} [options]
 * @returns {Creature}
 */
export function createCreature(id, name, options = {}) {
  const maxHP = clampMaxHP(options.maxHP);
  const hasLevel = options.level != null;
  const tier = options.tier ?? 'mob';
  const stamp = hasLevel ? defaultEnemyGear(/** @type {number} */ (options.level), tier) : null;
  const creature = {
    id,
    name,
    disposition: options.disposition ?? 'neutral',
    maxHP,
    currentHP: maxHP,
    stats: normalizeStatBlock(options.stats ?? {}),
    location: options.location ?? null,
    conditions: [],
    exhaustion: 0,
    met: options.met ?? false,
    weapon: options.weapon !== undefined ? options.weapon : (stamp?.weapon ?? null),
    armor: options.armor !== undefined ? options.armor : (stamp?.armor ?? null),
    ...(hasLevel ? { level: options.level, tier } : {}),
    ...(options.role !== undefined ? { role: options.role } : {}),
    ...(options.notes !== undefined ? { notes: options.notes } : {}),
    ...(options.subclass !== undefined ? { subclass: options.subclass } : {}),
  };
  // A caster class stamps spell slots (rebuilt for its level) and an empty
  // spellbook. A non-caster leaves the creature untouched.
  return withCasterFields(creature, options, options.casterLevel ?? options.level ?? 1);
}

/**
 * Fill in fields that a loaded creature can lack. A creature saved without
 * hit points reads as a commoner at full health. The stat block is
 * re-closed over the fixed stat set, so it gains an AC and drops any stat
 * that is no longer part of the set. Gear backfills to null only. The
 * function never rebuilds a default loadout, because the create and edit
 * paths store gear explicitly. A creature that carries exhaustion as a
 * condition chip, from before it had a level behind it, reads as level 1 and
 * loses the chip.
 * @param {Creature} creature
 * @returns {Creature}
 */
export function withDefaults(creature) {
  const maxHP = clampMaxHP(creature.maxHP);
  return ensureCasterFields(
    {
      ...creature,
      disposition: creature.disposition ?? 'neutral',
      maxHP,
      currentHP: Math.min(maxHP, creature.currentHP ?? maxHP),
      stats: normalizeStatBlock(creature.stats ?? {}),
      location: creature.location ?? null,
      ...exhaustionFields(creature.exhaustion, creature.conditions ?? []),
      met: creature.met ?? false,
      weapon: creature.weapon ?? null,
      armor: creature.armor ?? null,
    },
    creature.casterLevel ?? creature.level ?? 1,
  );
}

/**
 * The stat block a creature fights with: base values, plus the worn armor's
 * flat AC bonus, plus every active timed modifier. Combat math and the Play
 * view must use this value.
 * @param {Creature} creature
 * @returns {Record<string, number>}
 */
export function effectiveStatBlock(creature) {
  const block = normalizeStatBlock(creature.stats ?? {});
  block.AC += creature.armor?.acBonus ?? 0;
  for (const mod of creature.statMods ?? []) {
    if (mod.stat in block) block[mod.stat] += mod.delta;
  }
  return block;
}

/**
 * Add a timed adjustment to one stat: +delta (or -delta) for a number of
 * combat rounds. Modifiers on the same stat stack, and each ticks down on
 * its own.
 * @param {Creature} creature
 * @param {string} stat
 * @param {number} delta
 * @param {number} rounds
 * @returns {Creature}
 */
export function addStatModifier(creature, stat, delta, rounds) {
  if (!delta || rounds < 1) return creature;
  const mod = { stat, delta, rounds: Math.floor(rounds) };
  return { ...creature, statMods: [...(creature.statMods ?? []), mod] };
}

/**
 * Advance one combat round: decrement every stat modifier's counter and
 * drop any that reach zero. This is the stat-block twin of tickConditions.
 * @param {StatModifier[]} mods
 * @returns {StatModifier[]}
 */
export function tickStatModifiers(mods) {
  return mods.map((m) => ({ ...m, rounds: m.rounds - 1 })).filter((m) => m.rounds > 0);
}

/**
 * Apply a GM edit to a creature's blueprint fields and placement, keeping
 * its live state. currentHP survives (clamped to the new maximum), and the
 * conditions stay untouched, so re-tuning a fight in progress does not
 * reset it. The stat block stays untouched too, unless the edit carries a
 * `stats` record, which is what a dialog with stat fields submits. A move
 * clears the `met` flag, so the party landing on the new spot logs a fresh
 * meeting. A blank level removes the level and the tier together.
 *
 * A caster edit that changes the class or caster level rebuilds the slot
 * pools (at full). Dropping the caster class (or setting a non-caster)
 * strips the spell fields. An unchanged class and level keep the current
 * slots, spent and all.
 * @param {Creature} creature
 * @param {{ name: string, disposition: Disposition, maxHP: number, location: EncounterLocation | null, stats?: Record<string, number>, level?: number, tier?: EnemyTier, role?: string, notes?: string, weapon?: EnemyWeapon | null, armor?: EnemyArmor | null, class?: string, subclass?: string, casterLevel?: number, spellbook?: Spellbook }} edits
 * @returns {Creature}
 */
export function editCreature(creature, edits) {
  const maxHP = Math.max(1, edits.maxHP);
  const moved =
    (creature.location?.nodeId ?? null) !== (edits.location?.nodeId ?? null) ||
    (creature.location?.tileId ?? null) !== (edits.location?.tileId ?? null);
  const { level: _level, tier: _tier, ...unleveled } = creature;
  const base = {
    ...unleveled,
    name: edits.name,
    disposition: edits.disposition,
    maxHP,
    currentHP: Math.min(creature.currentHP, maxHP),
    location: edits.location,
    weapon: edits.weapon === undefined ? creature.weapon : edits.weapon,
    armor: edits.armor === undefined ? creature.armor : edits.armor,
    met: moved ? false : creature.met,
    ...(edits.stats !== undefined ? { stats: normalizeStatBlock(edits.stats) } : {}),
    ...(edits.level != null ? { level: edits.level, tier: edits.tier ?? 'mob' } : {}),
    ...(edits.role !== undefined ? { role: edits.role } : {}),
    ...(edits.notes !== undefined ? { notes: edits.notes } : {}),
  };
  return applyCasterEdit(base, creature, edits);
}

/**
 * Reconcile a creature's caster fields against an edit. The function keeps
 * the spellbook across a class or level change (the GM re-picks spells
 * separately), but rebuilds slot pools when either changes. It strips all
 * spell fields when the edit clears the caster class. `editCreature` shares
 * this function.
 * @param {Creature} base the edited creature (non-caster fields applied)
 * @param {Creature} prior the creature before the edit
 * @param {{ level?: number, class?: string, subclass?: string, casterLevel?: number, spellbook?: Spellbook }} edits
 * @returns {Creature}
 */
function applyCasterEdit(base, prior, edits) {
  const wasCaster = isCasterClass(prior.class);
  const level = edits.casterLevel ?? edits.level ?? 1;
  const changed = edits.class !== prior.class || level !== prior.casterLevel;
  if (!isCasterClass(edits.class)) {
    // Dropped to a non-caster: shed the spell fields and slot pools.
    if (!wasCaster) return { ...base, class: edits.class, subclass: edits.subclass };
    const { casterLevel: _lvl, spellbook: _book, ...rest } = base;
    return {
      ...rest,
      class: edits.class,
      subclass: edits.subclass,
      resources: (base.resources ?? []).filter((r) => !isSlotPool(r)),
    };
  }
  if (!changed && wasCaster) {
    // Same caster class and level: keep current (possibly spent) slots.
    return {
      ...base,
      spellbook: edits.spellbook ?? base.spellbook,
      subclass: edits.subclass,
    };
  }
  return withCasterFields({ ...base, spellbook: edits.spellbook ?? prior.spellbook }, edits, level);
}

/**
 * Capture a creature as a reusable template: its blueprint (name,
 * disposition, max HP, stat block, gear), not its live state (current HP,
 * location, conditions, met).
 * @param {string} id
 * @param {Creature} creature
 * @returns {CreatureTemplate}
 */
export function toTemplate(id, creature) {
  return {
    id,
    name: creature.name,
    disposition: creature.disposition ?? 'neutral',
    maxHP: creature.maxHP,
    stats: normalizeStatBlock(creature.stats ?? {}),
    weapon: creature.weapon ?? null,
    armor: creature.armor ?? null,
    ...(creature.level != null ? { level: creature.level, tier: creature.tier ?? 'mob' } : {}),
    ...(creature.role !== undefined ? { role: creature.role } : {}),
    ...(creature.notes !== undefined ? { notes: creature.notes } : {}),
    ...casterTemplateFields(creature),
  };
}

/**
 * Spawn a fresh, full-health creature from a template. Every field carried
 * over is copied, not aliased. A template is shared library data (the
 * built-in list hands out the same entry object to every spawn), so two
 * creatures from one template must not edit one weapon, armor, or
 * spellbook through each other.
 *
 * The read is tolerant on purpose: a library file has no version field, so
 * an imported or hand-edited template can carry an older shape. A
 * `statBlock` field reads as `stats`. A missing disposition reads as
 * hostile, because only foe templates predate the field. Absent gear takes
 * the level default on a leveled template and null on an unleveled one,
 * which is what absence meant in each older shape.
 * @param {CreatureTemplate & { statBlock?: Record<string, number> }} template
 * @param {string} id
 * @param {EncounterLocation | null} [location]
 * @returns {Creature}
 */
export function fromTemplate(template, id, location = null) {
  const level = Number(template.level);
  return createCreature(id, template.name, {
    disposition: DISPOSITIONS.includes(template.disposition) ? template.disposition : 'hostile',
    maxHP: template.maxHP,
    stats: { ...(template.stats ?? template.statBlock ?? {}) },
    location,
    ...(Number.isFinite(level) ? { level, tier: template.tier ?? 'mob' } : {}),
    ...(template.weapon !== undefined
      ? { weapon: template.weapon ? copyEnemyWeapon(template.weapon) : template.weapon }
      : {}),
    ...(template.armor !== undefined
      ? { armor: template.armor ? { ...template.armor } : template.armor }
      : {}),
    ...(template.role !== undefined ? { role: template.role } : {}),
    ...(template.notes !== undefined ? { notes: template.notes } : {}),
    class: template.class,
    subclass: template.subclass,
    casterLevel: template.casterLevel,
    spellbook: template.spellbook ? copySpellbook(template.spellbook) : template.spellbook,
  });
}

/**
 * Apply damage, clamped so currentHP never drops below 0.
 * @param {Creature} creature
 * @param {number} amount
 * @returns {Creature}
 */
export function applyDamage(creature, amount) {
  return { ...creature, currentHP: Math.max(0, creature.currentHP - amount) };
}

/**
 * Heal, clamped so currentHP never exceeds maxHP.
 *
 * A heal that brings a creature off 0 HP also takes one level of exhaustion off
 * a creature at the sixth level. That level is what put the creature down, and
 * leaving it in place would take the creature out again on the next write. This
 * is the creature half of the rule that `DeathSaves.clearDying` holds for a
 * character.
 * @param {Creature} creature
 * @param {number} amount
 * @returns {Creature}
 */
export function heal(creature, amount) {
  const next = { ...creature, currentHP: Math.min(creature.maxHP, creature.currentHP + amount) };
  return next.currentHP > 0 && atDeathLevel(next) ? easeExhaustion(next) : next;
}

/**
 * Whether a creature is out of the fight. 0 HP ends its part in the fight,
 * and it rolls no death saves.
 * @param {Creature} creature
 * @returns {boolean}
 */
export function isDefeated(creature) {
  return creature.currentHP <= 0;
}
