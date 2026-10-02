/**
 * The field coercers `deserialize` runs on the parts of a save that have no
 * entity `withDefaults` of their own: the party position, a running combat,
 * the game clock, the travelogue, the quest log, and the bestiary. Each function reads an
 * unknown value and returns a record the panels can render without a type
 * check, or drops what it cannot read.
 *
 * Import stores what it reads and then reloads it. A field that survives the
 * load with the wrong type is therefore the stored save of an app that no
 * longer starts, and every follower tab breaks the same way through the
 * storage event. The travelogue panel, for example, formats every entry's
 * timestamp as an ISO string during composition, and that throws on a date
 * it cannot read. Every function here is pure.
 */

import { budgetOf } from '../combat/ActionBudget.js';
import { MINUTES_PER_WATCH, WATCHES } from '../time/GameClock.js';
import { clampInt } from '../util/num.js';
import { readReward } from '../quest/QuestReward.js';

/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../types/log.js').LogEntry} LogEntry */
/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */

/**
 * The value, only when it is a plain record, else null. Every
 * non-collection field of a save is a plain record, and the load path
 * reads their members directly.
 * @param {unknown} value
 * @returns {any}
 */
export function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * A save collection as a list of records. Anything that is not an array
 * reads as empty, and the function removes entries that are not records.
 * Every collection in a save is a list of entities whose `withDefaults` the
 * load path maps over, so a scalar or null element is unreadable, not
 * merely odd. If left in place, it throws an error during startup, with
 * the malformed save already stored.
 * @param {unknown} value
 * @returns {any[]}
 */
export function records(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => record(entry) !== null);
}

/**
 * A finite number, else the fallback value. This guards the counters that a
 * malformed save can carry as a string or null.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
export function number(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * A string, else the fallback value.
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function string(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

/**
 * A non-empty string id, else null. Every keyed collection matches its
 * entries by id, so an entry with no usable id names nothing and is dropped
 * by the caller.
 * @param {unknown} value
 * @returns {string | null}
 */
