import { damageReadout, roll, rollDamage } from '../dice/DiceRoller.js';
import { resolveSave } from './Checks.js';
import { carriesSpellFocus } from './Equipment.js';
import { rollRiders } from './Riders.js';
import { spendResource } from './Character.js';
import { isSpellCastable } from './SpellView.js';
import { SLOT_ID_PREFIX, PACT_ID_PREFIX } from './SpellSlots.js';
import { clamp } from '../util/num.js';

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
 * saving throw.
 *
 * `attackMode` overrides the cast's own mode for this target alone, because a
 * chip such as Prone slants only the attack rolls aimed at its holder.
 * `autoFailSave` names the chip that fails this target's save with no roll,
 * which is what being unable to move does to a Strength or Dexterity save.
 * @typedef {{
 *   id?: string,
 *   name?: string,
 *   ac?: number,
 *   saveBonus?: number,
 *   saveMode?: RollMode,
 *   attackMode?: RollMode,
 *   autoFailSave?: string,
 *   projectiles?: number,
 *   conditions?: import('../types/entities.js').Condition[],
 * }} CastTarget
 */

/**
 * Cantrip damage scales with caster level, and it steps up at the 5e
 * breakpoints of level 5, level 11, and level 17. A level-1 cantrip's base
 * dice grow by one increment at level 5, two increments at level 11, and
 * three increments at level 17.
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
 * The number of scaling increments a cast applies. For a cantrip, this is the
 * caster's level step shown above. For a leveled spell, this is every slot
 * level above the spell's own level, which is upcasting. This function is
 * exported because the cast dialog needs the same count to work out how
 * many targets to offer before the cast resolves.
 * @param {Spell} spell
 * @param {number} slotLevel
 * @param {number} casterLevel
 * @returns {number}
 */
export function scalingSteps(spell, slotLevel, casterLevel) {
  return spell.level === 0 ? cantripStep(casterLevel) : Math.max(0, slotLevel - spell.level);
}

/** The most creatures a spell can name as a fixed target count. Past this
 * limit, a spell describes an area, and `targetCount: 0` states this
 * directly. */
export const MAX_TARGET_COUNT = 20;

/**
 * A written target count, read as a number. It is floored and held to the
 * range 0 to 20. Blank or unparsable input falls back to a default, 1 for
 * the authoring form, because a spell that says nothing about its targets
 * hits one creature. The authoring form and the library normalizer share
 * this function, so both agree that 0 means an area. The general `clampInt`
 * function cannot express this, because its missing-value fallback treats a
 * deliberate 0 as nothing written.
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function normalizeTargetCount(value, fallback = 1) {
  if (value === '' || value === null || value === undefined) return fallback;
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count)) return fallback;
  return clamp(count, 0, MAX_TARGET_COUNT);
}

/**
 * Coerce a written projectile block into a clean one, or return null when the
 * value says nothing usable. An absent block is what makes an attack spell
 * roll once. A count below 1 is not a projectile spell, so it reads as
 * absent. The authoring form and the library normalizer share this function.
 * @param {unknown} value
 * @returns {import('../types/spell.js').SpellProjectiles | null}
 */
export function normalizeProjectiles(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const count = Math.floor(Number(raw.count));
  if (!Number.isFinite(count) || count < 1) return null;
  const perStep = Math.floor(Number(raw.perStep));
  return {
    count: Math.min(MAX_TARGET_COUNT, count),
    ...(Number.isFinite(perStep) && perStep > 0
      ? { perStep: Math.min(MAX_TARGET_COUNT, perStep) }
      : {}),
    ...(raw.autoHit ? { autoHit: true } : {}),
  };
}

/**
 * Coerce a written material-component block into a clean one, or return null
 * when the value names nothing. An absent block leaves the component letters
 * as the whole story. A block with no text, no cost, and no consumption says
 * nothing the letters do not already say, so it reads as absent. The
 * authoring form and the library normalizer share this function.
 * @param {unknown} value
 * @returns {import('../types/spell.js').SpellMaterials | null}
 */
