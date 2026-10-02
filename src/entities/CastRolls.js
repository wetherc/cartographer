import { damageReadout, roll, rollDamage } from '../dice/DiceRoller.js';
import { hitRiderNote, hitRiderParts, hitRiders } from './HitRiders.js';
import { resolveSave } from './Checks.js';
import { rollRiders } from './Riders.js';

/**
 * The rolls a spell makes against each of its targets: the attack roll of
 * each projectile, the save a target makes against the caster's DC, and the
 * save or chip that a hit brings with it (Ray of Sickness poisons the
 * creature it hits unless that creature makes a Constitution save).
 * `Casting.js` pays for the cast and scales the dice, and then hands the
 * scaled numbers here. Every function here is pure, and each one takes its
 * random source as an argument.
 */

/** @typedef {import('../types/spell.js').SpellAttackEffect} SpellAttackEffect */
/** @typedef {import('../types/spell.js').SpellOnHit} SpellOnHit */
/** @typedef {import('../types/entities.js').DamagePart} DamagePart */
/** @typedef {import('../types/dice.js').DiceResult} DiceResult */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */
/** @typedef {import('../types/dice.js').RollMode} RollMode */
/** @typedef {import('./Casting.js').CastTarget} CastTarget */
/** @typedef {import('./Riders.js').RiderSource} RiderSource */

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
 *   rider: { modifier: number, note: string, spent: string[] } | null,
 * }} ProjectileShot
 */

/**
 * Roll one projectile against an AC: a d20 plus the caster's spell attack
 * bonus, plus whatever the caster's rider chips add. A natural 20 doubles
 * this projectile's dice alone, and a natural 1 always misses. `autoCrit`
 * makes any hit a critical one. An `autoHit`
 * projectile skips the d20 entirely and can neither miss nor crit, so no
 * rider applies to it either. `bonus` is a flat amount added to the damage of
 * a hit, which a critical hit does not double.
 *
 * The riders roll per projectile, because each projectile is its own attack
 * roll and a blessed caster rolls the d4 again for each one.
 * @param {{
 *   parts: DamagePart[],
 *   extra?: DamagePart[],
 *   ac: number,
 *   attackBonus: number,
 *   mode: RollMode,
 *   autoHit: boolean | undefined,
 *   autoCrit?: boolean,
 *   bonus?: number,
 *   casterConditions: import('./Riders.js').RiderSource[],
 *   rng: RandomFn,
 * }} shot `parts` is what one projectile deals, and `extra` the dice of the
 *   hit riders, which only a hit with an attack roll takes
 * @returns {ProjectileShot}
 */
function rollProjectile({
  parts: base,
  extra = [],
  ac,
  attackBonus,
  mode,
  autoHit,
  autoCrit = false,
  bonus = 0,
  casterConditions,
  rng,
}) {
  if (autoHit) {
    return {
      attack: null,
      natural: 0,
      crit: false,
      hit: true,
      damage: rollDamage(base, bonus, rng),
      rider: null,
    };
  }
  const rider = rollRiders(casterConditions, 'attack', rng);
  const parts = [...base, ...extra];
  const attack = roll({ counts: { d20: 1 }, modifier: attackBonus + rider.modifier, mode }, rng);
  const natural = attack.results.find((r) => r.die === 'd20')?.rolls[0] ?? 0;
  const hit = natural !== 1 && (natural === 20 || attack.total >= ac);
  const crit = hit && (natural === 20 || autoCrit);
  const doubled = crit ? parts.map((p) => ({ ...p, count: p.count * 2 })) : parts;
  return {
    attack,
    natural,
    crit,
    hit,
    damage: hit ? rollDamage(doubled, bonus, rng) : null,
    rider: rider.note ? rider : null,
  };
}

