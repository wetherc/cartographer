import { hasFeature } from './Features.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The flat bonus that a caster's class features add to each target of a
 * healing spell. Disciple of Life (Life Domain cleric, level 1) adds 2 + the
 * slot level. It applies only to a spell of 1st level or higher that rolls
 * healing dice, so a cantrip, a revive, a stabilize, and a heal with no dice
 * (Lesser Restoration) get nothing. An upcast uses the slot it was cast with.
 * The feature comes from the Life Domain entry in `data/classes.js`, and a
 * save stores the subclass by name ("Life Domain"), which the catalog match
 * accepts.
 * @param {import('./Features.js').Featured} caster
 * @param {Spell} spell
 * @param {number} slotLevel
 * @returns {number}
 */
export function healingBonus(caster, spell, slotLevel) {
  const effect = spell.effect;
  if (effect.kind !== 'heal' || effect.healing.length === 0) return 0;
  if (effect.revives || effect.stabilizes || slotLevel < 1) return 0;
  return hasFeature(caster, 'Disciple of Life') ? 2 + slotLevel : 0;
}
