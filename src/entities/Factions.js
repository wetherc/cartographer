import { isRecord } from '../util/isRecord.js';
import { slugify } from '../util/text.js';

/** @typedef {import('../types/creature.js').Faction} Faction */
/** @typedef {import('../types/creature.js').Creature} Creature */

/** The filter value that lists NPCs who belong to no faction. */
export const NO_FACTION = 'none';

/** The longest faction name a save keeps. */
const MAX_NAME_LENGTH = 60;

/**
 * The faction list of a save. An entry with no string id or no name is
 * dropped, and a repeated id keeps its first entry.
 * @param {unknown} value
 * @returns {Faction[]}
 */
export function coerceFactions(value) {
  if (!Array.isArray(value)) return [];
  /** @type {Map<string, Faction>} */
  const byId = new Map();
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id) continue;
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    if (name && !byId.has(entry.id)) byId.set(entry.id, { id: entry.id, name });
  }
  return [...byId.values()];
}

/**
 * The name of a faction, or an empty string for no id or an id that names
 * no faction (a faction the GM removed).
 * @param {readonly Faction[]} factions
 * @param {string | undefined} id
 * @returns {string}
 */
export function factionName(factions, id) {
  return (id && factions.find((f) => f.id === id)?.name) || '';
}

/**
 * The faction list after an edit: each listed id takes its new name, a blank
 * name removes the faction, and a non-blank `added` name joins the end with
 * a fresh id. A rename keeps the id, so every member stays in the faction.
 * @param {readonly Faction[]} factions
 * @param {Record<string, string>} names new name by faction id
 * @param {string} [added]
 * @returns {Faction[]}
 */
export function editFactions(factions, names, added = '') {
  const kept = coerceFactions(factions.map((f) => ({ id: f.id, name: names[f.id] ?? f.name })));
  const name = added.trim();
  if (!name) return kept;
  const ids = new Set(factions.map((f) => f.id));
  const base = `faction-${slugify(name) || 'new'}`;
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  return coerceFactions([...kept, { id, name }]);
}

/**
 * The creatures of one faction. An empty filter keeps every creature, and
 * `NO_FACTION` keeps the creatures with no faction that still exists.
 * @param {readonly Creature[]} creatures
 * @param {readonly Faction[]} factions
 * @param {string} filter a faction id, `NO_FACTION`, or ''
 * @returns {Creature[]}
 */
export function byFaction(creatures, factions, filter) {
  if (!filter) return [...creatures];
  if (filter === NO_FACTION) return creatures.filter((c) => !factionName(factions, c.factionId));
  return creatures.filter((c) => c.factionId === filter);
}

/**
 * The creature with its faction set, or with no `factionId` key when `id`
 * is empty.
 * @param {Creature} creature
 * @param {string} id
 * @returns {Creature}
 */
export function withFaction(creature, id) {
  const { factionId: _old, ...rest } = creature;
  return id ? { ...rest, factionId: id } : rest;
}

/**
 * A stored `factionId` as a field to spread: a non-empty string keeps it,
 * and anything else drops it.
 * @param {unknown} value
 * @returns {{ factionId?: string }}
 */
export function factionIdField(value) {
  return typeof value === 'string' && value ? { factionId: value } : {};
}

/**
 * The faction select of the creature form, or no field when the campaign
 * has no factions. An id that names no faction selects None.
 * @param {readonly Faction[]} factions
 * @param {string | undefined} value the faction id of the creature
 * @returns {import('../types/modal.js').SelectModalField[]}
 */
export function factionField(factions, value) {
  if (factions.length === 0) return [];
  return [
    {
      name: 'faction',
      label: 'Faction (GM only)',
      type: 'select',
      value: factionName(factions, value) ? value : '',
      options: [{ value: '', label: 'None' }, ...factionOptions(factions)],
    },
  ];
}

/**
 * The choices of the NPC faction filter: every faction, then the NPCs with
 * none, after an "All factions" choice.
 * @param {readonly Faction[]} factions
 * @returns {{ value: string, label: string }[]}
 */
export function factionFilterOptions(factions) {
  return [
    { value: '', label: 'All factions' },
    ...factionOptions(factions),
    { value: NO_FACTION, label: 'No faction' },
  ];
}

/**
 * @param {readonly Faction[]} factions
 * @returns {{ value: string, label: string }[]}
 */
function factionOptions(factions) {
  return factions.map((f) => ({ value: f.id, label: f.name }));
}

/**
 * The filter value to apply: the stored one while it names a faction or no
 * faction, and every faction once the named faction is gone.
 * @param {readonly Faction[]} factions
 * @param {string} filter
 * @returns {string}
 */
export function liveFilter(factions, filter) {
  return filter === NO_FACTION || factionName(factions, filter) ? filter : '';
}