/**
 * Fold several projectiles' damage into one result, so the log line for a
 * creature caught by two rays names both rays' dice. The result has the same
 * fields that `rollDamage` returns: totals and raw dice merged per damage
 * type. The caller still applies each ray as its own hit.
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
 * One target's saving throw against the caster's DC. The target's own chips
 * and feat riders join the roll. A target that a chip fails outright throws
 * no die, so its `roll` is null.
 * @param {CastTarget} target
 * @param {number} dc
 * @param {string | null} failedBy what fails the save with no roll, or null
 * @param {RandomFn} rng
 * @returns {{ roll: DiceResult | null, success: boolean, rider: { modifier: number, note: string, spent: string[] } | null }}
 */
export function targetSave(target, dc, failedBy, rng) {
  if (failedBy) return { roll: null, success: false, rider: null };
  return resolveSave(target.saveBonus ?? 0, dc, {
    mode: target.saveMode ?? 'normal',
    conditions: [...(target.conditions ?? []), ...(target.riders ?? [])],
    rng,
  });
}

/**
 * What a hit brings with it beyond its damage. With no save, the chip lands
 * on every creature the spell hits. With a save, the creature rolls against
 * the caster's DC, and the chip lands only when it fails. `condition` is the
 * chip that lands, or null when the save kept it off.
 * @param {SpellOnHit} onHit
 * @param {CastTarget} target
 * @param {number} dc
 * @param {RandomFn} rng
 */
function onHitOutcome(onHit, target, dc, rng) {
  if (!onHit.saveAbility) return { condition: onHit.condition };
  const autoFailedBy = target.autoFailSave ?? null;
  const { roll: save, success: saved, rider } = targetSave(target, dc, autoFailedBy, rng);
  return { save, dc, saved, rider, autoFailedBy, condition: saved ? null : onHit.condition };
}

/**
 * Roll an attack spell against its targets. `parts` are the scaled dice of
 * one hit, and `ongoing` the scaled dice a hit leaves for later turns, or
 * null. `allocation` is how many projectiles each target catches, in target
 * order, or null for a spell with a single attack per target.
 *
 * A single attack reports its one roll flat. A spell that splashes on a miss
 * rolls its damage anyway, and `halved` tells the caller to take half of it.
 * With projectiles, each allocated projectile rolls on its own, with its own
 * d20 and its own crit that doubles only its own dice. The merged damage is
 * for the readout, and each shot keeps its own damage for the caller to
 * apply. A hit with `onHit` rolls the target's save once, after the damage,
 * however many projectiles hit it.
 * @param {SpellAttackEffect} effect
 * @param {{
 *   parts: DamagePart[],
 *   ongoing: DamagePart[] | null,
 *   allocation: number[] | null,
 *   targets: CastTarget[],
 *   spellAttackBonus: number,
 *   saveDC: number,
 *   spellModifier: number,
 *   attackMode: RollMode,
 *   casterConditions: RiderSource[],
 *   casterId?: string,
 *   rng: RandomFn,
 * }} ctx `casterId` names the caster, so a mark it left on a target
 *   (a hit rider with `mark` set) adds its dice to a hit on that target.
 * @returns {object[]}
 */
