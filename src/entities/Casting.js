import { rollDamage } from '../dice/DiceRoller.js';
import { resolveAttack, targetSave } from './CastRolls.js';
import { buffCondition, buffOutcomes } from './BuffCast.js';
import { rollHpPool, walkHpPool } from './HpPool.js';
import { takesMaxDamage, typeSkipReason, withTypeSaveMode } from './SpellTypeRules.js';
import { rollsNoSave } from './SpellFields.js';
import { spendResource } from './Character.js';
import { isRitualOnly, isSpellCastable } from './SpellView.js';
import { SLOT_ID_PREFIX, PACT_ID_PREFIX } from './SpellSlots.js';
import {
  allocateProjectiles,
  maxTargets,
  ongoingParts,
  projectileCount,
  scaledParts,
  scalingSteps,
  summonCount,
} from './CastScaling.js';

export { buffCondition };

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellScaling} SpellScaling */
/** @typedef {import('../types/entities.js').SpellCaster} SpellCaster */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */
/** @typedef {import('../types/dice.js').DiceResult} DiceResult */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */
/** @typedef {import('../types/dice.js').RollMode} RollMode */

/**
 * A single target of a cast: its identity plus the numbers the resolver
 * needs. An attack spell needs AC. A save spell needs a save bonus, with an
 * optional advantage or disadvantage mode on that save. Healing targets need
 * only id and name. `projectiles` states how many rays of a multi-projectile
 * spell this target catches, which the caster allocates. `conditions` are the
 * chips the target already holds, so a rider on one of them can ride its
 * saving throw. `riders` are extra rider sources beyond the chips, the feat
 * riders of a character target, and they join the same save.
 *
 * `attackMode` overrides the cast's own mode for this target alone, because a
 * chip such as Prone slants only the attack rolls aimed at its holder.
 * `autoFailSave` names the chip that fails this target's save with no roll,
 * which is what being unable to move does to a Strength or Dexterity save.
 * `autoCrit` turns any hit on this target into a critical hit, which is what
 * a Paralyzed or Unconscious target takes from a melee spell attack. `hp` is
 * the target's current HP, which only a spell with an HP limit or an HP pool
 * reads. The type rules of a spell read `creatureType` and
 * `conditionImmunities` (see `SpellTypeRules.js`).
 * @typedef {{
 *   id?: string,
 *   name?: string,
 *   ac?: number,
 *   saveBonus?: number,
 *   saveMode?: RollMode,
 *   attackMode?: RollMode,
 *   autoFailSave?: string,
 *   autoCrit?: boolean,
 *   hp?: number,
 *   projectiles?: number,
 *   conditions?: import('./Riders.js').RiderSource[],
 *   riders?: import('./Riders.js').RiderSource[],
 *   creatureType?: import('../types/creature.js').CreatureType,
 *   conditionImmunities?: string[],
 * }} CastTarget
 */

/** A random source that turns every die up to its top face. */
const topFace = () => 1 - Number.EPSILON;

/**
 * Whether a caster's spellbook lets it cast this spell. A cantrip must be in
 * the cantrip list. A leveled spell must be prepared under a prepared-rule
 * class, or known under a known-rule class. `isSpellCastable` holds this
 * rule. A caster whose class stores no spellbook, for example a legacy
 * character, cannot cast.
 * @param {SpellCaster} caster
 * @param {Spell} spell
 * @returns {boolean}
 */
export function canCast(caster, spell) {
  return isSpellCastable(caster, spell);
}

/**
 * The pool id a cast at this slot level draws from. It is the leveled slot
 * pool when that pool has a charge. Otherwise it is the pact pool at that
 * level, because pact slots are cast at exactly their own level. It is null
 * when neither pool has a charge left. A cast limited to the pact pool skips
 * the leveled pool.
 * @param {SpellCaster} caster
 * @param {number} slotLevel
 * @param {boolean} pactOnly
 * @returns {string | null}
 */
function slotPoolToSpend(caster, slotLevel, pactOnly) {
  const pact = `${PACT_ID_PREFIX}${slotLevel}`;
  for (const id of pactOnly ? [pact] : [`${SLOT_ID_PREFIX}${slotLevel}`, pact]) {
    const pool = caster.resources.find((r) => r.id === id);
    if (pool && pool.current > 0) return id;
  }
  return null;
}