export function normalizeMaterials(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const cost = Math.floor(Number(raw.costGP));
  const costGP = Number.isFinite(cost) && cost > 0 ? cost : 0;
  const consumed = !!raw.consumed;
  if (!text && costGP === 0 && !consumed) return null;
  return { text, ...(costGP > 0 ? { costGP } : {}), consumed };
}

/**
 * Whether the caster must hold a spell's material component, and which
 * inventory stack it comes from. A material that the cast destroys must be
 * in the inventory. So must one that carries a gp cost,
 * because the SRD says a pouch or a focus never covers a costed component.
 * Anything else is covered, but only while the caster carries a pouch or a
 * focus. A caster with neither has to hold the printed material itself.
 *
 * `required` and `consumes` are separate answers. Chromatic Orb's 50 gp
 * diamond must be in hand and stays there. Only a destroyed material comes
 * off the stack.
 *
 * The match is deliberately loose, because the material is printed prose and
 * an inventory stack is a name. A stack satisfies the spell when either name
 * contains the other, case-insensitively, so "Diamond" covers "diamonds
 * worth 300 gp". A material with no printed text names nothing to look for,
 * so it is never required. A combatant with no inventory at all, such as a
 * creature, is never required to hold anything, because it has nowhere to
 * hold it.
 * @param {{ inventory?: import('../types/entities.js').InventoryItem[] }} caster
 * @param {Spell} spell
 * @returns {{
 *   required: boolean,
 *   satisfied: boolean,
 *   item: import('../types/entities.js').InventoryItem | null,
 *   consumes: boolean,
 * }}
 */
export function materialCheck(caster, spell) {
  const materials = spell.materials;
  const inventory = caster.inventory;
  const exempt = { required: false, satisfied: true, item: null, consumes: false };
  if (!materials?.text || !Array.isArray(inventory)) return exempt;
  const consumes = !!materials.consumed;
  const costed = (materials.costGP ?? 0) > 0;
  if (!consumes && !costed && carriesSpellFocus(inventory)) return exempt;
  const wanted = materials.text.toLowerCase();
  const item =
    inventory.find((i) => {
      const name = i.name?.trim().toLowerCase();
      return !!name && (wanted.includes(name) || name.includes(wanted));
    }) ?? null;
  return { required: true, satisfied: item !== null, item, consumes };
}

/**
 * What a buff spell's chip is called: the name the effect states, or the
 * spell's own name when it states none. The cast and the detail modal both
 * read this, so the chip a GM sees promised is the chip that lands.
 * @param {Spell} spell
 * @returns {string}
 */
export function buffCondition(spell) {
  const named = spell.effect.kind === 'buff' ? spell.effect.condition?.trim() : '';
  return named || spell.name;
}

/**
 * How many projectiles one cast fires: the effect's base `count`, plus
 * `perStep` more for each scaling increment. An effect with no `projectiles`
 * fires one attack, which is the single roll every other attack spell makes.
 * @param {import('../types/spell.js').SpellAttackEffect} effect
 * @param {number} steps how many scaling increments the cast applies
 * @returns {number}
 */
export function projectileCount(effect, steps) {
  const shots = effect.projectiles;
  if (!shots) return 1;
  return Math.max(1, shots.count + (shots.perStep ?? 0) * Math.max(0, steps));
}

/**
 * How many creatures one cast can resolve against: the spell's own
 * `targetCount`, with an absent value counted as 1, plus one more for each
 * scaling increment when the spell scales targets. A `targetCount` of 0
 * marks an area spell, where the number of creatures caught is a fact about
 * the map, not about the spell, so the cap is unbounded and the caster picks
 * the targets.
 *
 * A multi-projectile spell is capped by its projectiles instead, because
 * each projectile can pick its own creature and no creature can be picked
 * without one.
 * @param {Spell} spell
 * @param {number} steps how many scaling increments the cast applies
 * @returns {number} the cap, or Infinity for an area spell
 */