function id(value) {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * A running combat, or null when the stored value cannot be one. The
 * initiative panel walks `order` and indexes into it, so a combat missing
 * that array is worse than no combat at all.
 * @param {unknown} value
 * @returns {import('../types/combat.js').CombatState | null}
 */
export function combatState(value) {
  const combat = record(value);
  if (!combat) return null;
  return {
    round: number(combat.round, 1),
    index: number(combat.index, 0),
    // A save from before the fight-scoped log carries no start time. The
    // fallback of 0 keeps that fight's log column showing every combat
    // entry, as it did before the log existed.
    startedAt: number(combat.startedAt, 0),
    // The code reads a participant down to the fields the order owns. A save
    // written before the name and side became derived also carries them here.
    // Removing them is the whole migration, because both values are now
    // resolved from the entity that holds the id. An entry with no id names
    // nobody, so the code removes it.
    order: records(combat.order).flatMap((entry) =>
      id(entry.id) !== null
        ? [
            {
              id: entry.id,
              initiative: number(entry.initiative, 10),
              modifier: number(entry.modifier, 0),
              // A save from before the action budget carries nothing here, and
              // `budgetOf` reads that as a turn with everything unspent.
              used: budgetOf(entry.used),
              ...(entry.surprised === true ? { surprised: true } : {}),
            },
          ]
        : [],
    ),
  };
}

/**
 * The party's position, or null when the stored value cannot be one. The
 * function reads both fields as tile and node ids without a type check.
 * @param {unknown} value
 * @returns {PartyPosition | null}
 */
export function partyPosition(value) {
  const party = record(value);
  if (!party || typeof party.nodeId !== 'string' || typeof party.tileId !== 'string') return null;
  return { nodeId: party.nodeId, tileId: party.tileId };
}

/**
 * The game clock, or null when the save has none. A day below 1 reads as 1,
 * and a watch outside the day's watches reads as Dawn. Both coerce to whole
 * numbers, because a string watch such as "5" makes `advanceWatches` join
 * strings (Day 1 plus one watch gives Day 9) and a missing day shows "Day
 * undefined".
 * @param {unknown} value
 * @returns {import('../types/time.js').GameClock | null}
 */
export function gameClock(value) {
  const clock = record(value);
  if (!clock) return null;
  const watch = clampInt(clock.watch, 0, Infinity, 0);
  const minutes = clampInt(clock.minutes, 0, MINUTES_PER_WATCH - 1, 0);
  const coerced = { day: clampInt(clock.day, 1), watch: watch < WATCHES.length ? watch : 0 };
  return minutes > 0 ? { ...coerced, minutes } : coerced;
}

/**
 * The parent tile each traveler entered each child node through: a map of
 * traveler key to a map of node id to tile id. A traveler whose value is not
 * a record, a tile id that is not a string, and a traveler left with no
 * entries are all dropped. See `map/EntryMemory.js`.
 *
 * A `__proto__` key is skipped. Assigning that key sets a prototype instead
 * of storing a value, and a save can carry it as an own key.
 * @param {unknown} value
 * @returns {Record<string, Record<string, string>>}
 */
export function entryTiles(value) {
  const stored = record(value);
  if (!stored) return {};
  /** @type {Record<string, Record<string, string>>} */
  const memory = {};
  for (const [traveler, entries] of Object.entries(stored)) {
    const held = record(entries);
    if (!held || traveler === '__proto__') continue;
    /** @type {Record<string, string>} */
    const kept = {};
    for (const [nodeId, tileId] of Object.entries(held)) {
      if (typeof tileId === 'string' && nodeId !== '__proto__') kept[nodeId] = tileId;
    }
    if (Object.keys(kept).length) memory[traveler] = kept;
  }
  return memory;
}

/**
 * The in-game stamp of a loaded entry. A clock with a day below 1 or a
 * watch that names no watch is dropped, and so is a
 * round below 1, so the row falls back to the wall-clock time.
 * @param {Record<string, any>} entry
 * @returns {{ clock?: { day: number, watch: number }, round?: number }}
 */
function logStamp(entry) {
  const c = entry.clock;
  const okClock =
    c &&
    Number.isInteger(c.day) &&
    c.day >= 1 &&
    Number.isInteger(c.watch) &&
    c.watch >= 0 &&
    c.watch < WATCHES.length;
  const okRound = Number.isInteger(entry.round) && entry.round >= 1;
  return {
    ...(okClock ? { clock: { day: c.day, watch: c.watch } } : {}),
    ...(okRound ? { round: entry.round } : {}),
  };
}

/** The entry kinds the travelogue styles. Any other value reads as a note. */
const LOG_KINDS = new Set(['travel', 'combat', 'note', 'rest', 'roll']);

/**
 * The travelogue as entries the panel can format. The timestamp becomes a
 * finite number or 0, because `toISOString` throws on a date it cannot
 * read. An entry with no id is dropped, since the panel's append-only
 * rendering finds its place in the list by id. Any truthy `gm` flag keeps
 * the entry GM-only, so a flag written as a string still hides the line from
 * a Player tab. Only a GM-only entry keeps a player line.
 * @param {unknown} value
 * @returns {LogEntry[]}
 */
export function logEntries(value) {
  return records(value).flatMap((entry) => {
    const entryId = id(entry.id);
    if (entryId === null) return [];
    const kind = LOG_KINDS.has(entry.kind) ? entry.kind : 'note';
    const base = {
      id: entryId,
      at: number(entry.at, 0),
      kind,
      message: string(entry.message, ''),
      ...logStamp(entry),
    };
    if (!entry.gm) return [base];
    const player = string(entry.player, '');
    return [{ ...base, gm: true, ...(player ? { player } : {}) }];
  });
}

/**
 * The quest log as quests the panel can render. A status other than
 * completed reads as active, a title or notes of the wrong type read as
 * empty text, and a quest reads as hidden from players unless its
 * `revealed` flag is exactly true. A save with no objectives or links
 * reads as empty lists, and so does a save with no unlock list. A reward that pays nothing is
 * dropped (see `readReward`).
 * @param {unknown} value
 * @returns {Quest[]}
 */
export function quests(value) {
  return records(value).flatMap((quest) => {
    const questId = id(quest.id);
    if (questId === null) return [];
    const { reward: saved, ...rest } = quest;
    const reward = readReward(saved);
    return [
      {
        ...rest,
        id: questId,
        title: string(quest.title, ''),
        notes: string(quest.notes, ''),
        status: quest.status === 'completed' ? 'completed' : 'active',
        revealed: quest.revealed === true,
        objectives: questObjectives(quest.objectives),
        links: questLinks(quest.links),
        unlocks: questUnlocks(quest.unlocks),
        ...(reward ? { reward } : {}),
      },
    ];
  });
}

/**
 * A quest's unlock list: the string ids, without blanks or repeats. A save
 * with no list reads as an empty one.
 * @param {unknown} value
 * @returns {string[]}
 */
function questUnlocks(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v) => typeof v === 'string' && v !== ''))];
}

