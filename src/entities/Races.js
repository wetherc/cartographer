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
 * Assign a catalog race: the display name, the id, and a snapshot of the
 * definition's mechanical fields. An unknown id leaves the character
 * unchanged. Pure.
 * @param {Character} character
 * @param {string} raceId
 * @returns {Character}
 */
export function withRace(character, raceId) {
  const def = getRace(raceId);
  if (!def) return character;
  return { ...character, race: def.name, raceId: def.id, raceTraits: snapshotRace(def) };
}

/**
 * Set a hand-typed race: just the display string, dropping any catalog id and
 * snapshot a previous assignment left behind. Pure.
 * @param {Character} character
 * @param {string} name
 * @returns {Character}
 */
export function withCustomRace(character, name) {
  return { ...character, race: name, raceId: undefined, raceTraits: undefined };
}

/**
 * A character's racial mechanics, resolved at call time: the live catalog
 * definition wins (so a library edit propagates to every character of that
 * race), the stored snapshot backs a definition that has since disappeared,
 * and a hand-typed race resolves to null.
 * @param {Character} character
 * @returns {RaceSnapshot | null}
 */
export function resolveRace(character) {
  const def = getRace(character.raceId);
  if (def) return snapshotRace(def);
  return character.raceTraits ?? null;
}