export function maxTargets(spell, steps) {
  const base = spell.targetCount ?? 1;
  if (base <= 0) return Infinity;
  if (spell.effect.kind === 'attack' && spell.effect.projectiles) {
    return projectileCount(spell.effect, steps);
  }
  return base + (spell.scaling?.targetsPerLevel ?? 0) * Math.max(0, steps);
}

/**
 * Split `count` projectiles between the targets. Use the caster's own
 * allocation when any target states one, clamped so the total never exceeds
 * what the spell fires. Otherwise spread the projectiles as evenly as
 * possible, with the earliest targets taking the remainder. This puts every
 * projectile on the one target of the common single-target cast.
 * @param {CastTarget[]} targets
 * @param {number} count
 * @returns {number[]} how many projectiles each target catches, in order
 */
export function allocateProjectiles(targets, count) {
  if (targets.length === 0) return [];
  if (!targets.some((t) => t.projectiles !== undefined)) {
    const each = Math.floor(count / targets.length);
    const extra = count % targets.length;
    return targets.map((_, i) => each + (i < extra ? 1 : 0));
  }
  let left = count;
  return targets.map((target) => {
    const wanted = Math.floor(Number(target.projectiles ?? 0));
    const given = Number.isFinite(wanted) ? clamp(wanted, 0, left) : 0;
    left -= given;
    return given;
  });
}

/**
 * A spell's base damage or healing dice, grown by its scaling: the base
 * parts, plus `damagePerLevel` appended once for each scaling increment.
 * This function returns fresh copies, so a later crit-doubling never mutates
 * the spell's stored dice.
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
 * when neither pool has a charge left.
 * @param {SpellCaster} caster
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
 *   each with its own roll, how many `fired` and `hits` landed, and their
 *   damage merged.
 * - `save`: the damage rolled once, plus one entry per target with its save
 *   roll, whether it saved, and the damage it takes (full, half when
 *   `halfOnSave`, or none).
 * - `heal`: the healing rolled once, applied identically to each target.
 * - `buff`: no rolls, and one entry per target naming the `condition` chip it
 *   takes and the `rider` that chip carries.
 * - `utility`: no rolls, and an empty `outcomes`.
 *
 * @template {SpellCaster} T
 * @param {T} caster
 * @param {Spell} spell
 * @param {{
 *   slotLevel?: number,
 *   targets?: CastTarget[],
 *   spellAttackBonus?: number,
 *   saveDC?: number,
 *   casterLevel?: number,
 *   attackMode?: RollMode,
 *   ritual?: boolean,
 *   casterConditions?: import('../types/entities.js').Condition[],
 *   rng?: RandomFn,
 * }} [options] `casterConditions` are the chips the caster holds. A rider on
 *   one of them joins every spell attack roll the cast makes. The caster view
 *   carries no conditions, so the call site reads them off the real combatant.
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
    casterLevel = caster.level ?? 1,
    attackMode = 'normal',
    ritual = false,
    casterConditions = [],
    rng = Math.random,
  } = options;

  if (!canCast(caster, spell)) return { ok: false, reason: 'not-known' };

  // A ritual cast takes the extra ten minutes instead of a slot, so it spends
  // nothing and always resolves at the spell's own level. There is no slot to
  // upcast from. A spell with no ritual, and a cantrip, which has no ritual
  // to trade a slot for, cannot be cast this way.
  if (ritual && (!spell.ritual || spell.level === 0)) return { ok: false, reason: 'not-ritual' };

  // A cantrip uses no slot. A leveled spell must be cast at or above its own
  // level and have a slot of that level free.
  const cantrip = spell.level === 0;
  const asRitual = ritual && !cantrip;
  const poolId = cantrip || asRitual ? null : slotPoolToSpend(caster, slotLevel);
  if (!cantrip && !asRitual) {
    if (slotLevel < spell.level) return { ok: false, reason: 'bad-slot-level' };
    if (!poolId) return { ok: false, reason: 'no-slot' };
  }

  const effectiveSlot = cantrip ? 0 : asRitual ? spell.level : slotLevel;
  const steps = scalingSteps(spell, effectiveSlot, casterLevel);
  const nextCaster = poolId ? spendResource(caster, poolId, 1) : caster;

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
    attackMode,
    casterConditions,
    rng,
  });

  return {
    ok: true,
    caster: nextCaster,
    spell,
    slotLevel: effectiveSlot,
    spent: !cantrip && !asRitual,
    ritual: asRitual,
    effect: spell.effect.kind,
    targets: reached,
    truncated: targets.length - reached.length,
    outcomes,
  };
}

/**
 * One projectile's resolution: its attack roll, null when the spell hits
 * automatically, the natural d20, whether it crit or hit, the damage it
 * dealt, which is null on a miss, and what the caster's rider chips added to
 * the roll, which is null when it held none.
 * @typedef {{
 *   attack: DiceResult | null,
 *   natural: number,
 *   crit: boolean,
 *   hit: boolean,
 *   damage: ReturnType<typeof rollDamage> | null,
 *   rider: { modifier: number, note: string } | null,
 * }} ProjectileShot
 */

