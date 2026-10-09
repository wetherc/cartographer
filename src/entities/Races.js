import { DEFAULT_RACES } from '../data/races.js';

/** @typedef {import('../types/race.js').RaceDef} RaceDef */
/** @typedef {import('../types/race.js').RaceSnapshot} RaceSnapshot */
/** @typedef {import('../types/race.js').RacePicks} RacePicks */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The playable races. The definitions live in data/races.js (library-kind
 * shaped, with a stable id and name per entry). This module holds the logic
 * that reads them, mirroring Classes.js.
 * @type {RaceDef[]}
 */
export const RACE_LIST = DEFAULT_RACES;

/** The races indexed by id, for O(1) lookup.
 * @type {Map<string, RaceDef>} */
const RACE_BY_ID = new Map(RACE_LIST.map((r) => [r.id, r]));

/**
 * The race definition for an id, or null for an unknown or absent id (a
 * hand-typed race).
 * @param {string | undefined | null} raceId
 * @returns {RaceDef | null}
 */
export function getRace(raceId) {
  return (raceId && RACE_BY_ID.get(raceId)) || null;
}

/**
 * Copy a definition's mechanical fields into an independent snapshot. No
 * arrays are shared with the catalog, so the stored copy survives any later
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
    ...(def.keepsSpeedInArmor ? { keepsSpeedInArmor: true } : {}),
    ...(def.hpPerLevel ? { hpPerLevel: def.hpPerLevel } : {}),
    ...(def.abilityChoice
      ? { abilityChoice: { ...def.abilityChoice, exclude: [...def.abilityChoice.exclude] } }
      : {}),
    ...(def.skillChoice ? { skillChoice: { ...def.skillChoice } } : {}),
  };
}

/**
 * The valid picks for a race's choices. Ability picks must be distinct and
 * outside the race's exclude list, and skill picks must be distinct. Each
 * list stops at the race's count, so extra or invalid picks drop out.
 * @param {RaceDef} def
 * @param {RacePicks} picks
 * @returns {{ abilities: string[], skills: string[] }}
 */
export function validRacePicks(def, picks) {
  const choice = def.abilityChoice;
  const excluded = new Set(choice?.exclude ?? []);
  const abilities = choice
    ? [...new Set(picks.abilities ?? [])].filter((key) => !excluded.has(/** @type {any} */ (key)))
    : [];
  const skills = def.skillChoice ? [...new Set(picks.skills ?? [])] : [];
  return {
    abilities: abilities.slice(0, choice?.count ?? 0),
    skills: skills.slice(0, def.skillChoice?.count ?? 0),
  };
}

/**
 * The character's ability scores with the race they currently carry taken
 * back off. The snapshot records what the race actually added, so undoing
 * it stays exact even if a person edited the catalog entry since.
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
 * definition's mechanical fields, and the definition's ability increases
 * added to the character's scores. If a race is already assigned, the
 * function first removes its increases. This makes re-assigning idempotent,
 * and switching races swaps one set of bonuses for the other instead of
 * stacking them. An unknown id leaves the character unchanged. This
 * function is pure.
 * @param {Character} character
 * @param {string} raceId
 * @param {RacePicks} [picks] the player's picks for the race's ability and
 *   skill choices. The chosen abilities join the snapshot's
 *   `abilityIncreases`, so a later race change takes them back off too.
 * @returns {Character}
 */
export function withRace(character, raceId, picks = {}) {
  const def = getRace(raceId);
  if (!def) return character;
  const stats = statsWithoutRace(character);
  const { abilities, skills } = validRacePicks(def, picks);
  /** @type {Record<string, number>} */
  const gains = { ...def.abilityIncreases };
  const amount = def.abilityChoice?.amount ?? 0;
  for (const key of abilities) gains[key] = (gains[key] ?? 0) + amount;
  for (const [key, gain] of Object.entries(gains)) {
    stats[key] = (stats[key] ?? 10) + gain;
  }
  const raceTraits = {
    ...snapshotRace(def),
    abilityIncreases: gains,
    ...(skills.length ? { chosenSkills: skills } : {}),
  };
  return { ...character, race: def.name, raceId: def.id, raceTraits, stats };
}

/**
 * Set a hand-typed race: only the display string. The function drops any
 * catalog id and snapshot that a previous assignment left behind, along with
 * the ability increases that assignment added. This function is pure.
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
 * A character's race mechanics, resolved at call time. The live catalog
 * definition wins, so a library edit propagates to every character of that
 * race. The stored snapshot backs a definition that no longer exists in the
 * catalog. A hand-typed race resolves to null.
 *
 * `abilityIncreases` is the exception. It always comes from the snapshot.
 * The increases are baked into the character's scores when a person assigns
 * the race. Reporting a later catalog edit here describes a bonus the
 * character never received.
 * @param {Character} character
 * @returns {RaceSnapshot | null}
 */
export function resolveRace(character) {
  const def = getRace(character.raceId);
  if (!def) return character.raceTraits ?? null;
  const snapshot = snapshotRace(def);
  const applied = character.raceTraits?.abilityIncreases;
  const chosen = character.raceTraits?.chosenSkills ?? [];
  return {
    ...snapshot,
    ...(applied ? { abilityIncreases: { ...applied } } : {}),
    ...(chosen.length ? { chosenSkills: [...chosen] } : {}),
  };
}