/**
 * Resolve casting a spell: validate the cast, spend the slot, and roll every
 * effect against the targets. This function is pure. The caller applies the
 * returned damage or healing to targets and logs the result, the same way
 * `weaponAttack` leaves application to the app layer.
 *
 * On failure this function returns `{ ok: false, reason }`, with reason one
 * of:
 * - `'not-known'`: the caster cannot cast this spell.
 * - `'bad-slot-level'`: the slot is below the spell's level.
 * - `'no-slot'`: no slot of that level is left, counting the pact pool at
 *   that level.
 * - `'not-ritual'`: a ritual cast was asked for on a spell that has no
 *   ritual.
 *
 * On success this function returns the caster with the slot spent, from the
 * leveled pool first and then the pact pool (cantrips and rituals spend
 * nothing), the targets the cast actually reached, how many targets were
 * dropped past the spell's cap (`truncated`), and an `outcomes` array whose
 * shape follows the effect kind:
 * - `attack`: one entry per target, with its d20 attack roll, whether it hit
 *   or crit, and the damage dealt on a hit (a crit doubles the dice). A
 *   multi-projectile spell instead carries the target's allocated `shots`,
 *   each with its own roll and damage, how many `fired` and `hits` landed,
 *   and their damage merged for the log. A miss of a spell with `halfOnMiss`
 *   still includes its rolled `damage`, with `halved` set. A hit of a spell
 *   with `ongoing` includes the scaled `ongoing` dice for the chip it leaves.
 * - `save`: the damage rolled once, plus one entry per target with its save
 *   roll, whether it saved, and the damage it takes (full, half when
 *   `halfOnSave`, or none). Each entry also keeps the rolled `damage`, so a
 *   caller can apply the target's damage defenses per type. A failed save of
 *   a spell with `ongoing` includes the scaled `ongoing` dice.
 * - `heal`: the healing rolled once, applied identically to each target. A
 *   heal with `addsModifier` adds `spellModifier`, the caster's spellcasting
 *   ability modifier, to the roll.
 * - `buff`: no rolls, and one entry per target naming the `condition` chip it
 *   takes, the `rider` that chip carries, and its `mods`.
 * - `summons`: no rolls and no targets, and one entry naming the `creature`
 *   template to spawn and how many (`count`).
 * - `utility`: no rolls, and an empty `outcomes`.
 *
 * A `free` cast spends no slot and skips the spellbook check, because the
 * caster already paid for it: a repeat of a spell still open from an earlier
 * turn, for example. It resolves at `free.slotLevel`, the level the first
 * cast used. A `granted` cast spends a slot as usual but skips the spellbook
 * check, because a feature grants the spell: a warlock invocation, for
 * example. A `pool: 'pact'` cast pays only from the pact pool, because a
 * once-per-rest invocation casts with a warlock spell slot.
 *
 * @template {SpellCaster} T
 * @param {T} caster
 * @param {Spell} spell
 * @param {{
 *   slotLevel?: number,
 *   targets?: CastTarget[],
 *   spellAttackBonus?: number,
 *   saveDC?: number,
 *   spellModifier?: number,
 *   casterLevel?: number,
 *   attackMode?: RollMode,
 *   ritual?: boolean,
 *   casterConditions?: import('./Riders.js').RiderSource[],
 *   free?: { slotLevel: number },
 *   granted?: boolean,
 *   pool?: 'pact',
 *   rng?: RandomFn,
 *   resistPick?: string,
 *   healBonus?: number,
 * }} [options] `casterConditions` are the chips the caster holds. A rider on
 *   one of them joins every spell attack roll the cast makes. The caster view
 *   carries no conditions, so the call site reads them off the real combatant.
 *   `healBonus` is the flat bonus that a class feature adds to the healing of
 *   each target, such as Disciple of Life (see `HealingBonus.healingBonus`).
 * @returns {(
 *   { ok: false, reason: 'not-known' | 'bad-slot-level' | 'no-slot' | 'not-ritual' } |
 *   { ok: true, caster: T, spell: Spell, slotLevel: number, spent: boolean,
 *     ritual: boolean,
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
    spellModifier = 0,
    casterLevel = caster.level ?? 1,
    attackMode = 'normal',
    ritual = false,
    casterConditions = [],
    free = null,
    granted = false,
    pool,
    rng = Math.random,
    resistPick,
    healBonus = 0,
  } = options;

  const paid = free
    ? freeCast(caster, free)
    : payForCast(caster, spell, slotLevel, ritual, granted, pool === 'pact');
  if (!paid.ok) return paid;
  const steps = scalingSteps(spell, paid.slotLevel, casterLevel);

  // Over-selecting drops the extra targets instead of failing the cast. The
  // slot is already committed by the time a cap is exceeded, and losing the
  // whole cast is worse than resolving the targets the spell can reach.
  // `truncated` lets the caller report this.
  const cap = maxTargets(spell, steps);
  const reached = targets.length > cap ? targets.slice(0, cap) : targets;

  const outcomes = resolveEffect(spell, {
    steps,
    targets: reached,
    spellAttackBonus,
    saveDC,
    spellModifier,
    attackMode,
    casterConditions,
    casterId: caster.id,
    rng,
    resistPick,
    healBonus,
  });

  return {
    ok: true,
    caster: paid.caster,
    spell,
    slotLevel: paid.slotLevel,
    spent: paid.spent,
    ritual: paid.ritual,
    effect: spell.effect.kind,
    targets: reached,
    truncated: targets.length - reached.length,
    outcomes,
  };
}

/**
 * What a free cast pays: nothing. It resolves at the level it names.
 * @template {SpellCaster} T
 * @param {T} caster
 * @param {{ slotLevel: number }} free
 * @returns {{ ok: true, caster: T, slotLevel: number, spent: boolean, ritual: boolean }}
 */
