/**
 * Creatures that a spell put on the map: which cast owns one, and what the end
 * of the cast takes back off. Every function is pure. Each function takes a
 * creature list and returns a new one.
 *
 * This module is the creature-side twin of `entities/ImposedConditions.js`. A
 * condition chip that a cast writes carries a `source` naming the spell and
 * the caster, and a creature that a cast spawns carries the same stamp in
 * `summonedBy`. One sweep therefore ends both halves of a spell, and a
 * creature that the GM placed by hand carries no stamp and never leaves.
 */

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/creature.js').SummonSource} SummonSource */

/**
 * Whether this creature came from that caster's cast of that spell. Both
 * halves must match, for the same reason `isImposedBy` needs both: one caster
 * can hold two summoning spells, and two casters can hold the same one.
 * @param {Creature} creature
 * @param {string} casterId
 * @param {string} spellId
 * @returns {boolean}
 */
export function isSummonedBy(creature, casterId, spellId) {
  const source = creature.summonedBy;
  return Boolean(source && source.casterId === casterId && source.spellId === spellId);
}

/**
 * Stamp a freshly spawned creature with the cast that made it. The stamp is
 * what lets the end of the spell find the creature again.
 * @param {Creature} creature
 * @param {SummonSource} source
 * @returns {Creature}
 */
export function stampSummon(creature, source) {
  return { ...creature, summonedBy: { ...source } };
}

/**
 * Remove every creature that one cast summoned. This is what happens when the
 * caster drops the spell, loses it to damage, or lets its duration run out.
 * The function reports the creatures removed, so the caller can state what
 * left. It returns the original list unchanged (identity preserved) when no
 * creature matched, so a caller can skip the write.
 *
 * A summon that is already at 0 hit points leaves the same way a living one
 * does. It is still the spell's creature, and nothing else would ever clear
 * it off the roster.
 * @param {readonly Creature[]} list
 * @param {string} casterId
 * @param {string} spellId
 * @returns {{ creatures: readonly Creature[], despawned: Creature[] }}
 */
export function despawnSummons(list, casterId, spellId) {
  const despawned = list.filter((c) => isSummonedBy(c, casterId, spellId));
  if (despawned.length === 0) return { creatures: list, despawned };
  return { creatures: list.filter((c) => !isSummonedBy(c, casterId, spellId)), despawned };
}
