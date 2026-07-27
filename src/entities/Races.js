import { DEFAULT_RACES } from '../data/races.js';

/** @typedef {import('../types/race.js').RaceDef} RaceDef */
/** @typedef {import('../types/race.js').RaceSnapshot} RaceSnapshot */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The playable races. The definitions live in data/races.js (library-kind
 * shaped, stable id + name per entry); this module holds the logic that reads
 * them, mirroring Classes.js.
 * @type {RaceDef[]}
 */
export const RACE_LIST = DEFAULT_RACES;

/** The races indexed by id, for O(1) lookup.
 * @type {Map<string, RaceDef>} */
const RACE_BY_ID = new Map(RACE_LIST.map((r) => [r.id, r]));

/**
 * The race definition for an id, or null for an unknown/absent id (a
 * hand-typed race).
 * @param {string | undefined | null} raceId
 * @returns {RaceDef | null}
 */
export function getRace(raceId) {
  return (raceId && RACE_BY_ID.get(raceId)) || null;
}

/**
 * Copy a definition's mechanical fields into an independent snapshot — no
 * arrays shared with the catalog, so the stored copy survives any later
 * library edit untouched.
 * @param {RaceDef} def
 * @returns {RaceSnapshot}
 */
function snapshotRace(def) {
  return {
    abilityIncreases: { ...def.abilityIncreases },
    size: def.size,
    speed: def.speed,
    darkvision: def.darkvision,
    resistances: [...def.resistances],
    skills: [...def.skills],
    weapons: [...def.weapons],
    tools: [...def.tools],
    languages: [...def.languages],
    traits: [...def.traits],
  };
}

/**
 * The character's ability scores with the race they currently carry taken back
 * off. The snapshot records what was actually added, so undoing it is exact
 * even if the catalog entry has since been edited.
 * @param {Character} character
 * @returns {Record<string, number>}
 */
function statsWithoutRace(character) {
  const stats = { ...character.stats };
  for (const [key, gain] of Object.entries(character.raceTraits?.abilityIncreases ?? {})) {
    stats[key] = (stats[key] ?? 10) - gain;
  }
  return stats;
}

/**
 * Assign a catalog race: the display name, the id, a snapshot of the
 * definition's mechanical fields, and the definition's ability increases added
 * to the character's scores. Any race already assigned has its increases taken
 * back off first, so re-assigning is idempotent and switching races swaps one
 * set of bonuses for the other rather than stacking them. An unknown id leaves
 * the character unchanged. Pure.
 * @param {Character} character
 * @param {string} raceId
 * @returns {Character}
 */
export function withRace(character, raceId) {
  const def = getRace(raceId);
  if (!def) return character;
  const stats = statsWithoutRace(character);
  for (const [key, gain] of Object.entries(def.abilityIncreases)) {
    stats[key] = (stats[key] ?? 10) + gain;
  }
  return { ...character, race: def.name, raceId: def.id, raceTraits: snapshotRace(def), stats };
}

/**
 * Set a hand-typed race: just the display string, dropping any catalog id and
 * snapshot a previous assignment left behind, along with the ability increases
 * that assignment added. Pure.
 * @param {Character} character
 * @param {string} name
 * @returns {Character}
 */
export function withCustomRace(character, name) {
  return {
    ...character,
    race: name,
    raceId: undefined,
    raceTraits: undefined,
    stats: statsWithoutRace(character),
  };
}

/**
 * A character's racial mechanics, resolved at call time: the live catalog
 * definition wins (so a library edit propagates to every character of that
 * race), the stored snapshot backs a definition that has since disappeared,
 * and a hand-typed race resolves to null.
 *
 * `abilityIncreases` is the exception, and always comes from the snapshot. The
 * increases are baked into the character's scores when the race is assigned,
 * so reporting a later catalog edit here would describe a bonus the character
 * never received.
 * @param {Character} character
 * @returns {RaceSnapshot | null}
 */
export function resolveRace(character) {
  const def = getRace(character.raceId);
  if (!def) return character.raceTraits ?? null;
  const snapshot = snapshotRace(def);
  const applied = character.raceTraits?.abilityIncreases;
  return applied ? { ...snapshot, abilityIncreases: { ...applied } } : snapshot;
}
