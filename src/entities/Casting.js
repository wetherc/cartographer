import { roll, rollDamage } from '../dice/DiceRoller.js';
import { getSpellbook, spendResource } from './Character.js';
import { SLOT_ID_PREFIX, PACT_ID_PREFIX } from './SpellSlots.js';

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellScaling} SpellScaling */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */
/** @typedef {import('../types/dice.js').DiceResult} DiceResult */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */
/** @typedef {import('../types/dice.js').RollMode} RollMode */

/**
 * A single target of a cast: its identity plus the numbers the resolver needs —
 * AC for an attack spell, save bonus for a save spell (with an optional
 * advantage/disadvantage mode on that save). Healing targets need only id/name.
 * @typedef {{
 *   id?: string,
 *   name?: string,
 *   ac?: number,
 *   saveBonus?: number,
 *   saveMode?: RollMode,
 * }} CastTarget
 */

/**
 * Cantrip damage scales with caster level, stepping up at the 5e breakpoints
 * 5/11/17 — a level-1 cantrip's base dice grow by one increment at 5th level,
 * two at 11th, three at 17th.
 * @param {number} casterLevel
 * @returns {number} how many `damagePerLevel` increments a cantrip adds
 */
export function cantripStep(casterLevel) {
  if (casterLevel >= 17) return 3;
  if (casterLevel >= 11) return 2;
  if (casterLevel >= 5) return 1;
  return 0;
}

/**
 * The number of scaling increments a cast applies: for a cantrip, the caster's
 * level step (above); for a leveled spell, every slot level above the spell's
 * own level (upcasting). Exported because the cast dialog needs the same count
 * to work out how many targets to offer before the cast is resolved.
 * @param {Spell} spell
 * @param {number} slotLevel
 * @param {number} casterLevel
 * @returns {number}
 */
export function scalingSteps(spell, slotLevel, casterLevel) {
  return spell.level === 0 ? cantripStep(casterLevel) : Math.max(0, slotLevel - spell.level);
}

/** The most creatures a spell may name as a fixed target count. Past this a
 * spell is describing an area, which `targetCount: 0` says directly. */
export const MAX_TARGET_COUNT = 20;

/**
 * A written target count read as a number: floored, held to 0..20, with blank or
 * unparsable input falling back (1 for the authoring form, since a spell that
 * says nothing about its targets hits one creature). Shared by the authoring
 * form and the library normalizer so both agree that 0 means an area — the
 * general `clampInt` cannot express that, since its missing-value fallback
 * treats a deliberate 0 as nothing written.
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function normalizeTargetCount(value, fallback = 1) {
  if (value === '' || value === null || value === undefined) return fallback;
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count)) return fallback;
  return Math.min(MAX_TARGET_COUNT, Math.max(0, count));
}

/**
 * How many creatures one cast may resolve against: the spell's own
 * `targetCount` (absent counts as 1), plus one more per scaling increment when
 * the spell scales targets. A `targetCount` of 0 marks an area spell, where the
 * number of creatures caught is a fact about the map rather than the spell, so
 * the cap is unbounded and the caster picks.
 *
 * Note this counts *creatures*, not dice. Spells that fire several projectiles
 * at one creature (Magic Missile, Scorching Ray, Eldritch Blast) carry all of
 * them in one damage term and stay single-target, because dividing projectiles
 * between creatures needs a per-creature allocation the resolver has no shape
 * for.
 * @param {Spell} spell
 * @param {number} steps how many scaling increments the cast applies
 * @returns {number} the cap, or Infinity for an area spell
 */
export function maxTargets(spell, steps) {
  const base = spell.targetCount ?? 1;
  if (base <= 0) return Infinity;
  return base + (spell.scaling?.targetsPerLevel ?? 0) * Math.max(0, steps);
}

/**
 * A spell's base damage/healing dice grown by its scaling: the base parts, plus
 * `damagePerLevel` appended once per scaling increment. Returns fresh copies so
 * a later crit-doubling never mutates the spell's stored dice.
 * @param {DamagePart[]} baseParts
 * @param {SpellScaling | undefined} scaling
 * @param {number} steps
 * @returns {DamagePart[]}
 */
