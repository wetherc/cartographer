/**
 * A save-wide table for gear that repeats across records. Every creature
 * spawned from a template copies the template's weapon and armor, and every
 * character copies the library items it carries. Ten goblins store the same
 * Shortsword ten times, about 240 characters each. `tabulateGear` stores
 * each repeated piece once in a `gear` list at the top of the save, and each
 * record names its entry as `{"@": index}`. `restoreGear` reverses this
 * step. The code is pure.
 *
 * The table exists only in the stored string. `restoreGear` runs first in
 * `deserialize`, before the migrations, so no other load step sees a
 * reference. The undo log diffs parsed state, so its ops hold gear inline.
 *
 * An inventory item also has fields that belong to the one copy a character
 * carries: `quantity` and `notes`. The table entry keeps those keys with a
 * null value, and the reference fills them: `{"@": 2, "quantity": 5,
 * "notes": ""}`. The restore spreads the entry first and the reference
 * second, so the restored item has its keys in the stored order. A save
 * string that goes through a load and a save again comes out unchanged.
 *
 * Only a piece used twice or more goes into the table. A reference to a
 * piece used once costs more than the piece inline. The table lists pieces
 * in the order the walk first meets them, so the same state always packs to
 * the same string.
 */

import { record } from './RecordCoercion.js';

/** @typedef {import('../types/storage.js').RawSave} RawSave */

/** The key of a reference into the table. No gear record has this field. */
const REF = '@';

/**
 * One place a save keeps gear: a field of each record in a collection. A
 * `list` field keeps an array of gear pieces. `instance` names the fields
 * that belong to one copy and stay in the reference.
 * @typedef {{ collection: string, field: string, list?: boolean, instance: string[] }} GearSite
 */

/** @type {GearSite[]} */
const SITES = [
  { collection: 'creatures', field: 'weapon', instance: [] },
  { collection: 'creatures', field: 'armor', instance: [] },
  { collection: 'bestiary', field: 'weapon', instance: [] },
  { collection: 'bestiary', field: 'armor', instance: [] },
  { collection: 'characters', field: 'inventory', list: true, instance: ['quantity', 'notes'] },
];

/** The collections that have a gear site, each listed once. */
const COLLECTIONS = [...new Set(SITES.map((site) => site.collection))];

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isRecord(value) {
  return record(value) !== null;
}

/**
 * The table entry of one piece, and its JSON text as the dedup key. A piece
 * is an immutable value, and the entity pack cache hands the same packed
 * piece to every save until it changes, so the key is cached on the piece.
 * @typedef {{ entry: Record<string, unknown>, key: string }} Template
 */

/** One cache per site, because two sites can split one piece differently. */
const templates = new Map(SITES.map((site) => [site, new WeakMap()]));

/**
 * @param {GearSite} site
 * @param {Record<string, unknown>} piece
 * @returns {Template}
 */
function templateOf(site, piece) {
  const cache = /** @type {WeakMap<object, Template>} */ (templates.get(site));
  const cached = cache.get(piece);
  if (cached) return cached;
  const entry = { ...piece };
  for (const key of site.instance) if (key in entry) entry[key] = null;
  const template = { entry, key: JSON.stringify(entry) };
  cache.set(piece, template);
  return template;
}

/**
 * The gear pieces of one record at one site.
 * @param {GearSite} site
 * @param {Record<string, unknown>} owner
 * @returns {Record<string, unknown>[]}
 */
function piecesAt(site, owner) {
  const value = owner[site.field];
  const list = site.list ? (Array.isArray(value) ? value : []) : [value];
  return list.filter(isRecord);
}

/**
 * Map every gear piece of a save's records through `convert`. A record whose
 * pieces all come back unchanged stays the same object, and so does a
 * collection with no changed record.
 * @param {RawSave} save
 * @param {(site: GearSite, piece: any) => any} convert
 * @returns {RawSave}
 */
function mapGear(save, convert) {
  const next = { ...save };
  for (const collection of COLLECTIONS) {
    const list = save[collection];
    if (!Array.isArray(list)) continue;
    const sites = SITES.filter((site) => site.collection === collection);
    next[collection] = list.map((owner) => {
      if (!isRecord(owner)) return owner;
      let changed = owner;
      for (const site of sites) {
        const value = owner[site.field];
        const mapped = site.list
          ? Array.isArray(value)
            ? mapList(value, (piece) => convert(site, piece))
            : value
          : isRecord(value)
            ? convert(site, value)
            : value;
        if (mapped !== value) changed = { ...changed, [site.field]: mapped };
      }
      return changed;
    });
  }
  return next;
}

/**
 * The list with each record mapped, or the same list when nothing changed.
 * @param {unknown[]} list
 * @param {(piece: Record<string, unknown>) => unknown} convert
 * @returns {unknown[]}
 */
function mapList(list, convert) {
  const mapped = list.map((piece) => (isRecord(piece) ? convert(piece) : piece));
  return mapped.some((piece, i) => piece !== list[i]) ? mapped : list;
}

/**
 * The save with each repeated gear piece moved into a `gear` table. A save
 * with no repeated piece comes back with no `gear` field.
 * @param {RawSave} save a packed save, before the asset hoist
 * @returns {RawSave}
 */
export function tabulateGear(save) {
  /** @type {Map<string, number>} */
  const uses = new Map();
  for (const site of SITES) {
    const list = save[site.collection];
    if (!Array.isArray(list)) continue;
    for (const owner of list) {
      if (!isRecord(owner)) continue;
      for (const piece of piecesAt(site, owner)) {
        const { key } = templateOf(site, piece);
        uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }
  }
  /** @type {Map<string, number>} */
  const index = new Map();
  /** @type {Record<string, unknown>[]} */
  const table = [];
  const next = mapGear(save, (site, piece) => {
    const { entry, key } = templateOf(site, piece);
    if (/** @type {number} */ (uses.get(key)) < 2) return piece;
    let at = index.get(key);
    if (at === undefined) {
      at = table.length;
      index.set(key, at);
      table.push(entry);
    }
    /** @type {Record<string, unknown>} */
    const ref = { [REF]: at };
    for (const field of site.instance) if (field in piece) ref[field] = piece[field];
    return ref;
  });
  if (table.length === 0) return save;
  next.gear = table;
  return next;
}

/**
 * The inverse of `tabulateGear`: every reference replaced by a copy of its
 * table entry with the reference's own fields on top, and the table removed.
 * A save with no `gear` list comes back unchanged. A reference that names no
 * entry stays as it is, and the entity coercion downstream reads it as a
 * record with unknown fields.
 * @param {RawSave} save
 * @returns {RawSave}
 */
export function restoreGear(save) {
  const table = save.gear;
  if (!Array.isArray(table)) return save;
  const next = mapGear(save, (_site, piece) => {
    const entry = table[piece[REF]];
    if (!Number.isInteger(piece[REF]) || !isRecord(entry)) return piece;
    const { [REF]: _at, ...own } = piece;
    return { ...structuredClone(entry), ...own };
  });
  delete next.gear;
  return next;
}
