import { damageReadout, roll, rollDamage } from '../dice/DiceRoller.js';
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
 * `projectiles` is how many of a multi-projectile spell's rays this target
 * catches, which the caster allocates.
 * @typedef {{
 *   id?: string,
 *   name?: string,
 *   ac?: number,
 *   saveBonus?: number,
 *   saveMode?: RollMode,
 *   projectiles?: number,
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
 * Coerce a written projectile block into a clean one, or null when the value
 * says nothing usable — an absent block is what makes an attack spell roll once.
 * A count below 1 is not a projectile spell, so it reads as absent. Shared by
 * the authoring form and the library normalizer.
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
 * Coerce a written material-component block into a clean one, or null when the
 * value names nothing — an absent block is what leaves the component letters as
 * the whole story. A block with no text, no cost, and no consumption says
 * nothing the letters do not, so it reads as absent. Shared by the authoring form
 * and the library normalizer.
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
 * Whether the caster is holding the material a cast will destroy, and which
 * inventory stack it would come out of. Only a consumed material is checked: an
 * unconsumed one is what a component pouch or a focus covers, so requiring it
 * would block nearly every spell carrying an M.
 *
 * The match is deliberately loose, because the material is printed prose and an
 * inventory stack is a name: a stack satisfies the spell when either name
 * contains the other, case-insensitively, so a "Diamond" covers "diamonds worth
 * 300 gp". A combatant with no inventory at all — an Encounter or an NPC — is
 * never required to hold anything, since it has nowhere to hold it.
 * @param {{ inventory?: import('../types/entities.js').InventoryItem[] }} caster
 * @param {Spell} spell
 * @returns {{
 *   required: boolean,
 *   satisfied: boolean,
 *   item: import('../types/entities.js').InventoryItem | null,
 * }}
 */
export function materialCheck(caster, spell) {
  const materials = spell.materials;
  const inventory = caster.inventory;
  if (!materials?.consumed || !materials.text || !Array.isArray(inventory)) {
    return { required: false, satisfied: true, item: null };
  }
  const wanted = materials.text.toLowerCase();
  const item =
    inventory.find((i) => {
      const name = i.name?.trim().toLowerCase();
      return !!name && (wanted.includes(name) || name.includes(wanted));
    }) ?? null;
  return { required: true, satisfied: item !== null, item };
}

/**
 * How many projectiles one cast fires: the effect's base `count`, plus
 * `perStep` more per scaling increment. An effect with no `projectiles` fires
 * one attack, which is the single roll every other attack spell makes.
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
 * How many creatures one cast may resolve against: the spell's own
 * `targetCount` (absent counts as 1), plus one more per scaling increment when
 * the spell scales targets. A `targetCount` of 0 marks an area spell, where the
 * number of creatures caught is a fact about the map rather than the spell, so
 * the cap is unbounded and the caster picks.
 *
 * A multi-projectile spell is capped by its projectiles instead, since each one
 * may pick its own creature and no creature can be picked without one.
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
 * Split `count` projectiles between the targets: the caster's own allocation
 * when any target states one (clamped so the total never exceeds what the spell
 * fires), else spread as evenly as possible with the earliest targets taking the
 * remainder — which puts every projectile on the one target of the common
 * single-target cast.
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
    const given = Number.isFinite(wanted) ? Math.min(Math.max(0, wanted), left) : 0;
    left -= given;
    return given;
  });
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
 *   and the damage dealt on a hit (crit doubles the dice). A multi-projectile
 *   spell instead carries the target's allocated `shots` (each with its own
 *   roll), how many `fired` and `hits` landed, and their damage merged.
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
 * One projectile's resolution: its attack roll (null when the spell hits
 * automatically), the natural d20, whether it crit or hit, and the damage it
 * dealt — null on a miss.
 * @typedef {{
 *   attack: DiceResult | null,
 *   natural: number,
 *   crit: boolean,
 *   hit: boolean,
 *   damage: ReturnType<typeof rollDamage> | null,
 * }} ProjectileShot
 */

/**
 * Roll one projectile against an AC: a d20 plus the caster's spell attack
 * bonus, a natural 20 doubling this projectile's dice alone and a natural 1
 * missing regardless. An `autoHit` projectile skips the d20 entirely and can
 * neither miss nor crit.
 * @param {DamagePart[]} parts what one projectile deals
 * @param {number} ac
 * @param {number} attackBonus
 * @param {RollMode} mode
 * @param {boolean | undefined} autoHit
 * @param {RandomFn} rng
 * @returns {ProjectileShot}
 */
function rollProjectile(parts, ac, attackBonus, mode, autoHit, rng) {
  if (autoHit) {
    return { attack: null, natural: 0, crit: false, hit: true, damage: rollDamage(parts, 0, rng) };
  }
  const attack = roll({ counts: { d20: 1 }, modifier: attackBonus, mode }, rng);
  const natural = attack.results.find((r) => r.die === 'd20')?.rolls[0] ?? 0;
  const crit = natural === 20;
  const hit = natural !== 1 && (crit || attack.total >= ac);
  const doubled = crit ? parts.map((p) => ({ ...p, count: p.count * 2 })) : parts;
  return { attack, natural, crit, hit, damage: hit ? rollDamage(doubled, 0, rng) : null };
}

/**
 * Fold several projectiles' damage into one result, so a creature caught by two
 * rays takes one hit carrying both. Same shape `rollDamage` returns: totals and
 * raw dice merged per damage type.
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
    const shot = (/** @type {number} */ ac) =>
      rollProjectile(baseParts, ac, spellAttackBonus, attackMode, effect.projectiles?.autoHit, rng);

    // A single-projectile spell reports its one roll flat, which is what every
    // attack outcome looked like before projectiles existed.
    if (!effect.projectiles) {
      return targets.map((target) => {
        const ac = target.ac ?? 10;
        const { attack, natural, crit, hit, damage } = shot(ac);
        return { target, attack, natural, crit, hit, ac, damage };
      });
    }

    // Otherwise each allocated projectile rolls on its own — its own d20, its
    // own crit doubling only its own dice — and the damage is merged per target
    // so a creature takes one hit rather than one per ray.
    const allocation = allocateProjectiles(targets, projectileCount(effect, steps));
    return targets.map((target, i) => {
      const ac = target.ac ?? 10;
      /** @type {ProjectileShot[]} */
      const shots = [];
      for (let n = 0; n < allocation[i]; n++) shots.push(shot(ac));
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