/**
 * Roll one projectile against an AC: a d20 plus the caster's spell attack
 * bonus, plus whatever the caster's rider chips add. A natural 20 doubles
 * this projectile's dice alone, and a natural 1 always misses. An `autoHit`
 * projectile skips the d20 entirely and can neither miss nor crit, so no
 * rider applies to it either.
 *
 * The riders roll per projectile, because each projectile is its own attack
 * roll and a blessed caster rolls the d4 again for each one.
 * @param {{
 *   parts: DamagePart[],
 *   ac: number,
 *   attackBonus: number,
 *   mode: RollMode,
 *   autoHit: boolean | undefined,
 *   casterConditions: import('../types/entities.js').Condition[],
 *   rng: RandomFn,
 * }} shot `parts` is what one projectile deals
 * @returns {ProjectileShot}
 */
function rollProjectile({ parts, ac, attackBonus, mode, autoHit, casterConditions, rng }) {
  if (autoHit) {
    return {
      attack: null,
      natural: 0,
      crit: false,
      hit: true,
      damage: rollDamage(parts, 0, rng),
      rider: null,
    };
  }
  const rider = rollRiders(casterConditions, 'attack', rng);
  const attack = roll({ counts: { d20: 1 }, modifier: attackBonus + rider.modifier, mode }, rng);
  const natural = attack.results.find((r) => r.die === 'd20')?.rolls[0] ?? 0;
  const crit = natural === 20;
  const hit = natural !== 1 && (crit || attack.total >= ac);
  const doubled = crit ? parts.map((p) => ({ ...p, count: p.count * 2 })) : parts;
  return {
    attack,
    natural,
    crit,
    hit,
    damage: hit ? rollDamage(doubled, 0, rng) : null,
    rider: rider.note ? rider : null,
  };
}

/**
 * Fold several projectiles' damage into one result, so a creature caught by
 * two rays takes one hit that carries both. This has the same shape that
 * `rollDamage` returns: totals and raw dice merged per damage type.
 * @param {ReturnType<typeof rollDamage>[]} rolls
 * @returns {ReturnType<typeof rollDamage>}
 */
function mergeDamage(rolls) {
  /** @type {Map<string, import('../dice/DiceRoller.js').DamageGroup>} */
  const byType = new Map();
  for (const result of rolls) {
    for (const group of result.byType) {
      const merged = byType.get(group.damageType) ?? {
        damageType: group.damageType,
        rolls: [],
        bonus: 0,
        subtotal: 0,
      };
      merged.rolls.push(...group.rolls);
      merged.bonus += group.bonus;
      merged.subtotal += group.subtotal;
      byType.set(group.damageType, merged);
    }
  }
  return damageReadout([...byType.values()]);
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
 *   attackMode: RollMode,
 *   casterConditions: import('../types/entities.js').Condition[],
 *   rng: RandomFn,
 * }} ctx
 * @returns {object[]}
 */
