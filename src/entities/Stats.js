/**
 * One combatant stat as it currently reads. Every function is pure.
 */

import { equippedIndex } from './Equipment.js';
import { normalizeStatBlock } from './Modifiers.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/entities.js').StatSource} StatSource */

/** The label a timed adjustment carries in a breakdown. A modifier records no
 * cause, only a delta and a countdown, so every one of them reads the same. */
const TIMED_LABEL = 'Adjustment';

/**
 * One stat as it currently reads: its base value, every source that shifts
 * it, and the resulting total. This is the one fold behind both stat
 * displays, so a source added here shows up in the character sheet's badges
 * and in an encounter's chips together.
 *
 * The entity can be either shape of combatant. A character's base values
 * live in `stats` and its sources are the items it has equipped. An
 * encounter's live in `statBlock` and its sources are timed modifiers. An
 * entity carrying both kinds gets both, equipment first, which is what a
 * condition with a mechanical effect will need.
 *
 * `rounds` is how long the shortest-lived view of this value holds: the
 * largest countdown among the timed sources, or 0 when none apply. An
 * encounter's worn armor is not a source here. Its flat AC bonus belongs to
 * the combat stat block (see `Encounter.effectiveStatBlock`), which layers it
 * over the authored base AC these chips edit.
 * @param {Character | Encounter} entity
 * @param {string} stat
 * @returns {{ base: number, total: number, rounds: number, sources: StatSource[] }}
 */
export function effectiveStat(entity, stat) {
  const base =
    'statBlock' in entity ? normalizeStatBlock(entity.statBlock ?? {})[stat] : entity.stats[stat];
  /** @type {StatSource[]} */
  const sources = [];
  if (!('statBlock' in entity)) {
    for (const item of equippedIndex(entity).values()) {
      const delta = item.statBonuses?.[stat];
      if (delta) sources.push({ source: item.name, delta });
    }
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