function scaledParts(baseParts, scaling, steps) {
  const parts = baseParts.map((p) => ({ ...p }));
  if (scaling?.damagePerLevel && steps > 0) {
    for (let i = 0; i < steps; i++) {
      for (const part of scaling.damagePerLevel) parts.push({ ...part });
    }
  }
  return parts;
}

/**
 * Whether a caster's spellbook lets it cast this spell: cantrips must be in the
 * cantrip list; leveled spells must be prepared or known (both known-list and
 * prepared-list casters cast from the union, since the resolver doesn't model
 * the distinction). A caster whose class stores no spellbook (e.g. a legacy
 * character) can't cast.
 * @param {Character} caster
 * @param {Spell} spell
 * @returns {boolean}
 */
export function canCast(caster, spell) {
  const book = getSpellbook(caster);
  if (spell.level === 0) return book.cantrips.includes(spell.id);
  return book.prepared.includes(spell.id) || book.known.includes(spell.id);
}

/**
 * The pool id a cast at this slot level draws from: the leveled slot pool when
 * it has a charge, else the pact pool at that level (pact slots are cast at
 * exactly their own level), else null when neither has one left.
 * @param {Character} caster
 * @param {number} slotLevel
 * @returns {string | null}
 */
function slotPoolToSpend(caster, slotLevel) {
  for (const id of [`${SLOT_ID_PREFIX}${slotLevel}`, `${PACT_ID_PREFIX}${slotLevel}`]) {
    const pool = caster.resources.find((r) => r.id === id);
    if (pool && pool.current > 0) return id;
  }
  return null;
}

/**
 * Resolve casting a spell: validate the cast, spend the slot, and roll every
 * effect against the targets. Pure — the caller applies the returned damage or
 * healing to targets and logs the result, mirroring how `weaponAttack` leaves
 * application to the app layer.
 *
 * On failure returns `{ ok: false, reason }` with reason one of
 * `'not-known'` (the caster can't cast this spell), `'bad-slot-level'` (the
 * slot is below the spell's level), or `'no-slot'` (no slot of that level
 * left, counting the pact pool at that level). On success returns the caster
 * with the slot spent — from the leveled pool first, then the pact pool;
 * cantrips spend nothing — the targets the cast actually reached, how many were
 * dropped past the spell's cap (`truncated`), and an `outcomes` array whose
 * shape follows the effect kind:
 * - `attack`: one entry per target — its d20 attack roll, whether it hit/crit,
 *   and the damage dealt on a hit (crit doubles the dice).
 * - `save`: the damage rolled once, plus one entry per target with its save
 *   roll, whether it saved, and the damage it takes (full, or half when
 *   `halfOnSave`, or none).
 * - `heal`: the healing rolled once, applied identically to each target.
 * - `utility`: no rolls, an empty `outcomes`.
 *
 * @param {Character} caster
 * @param {Spell} spell
 * @param {{
 *   slotLevel?: number,
 *   targets?: CastTarget[],
 *   spellAttackBonus?: number,
 *   saveDC?: number,
 *   casterLevel?: number,
 *   attackMode?: RollMode,
 *   rng?: RandomFn,
 * }} [options]
 * @returns {(
 *   { ok: false, reason: 'not-known' | 'bad-slot-level' | 'no-slot' } |
 *   { ok: true, caster: Character, spell: Spell, slotLevel: number, spent: boolean,
 *     effect: import('../types/spell.js').SpellEffect['kind'], targets: CastTarget[],
 *     truncated: number, outcomes: object[] }
 * )}
 */