function freeCast(caster, free) {
  return { ok: true, caster, slotLevel: free.slotLevel, spent: false, ritual: false };
}

/**
 * Check that the caster can cast the spell, and spend what the cast costs: a
 * slot for a leveled spell, or nothing for a cantrip or a ritual.
 * @template {SpellCaster} T
 * @param {T} caster
 * @param {Spell} spell
 * @param {number} slotLevel
 * @param {boolean} ritual
 * @param {boolean} granted true when a feature grants the spell, which skips
 *   the spellbook check
 * @param {boolean} pactOnly true when only the pact pool can pay
 * @returns {(
 *   { ok: false, reason: 'not-known' | 'bad-slot-level' | 'no-slot' | 'not-ritual' } |
 *   { ok: true, caster: T, slotLevel: number, spent: boolean, ritual: boolean }
 * )}
 */
function payForCast(caster, spell, slotLevel, ritual, granted, pactOnly) {
  // A Wizard's unprepared ritual passes as a ritual cast and nothing else.
  if (!granted && !canCast(caster, spell) && !(ritual && isRitualOnly(caster, spell))) {
    return { ok: false, reason: 'not-known' };
  }

  // A ritual cast takes the extra ten minutes instead of a slot, so it spends
  // nothing and always resolves at the spell's own level. There is no slot to
  // upcast from. A spell with no ritual, and a cantrip, which has no ritual
  // to trade a slot for, cannot be cast this way.
  if (ritual && (!spell.ritual || spell.level === 0)) return { ok: false, reason: 'not-ritual' };

  // A cantrip uses no slot. A leveled spell must be cast at or above its own
  // level and have a slot of that level free.
  const cantrip = spell.level === 0;
  const asRitual = ritual && !cantrip;
  const poolId = cantrip || asRitual ? null : slotPoolToSpend(caster, slotLevel, pactOnly);
  if (!cantrip && !asRitual) {
    if (slotLevel < spell.level) return { ok: false, reason: 'bad-slot-level' };
    if (!poolId) return { ok: false, reason: 'no-slot' };
  }
  return {
    ok: true,
    caster: poolId ? spendResource(caster, poolId, 1) : caster,
    slotLevel: cantrip ? 0 : asRitual ? spell.level : slotLevel,
    spent: !cantrip && !asRitual,
    ritual: asRitual,
  };
}

/**
 * Roll a spell's effect against its targets, dispatched by effect kind. This
 * function is split out of `castSpell` so the validation and slot
 * bookkeeping stay readable.
 * @param {Spell} spell
 * @param {{
 *   steps: number,
 *   targets: CastTarget[],
 *   spellAttackBonus: number,
 *   saveDC: number,
 *   spellModifier: number,
 *   attackMode: RollMode,
 *   casterConditions: import('./Riders.js').RiderSource[],
 *   casterId?: string,
 *   rng: RandomFn,
 *   resistPick?: string,
 *   healBonus?: number,
 * }} ctx
 * @returns {object[]}
 */