/**
 * A quest's objectives. An objective reads as visible to players unless its
 * `hidden` flag is exactly true, and as not done unless `done` is exactly
 * true. The panel keys each row and each edit by id, so an objective with
 * no id, or with an id that an earlier objective uses, gets a fresh one.
 * @param {unknown} value
 * @returns {import('../types/quest.js').QuestObjective[]}
 */
function questObjectives(value) {
  const taken = new Set();
  const list = records(value);
  let fresh = list.length;
  return list.map((objective) => {
    let objectiveId = id(objective.id);
    while (objectiveId === null || taken.has(objectiveId)) objectiveId = `o${(fresh += 1)}`;
    taken.add(objectiveId);
    return {
      id: objectiveId,
      text: string(objective.text, ''),
      done: objective.done === true,
      hidden: objective.hidden === true,
    };
  });
}

/**
 * A quest's links. A place link keeps its tile only when the tile is a
 * string, and a link with no target id, or of an unknown kind, is dropped.
 * @param {unknown} value
 * @returns {import('../types/quest.js').QuestLink[]}
 */
function questLinks(value) {
  /** @type {import('../types/quest.js').QuestLink[]} */
  const links = [];
  for (const link of records(value)) {
    if (link.kind === 'place' && id(link.nodeId) !== null) {
      links.push({ kind: 'place', nodeId: link.nodeId, tileId: id(link.tileId) });
    } else if (link.kind === 'creature' && id(link.creatureId) !== null) {
      links.push({ kind: 'creature', creatureId: link.creatureId });
    }
  }
  return links;
}

/**
 * A stored gear slot as the spawn path reads it: a record, an explicit
 * null, or absent. A value of any other type is dropped, so the template
 * takes the level default when it is spawned.
 * @param {Record<string, any>} template
 * @param {'weapon' | 'armor'} slot
 * @returns {Record<string, any>}
 */
function gearSlot(template, slot) {
  const value = template[slot];
  return value === null || record(value) !== null ? { [slot]: value } : {};
}

/**
 * The bestiary as templates the spawn dialog can list and spawn from. The
 * dialog prints the name and hit points of each entry, and `fromTemplate`
 * spreads the stat block and copies the gear, so those fields are the ones
 * checked here.
 * @param {unknown} value
 * @returns {CreatureTemplate[]}
 */
export function creatureTemplates(value) {
  return records(value).flatMap((template) => {
    const templateId = id(template.id);
    if (templateId === null) return [];
    const { weapon: _weapon, armor: _armor, ...rest } = template;
    return [
      {
        ...rest,
        id: templateId,
        name: string(template.name, 'Creature'),
        maxHP: number(template.maxHP, 1),
        stats: record(template.stats) ?? {},
        ...gearSlot(template, 'weapon'),
        ...gearSlot(template, 'armor'),
      },
    ];
  });
}
