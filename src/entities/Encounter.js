import { normalizeStatBlock } from './Modifiers.js';
import { withinRadius } from '../map/FogOfWar.js';

/** @typedef {import('../types/entities.js').Encounter} Encounter */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */
/** @typedef {import('../types/entities.js').EncounterTemplate} EncounterTemplate */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */
/** @typedef {import('../types/entities.js').StatModifier} StatModifier */

/**
 * Create an encounter at full health, optionally staged at a map location.
 * The stat block is closed over the fixed stat set (six abilities + AC).
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
    statBlock: normalizeStatBlock(statBlock),
    level: options.level ?? 1,
    tier: options.tier ?? 'mob',
    location,
    conditions: [],
    statMods: [],
  };
}

/**
 * Fill in fields a loaded encounter may predate: encounters saved before
 * location binding existed stay unbound (always shown); ones saved before
 * levels and tiers read as level-1 mobs. The stat block is re-closed over the
 * fixed stat set, so custom stats from older saves drop away.
 * @param {Encounter} encounter
 * @returns {Encounter}
 */
export function withDefaults(encounter) {
  return {
    ...encounter,
    statBlock: normalizeStatBlock(encounter.statBlock ?? {}),
    location: encounter.location ?? null,
    conditions: encounter.conditions ?? [],
    statMods: encounter.statMods ?? [],
    level: encounter.level ?? 1,
    tier: encounter.tier ?? 'mob',
  };
}

/**
 * Add a timed adjustment to one stat: +delta (or -delta) for a number of
 * combat rounds. Modifiers on the same stat stack; each ticks down on its own.
 * @param {Encounter} encounter
 * @param {string} stat
 * @param {number} delta
 * @param {number} rounds
 * @returns {Encounter}
 */
export function addStatModifier(encounter, stat, delta, rounds) {
  if (!delta || rounds < 1) return encounter;
  const mod = { stat, delta, rounds: Math.floor(rounds) };
  return { ...encounter, statMods: [...(encounter.statMods ?? []), mod] };
}

/**
 * Advance one combat round: decrement every stat modifier's counter and drop
 * any that reach zero — the stat-block twin of tickConditions.
 * @param {StatModifier[]} mods
 * @returns {StatModifier[]}
 */
export function tickStatModifiers(mods) {
  return mods.map((m) => ({ ...m, rounds: m.rounds - 1 })).filter((m) => m.rounds > 0);
}

/**
 * The stat block as it currently reads: base values plus every active timed
 * modifier. This is what combat math and the Play view display should use.
 * @param {Encounter} encounter
 * @returns {Record<string, number>}
 */
export function effectiveStatBlock(encounter) {
  const block = { ...normalizeStatBlock(encounter.statBlock ?? {}) };
  for (const mod of encounter.statMods ?? []) {
    if (mod.stat in block) block[mod.stat] += mod.delta;
  }
  return block;
}

/**
 * Apply a GM edit to an encounter's blueprint fields and placement, keeping
 * its live state: currentHP survives (clamped to the new maximum) and the
 * stat block and conditions are untouched, so re-tuning a fight in progress
 * doesn't reset it. Moving the encounter clears the `noticed` flag, so the
 * party walking into its new spot logs a fresh meeting.
 * @param {Encounter} encounter
 * @param {{ name: string, maxHP: number, level: number, tier: EnemyTier, location: EncounterLocation | null }} edits
 * @returns {Encounter}
 */
export function editEncounter(encounter, edits) {
  const maxHP = Math.max(1, edits.maxHP);
  const moved =
    (encounter.location?.nodeId ?? null) !== (edits.location?.nodeId ?? null) ||
    (encounter.location?.tileId ?? null) !== (edits.location?.tileId ?? null);
  return {
    ...encounter,
    name: edits.name,
    maxHP,
    currentHP: Math.min(encounter.currentHP, maxHP),
    level: edits.level,
    tier: edits.tier,
    location: edits.location,
    noticed: moved ? false : encounter.noticed,
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
 * The encounters a GM's Play sidebar should list: those the party is close
 * enough to matter — staged in the party's node within `radius` grid cells of
 * its tile — plus unbound ones (location === null), which are always relevant.
 * Distance is the same Euclidean rule the fog uses. Pure.
 * @param {Encounter[]} encounters
 * @param {{ nodeId: string, tileId: string } | null} position
 * @param {number} radius
 * @returns {Encounter[]}
 */
export function encountersNear(encounters, position, radius) {
  return encounters.filter(
    (e) =>
      e.location === null ||
      (position !== null &&
        e.location.nodeId === position.nodeId &&
        withinRadius(e.location.tileId, position.tileId, radius)),
  );
}

/**
 * The encounters a player's sidebar should list: only what the party has
 * actually discovered. A bound encounter is discovered once its tile has been
 * revealed through the fog of war (checked against `node`, the party's current
 * node); an unbound one only once the party has walked into it (`noticed`).
 * Pure.
 * @param {Encounter[]} encounters
 * @param {{ nodeId: string } | null} position
 * @param {import('../types/map.js').MapNode | null} node the party's current node
 * @returns {Encounter[]}
 */
export function discoveredEncounters(encounters, position, node) {
  return encounters.filter((e) => {
    if (e.location === null) return e.noticed === true;
    if (position === null || node === null || e.location.nodeId !== position.nodeId) return false;
    const { tileId } = e.location;
    return node.tiles.some((t) => t.id === tileId && t.revealed);
  });
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
    statBlock: normalizeStatBlock(encounter.statBlock ?? {}),
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