export function resolveAttack(effect, ctx) {
  const { parts, ongoing, allocation, targets, saveDC, rng } = ctx;
  const bonus = effect.addsModifier ? ctx.spellModifier : 0;
  // The target's own chips can slant the roll aimed at it, so the mode is
  // read per target and falls back to the one the whole cast carries.
  // A hit rider (Hex) adds its dice to each hit, and a crit doubles them
  // with the spell's own dice. A rider limited to weapon hits does not count.
  const ridersOn = (/** @type {CastTarget} */ target) =>
    hitRiders({ id: ctx.casterId ?? '', conditions: ctx.casterConditions }, target, {
      weapon: false,
    });
  const shot = (/** @type {CastTarget} */ target, /** @type {number} */ ac) =>
    rollProjectile({
      parts,
      extra: hitRiderParts(ridersOn(target), false, parts[0]?.damageType ?? 'bonus'),
      ac,
      attackBonus: ctx.spellAttackBonus,
      mode: target.attackMode ?? ctx.attackMode,
      autoHit: effect.projectiles?.autoHit,
      autoCrit: target.autoCrit,
      bonus,
      casterConditions: ctx.casterConditions,
      rng,
    });
  // What a hit adds beyond its damage: the dice for later turns, and the save
  // or chip of `onHit`.
  const extras = (/** @type {CastTarget} */ target) => ({
    ...(ongoing ? { ongoing } : {}),
    ...(effect.onHit ? { onHit: onHitOutcome(effect.onHit, target, saveDC, rng) } : {}),
  });

  if (!allocation) {
    return targets.map((target) => {
      const ac = target.ac ?? 10;
      const { attack, natural, crit, hit, damage, rider } = shot(target, ac);
      const splash = !hit && effect.halfOnMiss ? rollDamage(parts, bonus, rng) : null;
      return {
        target,
        attack,
        natural,
        crit,
        hit,
        ac,
        damage: damage ?? splash,
        rider,
        ...(hit ? { hitNote: hitRiderNote(ridersOn(target), crit) } : {}),
        ...(splash ? { halved: true } : {}),
        ...(hit ? extras(target) : {}),
      };
    });
  }

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
      ...(landed.length > 0 ? extras(target) : {}),
    };
  });
}

/**
 * An attack spell's outcome for one target after the target raised its AC
 * by `raised` with a reaction (Shield). A roll that no longer meets the new
 * AC misses, unless its d20 showed a natural 20. A projectile that hits
 * automatically (Magic Missile) is stopped only when `blocks` is true, which
 * the caller sets when the ward chip names the spell (Shield). A single attack that
 * turns into a miss keeps its rolled dice as the splash of a spell with
 * `halfOnMiss`. A target that no hit reaches any more loses the chip and the
 * dice for later turns that the hit brought.
 * @param {SpellAttackEffect} effect
 * @param {any} outcome one entry of `resolveAttack`
 * @param {number} raised how much the target's AC went up
 * @param {boolean} [blocks] whether the ward stops this spell outright
 * @returns {any}
 */
export function wardedOutcome(effect, outcome, raised, blocks = false) {
  if (!outcome.hit || (raised <= 0 && !blocks)) return outcome;
  const ac = outcome.ac + raised;
  const turned = (/** @type {any} */ s) =>
    s.hit && (s.attack === null ? blocks : s.natural !== 20 && s.attack.total < ac);
  const { ongoing: _ongoing, onHit: _onHit, ...plain } = outcome;
  if (!outcome.shots) {
    if (!turned(outcome)) return { ...outcome, ac };
    return {
      ...plain,
      ac,
      hit: false,
      crit: false,
      damage: effect.halfOnMiss ? outcome.damage : null,
      ...(effect.halfOnMiss ? { halved: true } : {}),
    };
  }
  /** @type {ProjectileShot[]} */
  const shots = outcome.shots.map((/** @type {ProjectileShot} */ s) =>
    turned(s) ? { ...s, hit: false, crit: false, damage: null } : s,
  );
  const landed = shots.filter((s) => s.damage !== null);
  if (landed.length === 0) return { ...plain, ac, shots, hits: 0, hit: false, damage: null };
  return {
    ...outcome,
    ac,
    shots,
    hits: landed.length,
    damage: mergeDamage(
      /** @type {ReturnType<typeof rollDamage>[]} */ (landed.map((s) => s.damage)),
    ),
  };
}

/**
 * Whether raising the target's AC by `bonus` takes away at least one hit
 * from this outcome, which is the only case where a reaction such as Shield
 * is worth offering.
 * @param {SpellAttackEffect} effect
 * @param {any} outcome
 * @param {number} bonus
 * @param {boolean} [blocks] whether the ward stops this spell outright
 * @returns {boolean}
 */
export function wardTurns(effect, outcome, bonus, blocks = false) {
  const warded = wardedOutcome(effect, outcome, bonus, blocks);
  return outcome.shots ? warded.hits < outcome.hits : outcome.hit && !warded.hit;
}
