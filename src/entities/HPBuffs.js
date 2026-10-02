import { heldBoost } from './ChipMods.js';
import { getHP, restoreResource } from './Character.js';
import { HP_RESOURCE_ID } from './PoolIds.js';
import { heal } from './Creature.js';
import { setMax } from './Resource.js';
import { updateById } from './Roster.js';

/**
 * What spell chips do to an entity's hit points. Aid raises the HP maximum
 * and current HP while its chip lasts, and False Life and Heroism grant
 * temporary HP that end with their chips.
 *
 * The raise is stored in the maximum itself, and `hpBoost` records how much
 * of the maximum it is. Every HP reader then reads the stored maximum and
 * needs no chip lookup. `settleHPBuffs` compares that record with the chips
 * the entity holds now and moves the maximum by the difference. The chip
 * writers (a cast, a round tick, game time, a turn boundary, a hand edit)
 * call it after they change the chip list, so a raise comes off when its
 * chip goes by any path. Every function here is pure.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/entities.js').HPBuffFields} HPBuffFields */

/**
 * @template {Character | Creature} T
 * @param {T} entity
 * @returns {entity is Extract<T, Creature>}
 */
function isCreatureLike(entity) {
  return 'currentHP' in entity;
}

/**
 * An entity whose stored HP maximum and temporary HP match the chips it
 * holds. A new or larger raise lifts the maximum and current HP by the
 * difference. A raise that ends drops the maximum, and current HP drops only
 * where it now sits above the maximum. Temporary HP that a chip granted end
 * once that chip is gone. An entity already settled comes back as the same
 * object, so a round tick keeps the identity of every entity without an HP
 * chip.
 * @template {Character | Creature} T
 * @param {T} entity
 * @returns {T}
 */
export function settleHPBuffs(entity) {
  return settleTemp(settleBoost(entity));
}

/**
 * @template {Character | Creature} T
 * @param {T} entity
 * @returns {T}
 */
function settleBoost(entity) {
  const want = heldBoost(entity.conditions);
  const delta = want - (entity.hpBoost ?? 0);
  if (delta === 0) return entity;
  const { hpBoost: _had, ...rest } = entity;
  const recorded = /** @type {T} */ (want > 0 ? { ...rest, hpBoost: want } : rest);
  if (isCreatureLike(recorded)) {
    const creature = /** @type {Creature} */ (recorded);
    const maxHP = Math.max(1, creature.maxHP + delta);
    const raised = { ...creature, maxHP, currentHP: Math.min(creature.currentHP, maxHP) };
    return /** @type {T} */ (delta > 0 ? heal(raised, delta) : raised);
  }
  const character = /** @type {Character} */ (recorded);
  const pool = getHP(character);
  if (!pool) return recorded;
  const max = Math.max(1, pool.max + delta);
  const moved = {
    ...character,
    resources: updateById(character.resources, HP_RESOURCE_ID, (r) => setMax(r, max)),
  };
  // A raise is a heal as well, so it brings a dying character back up.
  return /** @type {T} */ (delta > 0 ? restoreResource(moved, HP_RESOURCE_ID, delta) : moved);
}

/**
 * @template {Character | Creature} T
 * @param {T} entity
 * @returns {T}
 */
function settleTemp(entity) {
  const from = entity.bonusHPFrom;
  if (!from || entity.conditions.some((c) => c.name.toLowerCase() === from)) return entity;
  const { bonusHPFrom: _from, ...rest } = entity;
  return /** @type {T} */ ({ ...rest, bonusHP: 0 });
}

/**
 * An entity after a grant of temporary HP. Temporary HP never add up, so
 * the grant replaces what the entity has only when it is larger, and a
 * smaller grant changes nothing. `from` names the chip the grant comes from,
 * so the HP end with that chip. A grant without it lasts until damage or the
 * GM removes it.
 * @template {Character | Creature} T
 * @param {T} entity
 * @param {number} amount
 * @param {string} [from] the chip name
 * @returns {T}
 */
export function grantTempHP(entity, amount, from) {
  if (amount <= (entity.bonusHP ?? 0)) return entity;
  const { bonusHPFrom: _from, ...rest } = entity;
  return /** @type {T} */ ({
    ...rest,
    bonusHP: amount,
    ...(from ? { bonusHPFrom: from.toLowerCase() } : {}),
  });
}