export function castSpell(caster, spell, options = {}) {
  const {
    slotLevel = spell.level,
    targets = [],
    spellAttackBonus = 0,
    saveDC = 0,
    casterLevel = caster.level ?? 1,
    attackMode = 'normal',
    rng = Math.random,
  } = options;

  if (!canCast(caster, spell)) return { ok: false, reason: 'not-known' };

  // A cantrip uses no slot; a leveled spell must be cast at or above its own
  // level and have a slot of that level free.
  const cantrip = spell.level === 0;
  const poolId = cantrip ? null : slotPoolToSpend(caster, slotLevel);
  if (!cantrip) {
    if (slotLevel < spell.level) return { ok: false, reason: 'bad-slot-level' };
    if (!poolId) return { ok: false, reason: 'no-slot' };
  }

  const effectiveSlot = cantrip ? 0 : slotLevel;
  const steps = scalingSteps(spell, effectiveSlot, casterLevel);
  const nextCaster = poolId ? spendResource(caster, poolId, 1) : caster;

  // Over-selecting drops the extra targets rather than failing the cast: the
  // slot is already committed by the time a cap is exceeded, and losing the
  // whole cast is a worse answer than resolving the ones the spell can reach.
  // `truncated` lets the caller say so.
  const cap = maxTargets(spell, steps);
  const reached = targets.length > cap ? targets.slice(0, cap) : targets;

  const outcomes = resolveEffect(spell, {
    steps,
    targets: reached,
    spellAttackBonus,
    saveDC,
    attackMode,
    rng,
  });

  return {
    ok: true,
    caster: nextCaster,
    spell,
    slotLevel: effectiveSlot,
    spent: !cantrip,
    effect: spell.effect.kind,
    targets: reached,
    truncated: targets.length - reached.length,
    outcomes,
  };
}

/**
 * Roll a spell's effect against its targets, dispatched by effect kind. Split
 * out of `castSpell` so the validation/slot bookkeeping stays readable.
 * @param {Spell} spell
 * @param {{
 *   steps: number,
 *   targets: CastTarget[],
 *   spellAttackBonus: number,
 *   saveDC: number,
 *   attackMode: RollMode,
 *   rng: RandomFn,
 * }} ctx
 * @returns {object[]}
 */
function resolveEffect(spell, ctx) {
  const { effect } = spell;
  const { steps, targets, spellAttackBonus, saveDC, attackMode, rng } = ctx;

  if (effect.kind === 'attack') {
    const baseParts = scaledParts(effect.damage, spell.scaling, steps);
    return targets.map((target) => {
      const attack = roll(
        { counts: { d20: 1 }, modifier: spellAttackBonus, mode: attackMode },
        rng,
      );
      const natural = attack.results.find((r) => r.die === 'd20')?.rolls[0] ?? 0;
      const crit = natural === 20;
      const ac = target.ac ?? 10;
      const hit = natural !== 1 && (crit || attack.total >= ac);
      const parts = crit ? baseParts.map((p) => ({ ...p, count: p.count * 2 })) : baseParts;
      return {
        target,
        attack,
        natural,
        crit,
        hit,
        ac,
        damage: hit ? rollDamage(parts, 0, rng) : null,
      };
    });
  }

  if (effect.kind === 'save') {
    // Save spells roll their damage once; each target then takes full or, when
    // the spell halves on a success, half — floored — or none.
    const parts = scaledParts(effect.damage, spell.scaling, steps);
    const damage = rollDamage(parts, 0, rng);
    return targets.map((target) => {
      const save = roll(
        { counts: { d20: 1 }, modifier: target.saveBonus ?? 0, mode: target.saveMode ?? 'normal' },
        rng,
      );
      const saved = save.total >= saveDC;
      const taken = saved ? (effect.halfOnSave ? Math.floor(damage.total / 2) : 0) : damage.total;
      return {
        target,
        save,
        dc: saveDC,
        saved,
        taken,
        condition: !saved ? (effect.condition ?? null) : null,
      };
    });
  }

  if (effect.kind === 'heal') {
    const healing = rollDamage(scaledParts(effect.healing, spell.scaling, steps), 0, rng);
    return targets.map((target) => ({ target, healing }));
  }

  return [];
}
