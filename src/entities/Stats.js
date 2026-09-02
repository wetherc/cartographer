/**
 * One combatant stat as it currently reads. Every function is pure.
 */

import { equippedIndex } from './Equipment.js';
import { normalizeStatBlock } from './Modifiers.js';
import { isCreature } from './Creature.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/entities.js').StatSource} StatSource */

/** The label a timed adjustment carries in a breakdown. A modifier records no
 * cause, only a delta and a countdown, so every one of them reads the same. */
const TIMED_LABEL = 'Adjustment';

/**
 * One stat as it currently reads: its base value, every source that shifts
 * it, and the resulting total. This is the one fold behind both stat
 * displays, so a source added here shows up in the character sheet's badges
 * and in a creature's chips together.
 *
 * The entity can be either shape of combatant. Both keep their base values
 * in `stats`. A character's sources are the items it has equipped, and a
 * creature's are its timed modifiers. A creature's stat set is re-closed
 * over the fixed keys first, so an older save gains an AC here the same way
 * it does everywhere else.
 *
 * `rounds` is how long the shortest-lived view of this value holds: the
 * largest countdown among the timed sources, or 0 when none apply. A
 * creature's worn armor is an AC source with no countdown, so the total here
 * is the AC that `Creature.effectiveStatBlock` gives to combat math, and a
 * chip in Play shows the same number as the combat card. The base stays the
 * authored AC, which is what the Build chips edit.
 * @param {Character | Creature} entity
 * @param {string} stat
 * @returns {{ base: number, total: number, rounds: number, sources: StatSource[] }}
 */
export function effectiveStat(entity, stat) {
  const creature = isCreature(entity);
  const base = creature
    ? normalizeStatBlock(entity.stats ?? {})[stat]
    : /** @type {Character} */ (entity).stats[stat];
  /** @type {StatSource[]} */
  const sources = [];
  if (!creature) {
    for (const item of equippedIndex(/** @type {Character} */ (entity)).values()) {
      const delta = item.statBonuses?.[stat];
      if (delta) sources.push({ source: item.name, delta });
    }
  } else {
    const armor = /** @type {Creature} */ (entity).armor;
    if (stat === 'AC' && armor?.acBonus) sources.push({ source: armor.name, delta: armor.acBonus });
  }
  for (const mod of ('statMods' in entity ? entity.statMods : null) ?? []) {
    if (mod.stat === stat && mod.delta) {
      sources.push({ source: TIMED_LABEL, delta: mod.delta, rounds: mod.rounds });
    }
  }
  return {
    base: base ?? 10,
    total: sources.reduce((sum, s) => sum + s.delta, base ?? 10),
    rounds: Math.max(0, ...sources.map((s) => s.rounds ?? 0)),
    sources,
  };
}