function resolveEffect(spell, ctx) {
  const { effect } = spell;
  const { steps, targets, spellAttackBonus, saveDC, attackMode, casterConditions, rng } = ctx;

  if (effect.kind === 'attack') {
    const baseParts = scaledParts(effect.damage, spell.scaling, steps);
    // The target's own chips can slant the roll aimed at it, so the mode is
    // read per target and falls back to the one the whole cast carries.
    const shot = (/** @type {CastTarget} */ target, /** @type {number} */ ac) =>
      rollProjectile({
        parts: baseParts,
        ac,
        attackBonus: spellAttackBonus,
        mode: target.attackMode ?? attackMode,
        autoHit: effect.projectiles?.autoHit,
        casterConditions,
        rng,
      });

    // A single-projectile spell reports its one roll flat. This is what
    // every attack outcome looked like before projectiles existed.
    if (!effect.projectiles) {
      return targets.map((target) => {
        const ac = target.ac ?? 10;
        const { attack, natural, crit, hit, damage, rider } = shot(target, ac);
        return { target, attack, natural, crit, hit, ac, damage, rider };
      });
    }

    // Otherwise each allocated projectile rolls on its own, with its own d20
    // and its own crit that doubles only its own dice. The damage is merged
    // per target, so a creature takes one hit instead of one hit per ray.
    const allocation = allocateProjectiles(targets, projectileCount(effect, steps));
    return targets.map((target, i) => {
      const ac = target.ac ?? 10;
      /** @type {ProjectileShot[]} */
      const shots = [];
      for (let n = 0; n < allocation[i]; n++) shots.push(shot(target, ac));
      const landed = shots.filter((s) => s.damage !== null);
      return {
        target,
        ac,
        shots,
        fired: shots.length,
        hits: landed.length,
        hit: landed.length > 0,
        damage:
          landed.length > 0
            ? mergeDamage(
                /** @type {ReturnType<typeof rollDamage>[]} */ (landed.map((s) => s.damage)),
              )
            : null,
      };
    });
  }

  if (effect.kind === 'save') {
    // Save spells roll their damage once. Each target then takes full
    // damage, half damage rounded down when the spell halves on a success,
    // or no damage.
    const parts = scaledParts(effect.damage, spell.scaling, steps);
    const damage = rollDamage(parts, 0, rng);
    return targets.map((target) => {
      // The caller already works out the target's bonus. It comes from a
      // party character's own saves, or is hand-entered for a foe.
      // The target's own chips ride its save, so a bane'd foe rolls at -1d4
      // against the next save spell too.
      // A target whose chip fails the save outright throws no die at all, so
      // its `save` is null and the caller reports the chip instead of a total.
      const rolled = target.autoFailSave
        ? { roll: null, success: false, rider: null }
        : resolveSave(target.saveBonus ?? 0, saveDC, {
            mode: target.saveMode ?? 'normal',
            conditions: target.conditions ?? [],
            rng,
          });
      const { roll: save, success: saved, rider } = rolled;
      const taken = saved ? (effect.halfOnSave ? Math.floor(damage.total / 2) : 0) : damage.total;
      const condition = !saved ? (effect.condition ?? null) : null;
      return {
        target,
        save,
        dc: saveDC,
        saved,
        taken,
        rider,
        autoFailedBy: target.autoFailSave ?? null,
        condition,
        // The rider rides the chip, so it lands only when the chip does.
        conditionRider: condition ? (effect.rider ?? null) : null,
      };
    });
  }

  if (effect.kind === 'heal') {
    const healing = rollDamage(scaledParts(effect.healing, spell.scaling, steps), 0, rng);
    return targets.map((target) => ({ target, healing }));
  }

  // A buff rolls nothing. It names the chip each target takes and what that
  // chip adds to the target's later rolls.
  if (effect.kind === 'buff') {
    const condition = buffCondition(spell);
    return targets.map((target) => ({ target, condition, rider: effect.rider ?? null }));
  }

  return [];
}
