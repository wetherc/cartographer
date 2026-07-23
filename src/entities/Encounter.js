/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */
/** @typedef {import('../types/entities.js').EncounterTemplate} EncounterTemplate */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */

/**
 * Create an encounter at full health, optionally staged at a map location.
 * @param {string} id
 * @param {string} name
 * @param {number} maxHP
 * @param {Record<string, number>} [statBlock]
 * @param {EncounterLocation | null} [location]
 * @param {{ level?: number, tier?: EnemyTier }} [options]
 * @returns {Encounter}
 */
export function createEncounter(id, name, maxHP, statBlock = {}, location = null, options = {}) {
  return {
    id,
    name,
    maxHP,
    currentHP: maxHP,
    statBlock,
    level: options.level ?? 1,
    tier: options.tier ?? 'mob',
    location,
    conditions: [],
  };
}

/**
 * Fill in fields a loaded encounter may predate: encounters saved before
 * location binding existed stay unbound (always shown); ones saved before
 * levels and tiers read as level-1 mobs.
 * @param {Encounter} encounter
 * @returns {Encounter}
 */
export function withDefaults(encounter) {
  return {
    ...encounter,
    location: encounter.location ?? null,
    conditions: encounter.conditions ?? [],
    level: encounter.level ?? 1,
    tier: encounter.tier ?? 'mob',
  };
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
 * The undefeated encounters staged on the party's exact tile — what a step
 * onto that tile "walks into". Unbound (location === null) encounters aren't
 * tile-specific, so they never trigger a step. Pure.
 * @param {Encounter[]} encounters
 * @param {{ nodeId: string, tileId: string } | null} position
 * @returns {Encounter[]}
 */
export function encountersOnTile(encounters, position) {
  if (!position) return [];
  return encounters.filter(
    (e) =>
      e.location !== null &&
      e.location.nodeId === position.nodeId &&
      e.location.tileId === position.tileId &&
      !isDefeated(e),
  );
}

/**
 * Capture an encounter as a reusable bestiary template: its blueprint (name,
 * max HP, stat block), not its live state (current HP, location, conditions).
 * @param {string} id
 * @param {Encounter} encounter
 * @returns {EncounterTemplate}
 */
export function toTemplate(id, encounter) {
  return {
    id,
    name: encounter.name,
    maxHP: encounter.maxHP,
    statBlock: { ...encounter.statBlock },
    level: encounter.level ?? 1,
    tier: encounter.tier ?? 'mob',
  };
}

/**
 * Spawn a fresh, full-health encounter from a bestiary template.
 * @param {EncounterTemplate} template
 * @param {string} id
 * @param {EncounterLocation | null} [location]
 * @returns {Encounter}
 */
export function fromTemplate(template, id, location = null) {
  return createEncounter(id, template.name, template.maxHP, { ...template.statBlock }, location, {
    level: template.level ?? 1,
    tier: template.tier ?? 'mob',
  });
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
