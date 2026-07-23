/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */

/**
 * Create an encounter at full health, optionally staged at a map location.
 * @param {string} id
 * @param {string} name
 * @param {number} maxHP
 * @param {Record<string, number>} [statBlock]
 * @param {EncounterLocation | null} [location]
 * @returns {Encounter}
 */
export function createEncounter(id, name, maxHP, statBlock = {}, location = null) {
  return { id, name, maxHP, currentHP: maxHP, statBlock, location, conditions: [] };
}

/**
 * Fill in fields a loaded encounter may predate: encounters saved before
 * location binding existed stay unbound (always shown).
 * @param {Encounter} encounter
 * @returns {Encounter}
 */
export function withDefaults(encounter) {
  return { ...encounter, location: encounter.location ?? null, conditions: encounter.conditions ?? [] };
}

/**
 * The encounters relevant to the party's position: those staged in the node
 * the party currently occupies, plus unbound ones (location === null), which
 * are always relevant. Binding is per-node, not per-tile, so an encounter
 * doesn't vanish when the party steps one tile sideways.
 * @param {Encounter[]} encounters
 * @param {{ nodeId: string } | null} position
 * @returns {Encounter[]}
 */
export function encountersAt(encounters, position) {
  return encounters.filter(
    (e) => e.location === null || (position !== null && e.location.nodeId === position.nodeId),
  );
}

/**
 * Apply damage, clamped so currentHP never drops below 0.
 * @param {Encounter} encounter
 * @param {number} amount
 * @returns {Encounter}
 */
export function applyDamage(encounter, amount) {
  return { ...encounter, currentHP: Math.max(0, encounter.currentHP - amount) };
}

/**
 * Heal, clamped so currentHP never exceeds maxHP.
 * @param {Encounter} encounter
 * @param {number} amount
 * @returns {Encounter}
 */
export function heal(encounter, amount) {
  return { ...encounter, currentHP: Math.min(encounter.maxHP, encounter.currentHP + amount) };
}

/**
 * @param {Encounter} encounter
 * @returns {boolean}
 */
export function isDefeated(encounter) {
  return encounter.currentHP <= 0;
}
