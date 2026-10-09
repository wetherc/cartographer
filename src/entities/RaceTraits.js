import { resolveRace } from './Races.js';
import { conditionKey } from './Conditions.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Race traits with a mechanical effect on d20 rolls. A character's race
 * comes from `resolveRace`, so a trait name on the live catalog entry (or on
 * the stored snapshot of a deleted race) turns the effect on. A creature has
 * no race and gets none of these effects. Every function is pure.
 */

/** The abilities whose saves Gnome Cunning helps against magic. */
const MENTAL = ['INT', 'WIS', 'CHA'];

/**
 * True when the entity's race lists the trait name.
 * @param {Partial<Character> | null | undefined} entity
 * @param {string} name
 * @returns {boolean}
 */
export function hasRaceTrait(entity, name) {
  if (!entity?.raceId && !entity?.raceTraits) return false;
  return resolveRace(/** @type {Character} */ (entity))?.traits.includes(name) ?? false;
}

/**
 * True when the entity has the Halfling's Lucky trait, which rerolls a
 * natural 1 on an attack roll, ability check, or saving throw.
 * @param {Partial<Character> | null | undefined} entity
 * @returns {boolean}
 */
export function isLucky(entity) {
  return hasRaceTrait(entity, 'Lucky');
}

/**
 * The advantage that a race trait gives on one saving throw, or null.
 * Brave helps against Frightened, Fey Ancestry against Charmed, Dwarven
 * Resilience against poison (the Poisoned condition or poison damage), and
 * Gnome Cunning on INT, WIS, and CHA saves against magic.
 * @param {Partial<Character> | null | undefined} entity
 * @param {{ ability: string, condition?: string | null, damageTypes?: string[], magic?: boolean }} save
 * @returns {'advantage' | null}
 */
export function raceSaveSlant(entity, { ability, condition, damageTypes = [], magic = false }) {
  const imposed = conditionKey(condition);
  const helps =
    (imposed === 'frightened' && hasRaceTrait(entity, 'Brave')) ||
    (imposed === 'charmed' && hasRaceTrait(entity, 'Fey Ancestry')) ||
    ((imposed === 'poisoned' || damageTypes.includes('poison')) &&
      hasRaceTrait(entity, 'Dwarven Resilience')) ||
    (magic && MENTAL.includes(ability.toUpperCase()) && hasRaceTrait(entity, 'Gnome Cunning'));
  return helps ? 'advantage' : null;
}

/**
 * The save that a spell asks for, in the form `raceSaveSlant` reads. The
 * condition comes from a save effect or from an attack's hit rider, and the
 * damage types from a save effect. Every spell save is a save against magic.
 * @param {import('../types/spell.js').SpellEffect} effect
 * @param {string} ability
 * @returns {{ ability: string, condition?: string, damageTypes: string[], magic: boolean }}
 */
export function spellRaceSave(effect, ability) {
  if (effect.kind === 'save') {
    const damageTypes = effect.damage.map((part) => part.damageType);
    return { ability, condition: effect.condition, damageTypes, magic: true };
  }
  const condition = effect.kind === 'attack' ? effect.onHit?.condition : undefined;
  return { ability, condition, damageTypes: [], magic: true };
}
