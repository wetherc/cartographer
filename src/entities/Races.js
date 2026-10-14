import { DEFAULT_RACES } from '../data/raceCatalog.js';
import { ABILITY_MAX } from './Modifiers.js';

/** @typedef {import('../types/race.js').RaceDef} RaceDef */
/** @typedef {import('../types/race.js').RaceSnapshot} RaceSnapshot */
/** @typedef {import('../types/race.js').RacePicks} RacePicks */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The playable races. The definitions live in data/raceCatalog.js (library-kind
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
    ...(def.resistanceChoice ? { resistanceChoice: [...def.resistanceChoice] } : {}),
    ...(def.toolChoice ? { toolChoice: [...def.toolChoice] } : {}),
    ...(def.cantripChoice ? { cantripChoice: { ...def.cantripChoice } } : {}),
  };
}

/**
 * The valid picks for a race's choices. Ability picks must be distinct and
 * outside the race's exclude list, and skill picks must be distinct. Each
 * list stops at the race's count, so extra or invalid picks drop out. The
 * resistance pick must be one of the race's `resistanceChoice` types, and
 * the tool pick one of its `toolChoice` tools. A race with a
 * `cantripChoice` keeps any named cantrip, because the spell list lives in
 * the library and the dialog offers only cantrips of that class.
 * @param {RaceDef} def
 * @param {RacePicks} picks
 * @returns {{ abilities: string[], skills: string[], resistance: string | null, tool: string | null, cantrip: string | null }}
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
    resistance:
      picks.resistance && def.resistanceChoice?.includes(picks.resistance)
        ? picks.resistance
        : null,
    tool: picks.tool && def.toolChoice?.includes(picks.tool) ? picks.tool : null,
    cantrip: (def.cantripChoice && picks.cantrip) || null,
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
 * stacking them. Each increase stops at `ABILITY_MAX`, and the snapshot
 * records the gain that landed, so a later swap takes back that amount.
 * An unknown id leaves the character unchanged. This
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
  const { abilities, skills, resistance, tool, cantrip } = validRacePicks(def, picks);
  /** @type {Record<string, number>} */
  const gains = { ...def.abilityIncreases };
  const amount = def.abilityChoice?.amount ?? 0;
  for (const key of abilities) gains[key] = (gains[key] ?? 0) + amount;
  for (const [key, gain] of Object.entries(gains)) {
    const before = stats[key] ?? 10;
    stats[key] = Math.max(before, Math.min(ABILITY_MAX, before + gain));
    gains[key] = stats[key] - before;
  }
  const snapshot = snapshotRace(def);
  const raceTraits = {
    ...snapshot,
    ...(resistance
      ? { resistances: [...snapshot.resistances, resistance], chosenResistance: resistance }
      : {}),
    ...(tool ? { tools: [...snapshot.tools, tool], chosenTool: tool } : {}),
    abilityIncreases: gains,
    ...(skills.length ? { chosenSkills: skills } : {}),
  };
  const base = { ...withoutRaceCantrip(character), race: def.name, raceId: def.id, stats };
  return withRaceCantrip({ ...base, raceTraits }, cantrip, def.cantripChoice?.classId);
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
    ...withoutRaceCantrip(character),
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
  const picked = character.raceTraits?.chosenResistance;
  const tool = character.raceTraits?.chosenTool;
  const cantrip = character.raceTraits?.chosenCantrip;
  return {
    ...snapshot,
    ...(applied ? { abilityIncreases: { ...applied } } : {}),
    ...(chosen.length ? { chosenSkills: [...chosen] } : {}),
    ...(picked ? { resistances: [...snapshot.resistances, picked], chosenResistance: picked } : {}),
    ...(tool ? { tools: [...snapshot.tools, tool], chosenTool: tool } : {}),
    ...(cantrip ? { chosenCantrip: cantrip } : {}),
  };
}

/**
 * The race cantrip that the character still knows, as a list of zero or one
 * spell ids. `Classes.cantripLimit` adds it to the class limit, so the race
 * cantrip does not use up a class cantrip.
 * @param {{ raceTraits?: RaceSnapshot, spellbook?: import('../types/entities.js').Spellbook }} character
 * @returns {string[]}
 */
export function raceCantrips(character) {
  const id = character.raceTraits?.chosenCantrip;
  return id && character.spellbook?.cantrips.includes(id) ? [id] : [];
}

/**
 * The character with its race cantrip taken out of the spellbook, along
 * with the source record of that cantrip. A character with no race cantrip
 * comes back unchanged.
 * @param {Character} character
 * @returns {Character}
 */
function withoutRaceCantrip(character) {
  const [id] = raceCantrips(character);
  if (!id || !character.spellbook) return character;
  const book = character.spellbook;
  const sources = { ...book.sources };
  delete sources[id];
  return {
    ...character,
    spellbook: { ...book, cantrips: book.cantrips.filter((c) => c !== id), sources },
  };
}

/**
 * The character with a race cantrip added to the spellbook. The cantrip's
 * source is the class of the race's `cantripChoice`, so the cast uses that
 * class's spell ability (INT for the wizard list) even for a character with
 * no caster class. A cantrip that the character already knows from a class
 * stays a class cantrip, and the race records no pick.
 * @param {Character} character
 * @param {string | null} id
 * @param {string | undefined} classId
 * @returns {Character}
 */
function withRaceCantrip(character, id, classId) {
  const book = character.spellbook ?? { cantrips: [], known: [], prepared: [] };
  if (!id || !classId || book.cantrips.includes(id)) return character;
  return {
    ...character,
    raceTraits: character.raceTraits && { ...character.raceTraits, chosenCantrip: id },
    spellbook: {
      ...book,
      cantrips: [...book.cantrips, id],
      sources: { ...book.sources, [id]: classId },
    },
  };
}