function resolveEffect(spell, ctx) {
  const { effect } = spell;
  const {
    steps,
    targets,
    spellAttackBonus,
    saveDC,
    spellModifier,
    attackMode,
    casterConditions,
    rng,
    resistPick,
    healBonus = 0,
  } = ctx;

  if (effect.kind === 'attack') {
    // The dice a hit leaves on the target for its later turns scale with the
    // cast. A critical hit doubles only the dice of the hit itself.
    return resolveAttack(effect, {
      parts: scaledParts(effect.damage, spell.scaling, steps),
      ongoing: ongoingParts(effect.ongoing, steps),
      allocation: effect.projectiles
        ? allocateProjectiles(targets, projectileCount(effect, steps))
        : null,
      targets,
      spellAttackBonus,
      saveDC,
      spellModifier,
      attackMode,
      casterConditions,
      casterId: ctx.casterId,
      rng,
    });
  }
  if (effect.kind === 'save') {
    // Save spells roll their damage once. Each target then takes full
    // damage, half damage rounded down when the spell halves on a success,
    // or no damage.
    // An HP pool picks the targets the spell reaches before anything else
    // rolls. The targets it reaches roll no save, and the rest are left alone.
    const pool = effect.hpPool ? rollHpPool(effect.hpPool, steps, rng) : null;
    const parts = scaledParts(effect.damage, spell.scaling, steps);
    const damage = rollDamage(parts, 0, rng);
    const ongoing = ongoingParts(effect.ongoing, steps);
    const noRoll = rollsNoSave(effect);
    // The type rules pass over some targets before the pool walks, so a
    // skipped target spends none of the pool. Skipped targets come last.
    const rules = effect.typeRules;
    const skipped = targets.flatMap((target) => {
      const reason = typeSkipReason(rules, target);
      return reason ? [{ target, affected: false, reason }] : [];
    });
    const reached = targets.filter((target) => !typeSkipReason(rules, target));
    const walk = [
      ...(pool
        ? walkHpPool(reached, pool.total, effect.condition)
        : reached.map((target) => ({ target, affected: true, reason: '' }))),
      ...skipped,
    ];
    // A type that takes the maximum damage reads every die at its top face.
    const maxed = rules?.maxDamage ? rollDamage(parts, 0, topFace) : damage;
    return walk.map(({ target: picked, affected, reason }) => {
      const target = withTypeSaveMode(rules, picked);
      const hit = takesMaxDamage(rules, target) ? maxed : damage;
      const extra = { ...(noRoll ? { noRoll: true } : {}), ...(pool ? { pool } : {}) };
      if (!affected) {
        return { target, unaffectedBy: reason, saved: true, taken: 0, condition: null, ...extra };
      }
      // The caller already works out the target's bonus. It comes from a
      // party character's own saves, or is hand-entered for a foe.
      // The target's own chips ride its save, so a bane'd foe rolls at -1d4
      // against the next save spell too.
      // A target whose chip fails the save outright throws no die at all, so
      // its `save` is null and the caller reports the chip instead of a total.
      // A spell with an HP limit skips the first save. A target at or under
      // the limit fails it, and one above the limit is left alone. A target
      // with no known HP counts as under the limit, so the GM can still
      // apply the effect.
      const limit = effect.hpLimit;
      if (limit !== undefined && target.hp !== undefined && target.hp > limit) {
        return {
          target,
          unaffectedBy: `over ${limit} HP`,
          saved: true,
          taken: 0,
          condition: null,
          ...extra,
        };
      }
      const limitFails = limit === undefined ? null : `${limit} HP or fewer`;
      // A spell that rolls no save names the HP rule that reached the target,
      // in place of any chip that would have failed the save.
      const autoFailedBy = noRoll ? reason || limitFails : (target.autoFailSave ?? limitFails);
      const { roll: save, success: saved, rider } = targetSave(target, saveDC, autoFailedBy, rng);
      const taken = saved ? (effect.halfOnSave ? Math.floor(hit.total / 2) : 0) : hit.total;
      const condition = !saved ? (effect.condition ?? null) : null;
      return {
        target,
        save,
        dc: saveDC,
        saved,
        taken,
        damage: hit,
        ...(hit === damage ? {} : { maxDamage: true }),
        rider,
        autoFailedBy,
        condition,
        // The rider rides the chip, so it lands only when the chip does.
        conditionRider: condition ? (effect.rider ?? null) : null,
        ...(!saved && ongoing ? { ongoing } : {}),
        ...extra,
      };
    });
  }

  if (effect.kind === 'heal') {
    const bonus = effect.addsModifier ? spellModifier : 0;
    const healing = rollDamage(
      scaledParts(effect.healing, spell.scaling, steps),
      bonus + healBonus,
      rng,
    );
    const extra = healBonus > 0 ? { healBonus } : {};
    // A heal passes over a target of a type that it has no effect on.
    return targets.map((target) => {
      const reason = typeSkipReason(effect.typeRules, target);
      return reason ? { target, healing, unaffectedBy: reason } : { target, healing, ...extra };
    });
  }

  // A buff rolls no attack and no save. See `BuffCast.buffOutcomes`.
  if (effect.kind === 'buff') {
    return buffOutcomes(spell, effect, targets, { steps, spellModifier, rng, resistPick });
  }

  // A summons rolls nothing and names no target. It reports which template to
  // spawn and how many. The caller reads the template out of the library and
  // places the creatures, because this function has neither.
  if (effect.kind === 'summons') {
    return [{ creature: effect.creature, count: summonCount(effect, steps) }];
  }

  return [];
}
