import { TileGrid, withNodeDefaults } from '../map/TileGrid.js';
import { downloadJSON, readFileText } from './fileIO.js';
import { CURRENT_VERSION, migrateState, stateVersion } from './Migrations.js';
import { hoistAssets, restoreAssets } from './Assets.js';
import { detachAssets, loadAssetTable, persistAssets } from './AssetStore.js';
import { packEntities } from './EntityPack.js';
import { encodeNodeTiles, decodeNodeTiles } from './TileCodec.js';
import { withDefaults as withCharacterDefaults } from '../entities/Character.js';
import { withDefaults as withCreatureDefaults } from '../entities/Creature.js';
import { withDefaults as withHandoutDefaults } from '../handout/Handouts.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */

const DEFAULT_STORAGE_KEY = 'campaign-builder:save';

/** The localStorage key the campaign save lives under. Cross-tab sync uses this key. */
export const STORAGE_KEY = DEFAULT_STORAGE_KEY;

/**
 * Collect the whole campaign (tile hierarchy, party position, characters,
 * encounters, and everything else at the top level) into one plain,
 * JSON-serializable object.
 *
 * Every field is named once, here. A caller that omits a field gets the
 * same empty value that a save written before the field existed reads as.
 * This is why the argument is a single object, not a positional list. A
 * caller cannot silently drop a field by not knowing to pass it. An earlier
 * signature lost `splitParty` and `combat` on the campaign-replace path for
 * this reason.
 * @param {import('../types/storage.js').CampaignSource} campaign
 * @returns {CampaignState}
 */
export function buildState(campaign) {
  const {
    grid,
    party = null,
    characters = [],
    creatures = [],
    travelog = [],
    quests = [],
    clock = null,
    handouts = [],
    bestiary = [],
    splitParty = false,
    combat = null,
  } = campaign;
  return {
    nodes: [...grid.nodes.values()],
    party,
    characters,
    creatures,
    travelog,
    quests,
    clock,
    handouts,
    bestiary,
    splitParty,
    combat,
    // This function writes the save, so the version it stamps is the format
    // it produces, whatever version a caller's source object still claims.
    version: CURRENT_VERSION,
  };
}

/**
 * A tile with every default-valued field omitted. Default tile boilerplate
 * (`overlayRef: null`, `revealed: false`, `childNodeId: null`, `span: 1`,
 * and an all-default `metadata` block) makes up the bulk of a serialized
 * campaign. It is 62 percent of the example campaign's characters, whose
 * tiles are almost all plain unpainted terrain, and the undo ring multiplies
 * whatever the save costs.
 *
 * The inverse function is `withTileDefaults` (`map/TileGrid.js`), which
 * every load path already runs. It fills exactly these fields from absence,
 * so packing needs no second statement of what a default value is. The code
 * removes fields from a copy instead of picking fields into a fresh object,
 * so a field this function does not know about survives the round trip
 * instead of disappearing without warning.
 *
 * A packed tile exists only inside the serialized string. Nothing in memory
 * ever holds one, because the renderer reads `tile.metadata` without a
 * presence check.
 * @param {import('../types/map.js').Tile} tile
 * @returns {Record<string, any>}
 */
function packTile(tile) {
  /** @type {Record<string, any>} */
  const packed = { ...tile };
  if (packed.overlayRef == null) delete packed.overlayRef;
  if (packed.revealed !== true) delete packed.revealed;
  if (packed.childNodeId == null) delete packed.childNodeId;
  // An absent span and a span of 1 mean the same one-cell image, per `Tile`.
  if (!(typeof packed.span === 'number' && packed.span > 1)) delete packed.span;
  const source = record(tile.metadata);
  if (!source) {
    delete packed.metadata;
    return packed;
  }
  /** @type {Record<string, any>} */
  const metadata = { ...source };
  if (metadata.poiType == null) delete metadata.poiType;
  if (metadata.discoverable !== true) delete metadata.discoverable;
  if (metadata.discovered !== true) delete metadata.discovered;
  if (!metadata.notes) delete metadata.notes;
  if (Object.keys(metadata).length) packed.metadata = metadata;
  else delete packed.metadata;
  return packed;
}

/**
 * The save collections whose entries have an entity `withDefaults`, paired
 * with that function. The code reads this table in both directions.
 * `packState` omits whatever the paired function restores, and
 * `deserialize` runs that same function, so the two halves cannot name
 * different functions. `quests` and `bestiary` are absent on purpose.
 * Neither has a `withDefaults`, so there is no authority to pack against,
 * and both measured at zero default-valued bytes anyway.
 * @type {Record<string, (entity: any) => any>}
 */
const ENTITY_DEFAULTS = {
  characters: withCharacterDefaults,
  creatures: withCreatureDefaults,
  handouts: withHandoutDefaults,
};

/**
 * The campaign in its on-disk shape: the state, with every node's tiles
 * packed, every entity's default-valued fields omitted, every inline image
 * payload hoisted into an `assets` table, and every node whose tiles fill a
 * grid encoded by position. The function is pure. It never touches the
 * state passed in.
 *
 * The tile codec runs last, after the asset hoist. This order keeps
 * `Assets.js` unaware of the codec. The hoist walks `node.tiles[].imageRef`,
 * a field an encoded node no longer has. Running the codec afterward means
 * its palette holds already-hoisted `asset:` references, not the payloads
 * themselves.
 * @param {CampaignState} state
 * @returns {Record<string, any>}
 */
function packState(state) {
  /** @type {Record<string, any>} */
  const packed = {
    ...state,
    nodes: state.nodes.map((node) => ({ ...node, tiles: node.tiles.map(packTile) })),
  };
  for (const [key, withDefaults] of Object.entries(ENTITY_DEFAULTS)) {
    const list = packed[key];
    if (Array.isArray(list)) packed[key] = packEntities(list, withDefaults);
  }
  const hoisted = hoistAssets(packed);
  const nodes = hoisted.nodes;
  if (Array.isArray(nodes)) hoisted.nodes = nodes.map(encodeNodeTiles);
  return hoisted;
}

/**
 * @param {CampaignState} state
 * @returns {string}
 */
export function serialize(state) {
  return JSON.stringify(packState(state));
}

/**
 * The value, only when it is a plain record, else null. Every
 * non-collection field of a save is a plain record, and the load path
 * reads their members directly.
 * @param {unknown} value
 * @returns {any}
 */
function record(value) {
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
function records(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => record(entry) !== null);
}

/**
 * A save collection read back as fully-defaulted entities: the coercion
 * above, then the paired `withDefaults`. This is the unpack half of
 * `packState`'s omission, so it must run here on load, not only in the
 * startup path. A stored character can legitimately carry no `spellbook`
 * key now, and `undoHistory` and `readStateFromFile` pass their result to
 * callers that apply no defaulting of their own.
 * @param {string} key a key of ENTITY_DEFAULTS
 * @param {unknown} value
 * @returns {any[]}
 */
function entities(key, value) {
  const withDefaults = ENTITY_DEFAULTS[key];
  return records(value).map((entry) => withDefaults(entry));
}

/**
 * A finite number, else the fallback value. This guards the counters that a
 * malformed save can carry as a string or null.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function number(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * A running combat, or null when the stored value cannot be one. The
 * initiative panel walks `order` and indexes into it, so a combat missing
 * that array is worse than no combat at all.
 * @param {unknown} value
 * @returns {import('../types/combat.js').CombatState | null}
 */
function combatState(value) {
  const combat = record(value);
  if (!combat) return null;
  return {
    round: number(combat.round, 1),
    index: number(combat.index, 0),
    // A save from before the fight-scoped log carries no start time. The
    // fallback of 0 keeps that fight's log column showing every combat
    // entry, as it did before the log existed.
    startedAt: number(combat.startedAt, 0),
    // The code reads a participant down to the three fields the order owns.
    // A save written before the name and side became derived also carries
    // them here. Removing them is the whole migration, because both values
    // are now resolved from the entity that holds the id. An entry with no
    // id names nobody, so the code removes it.
    order: records(combat.order).flatMap((entry) =>
      typeof entry.id === 'string' && entry.id !== ''
        ? [
            {
              id: entry.id,
              initiative: number(entry.initiative, 10),
              modifier: number(entry.modifier, 0),
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
function partyPosition(value) {
  const party = record(value);
  if (!party || typeof party.nodeId !== 'string' || typeof party.tileId !== 'string') return null;
  return { nodeId: party.nodeId, tileId: party.tileId };
}

/**
 * Parse a serialized campaign. The function defaults any missing field to
 * an empty value instead of throwing an error, so an older or hand-edited
 * save still loads. It coerces every field whose shape the load path
 * trusts, so a malformed field cannot pass through. This is the only
 * validation a save goes through. Import stores what it reads and then
 * reloads it, so an unreadable field that survives this function becomes
 * the stored save of an app that no longer starts. The function removes
 * nodes with no id. `withNodeDefaults` (TileGrid) defends the tiles inside
 * a node, and it also unpacks the tile fields `serialize` omits, so it runs
 * here, not only in `toTileGrid`. The entity `withDefaults` functions play
 * the same role one level up: they unpack the fields `packState` omitted,
 * so every state this function returns is fully defaulted, whether or not
 * its caller reloads through the startup path. `restoreAssets` puts the
 * hoisted image payloads back before any of this runs, so nothing
 * downstream ever sees a reference into the asset table. A save stamped
 * with an older schema version passes through the `Migrations.js` step
 * chain first. A save stamped newer than this app is read on a
 * best-effort basis.
 *
 * `assets` supplies payloads the string does not carry. This is how the
 * localStorage form is read: `AssetStore.js` keeps the table under its own
 * key, so only the two readers of a stored string pass this argument. A
 * table inside the string wins over it, so an exported file, which is
 * always self-contained, is unaffected.
 * @param {string} json
 * @param {Record<string, string>} [assets]
 * @returns {CampaignState}
 */
export function deserialize(json, assets) {
  const raw = record(JSON.parse(json)) ?? {};
  // Migrations run on the raw object, before the coercion below. A step can
  // repair a shape this validator otherwise flattens or removes. The
  // validator stays last, so a step that returns something other than a
  // record reads as an empty campaign, instead of corrupting the load.
  // Migrations run before the asset restore, so a step that reads a
  // hoisted ref must look the payload up in the table itself. This is the
  // cheaper order: no step so far reads image payloads, and restoring
  // first makes every step pay the cost of inlining them.
  const migrated = record(migrateState(raw, stateVersion(raw))) ?? {};
  // Decoding the positional tile form comes before the asset restore, to
  // mirror `packState`'s encode-last order. The restore walks
  // `node.tiles[].imageRef`, a field an encoded node does not have. Without
  // this order, a palette reference never resolves. It also leaves a
  // decoded tile still packed, so `withNodeDefaults` below stays the one
  // place that states what a tile default is. A node stored in the
  // unencoded form passes through the decoder unchanged.
  const decoded = { ...migrated };
  if (Array.isArray(decoded.nodes)) decoded.nodes = decoded.nodes.map(decodeNodeTiles);
  if (assets && Object.keys(assets).length) {
    // The sidecar table is a fallback under whatever the string itself
    // carries, so a save holding its own table resolves from that table alone.
    decoded.assets = { ...assets, ...(record(decoded.assets) ?? {}) };
  }
  const parsed = restoreAssets(decoded);
  return {
    version: CURRENT_VERSION,
    nodes: records(parsed.nodes)
      .filter((node) => typeof node.id === 'string')
      .map(withNodeDefaults),
    party: partyPosition(parsed.party),
    characters: entities('characters', parsed.characters),
    creatures: entities('creatures', parsed.creatures),
    travelog: records(parsed.travelog),
    quests: records(parsed.quests),
    clock: record(parsed.clock),
    handouts: entities('handouts', parsed.handouts),
    bestiary: records(parsed.bestiary),
    splitParty: parsed.splitParty === true,
    combat: combatState(parsed.combat),
  };
}

/**
 * Rebuild a TileGrid from a CampaignState's flat node list.
 * @param {CampaignState} state
 * @returns {TileGrid}
 */
export function toTileGrid(state) {
  const grid = new TileGrid();
  // Fill in kind and environ, so nodes from saves before interiors existed load cleanly.
  for (const node of state.nodes) grid.addNode(withNodeDefaults(node));
  return grid;
}

/**
 * Warn when stored data approaches the localStorage origin quota of about 5
 * MB. This leaves headroom for the history log and the image sidecar,
 * which share the same quota. localStorage stores UTF-16 code units, so the
 * byte cost of a string is twice its length.
 */
export const QUOTA_WARN_BYTES = 3 * 1024 * 1024;

/**
 * The approximate localStorage byte cost of a serialized save (UTF-16 uses
 * two bytes per code unit). The function is pure.
 * @param {string} json
 * @returns {number}
 */
export function saveByteSize(json) {
  return json.length * 2;
}

/**
 * True when storage use of this size is close enough to the origin quota to
 * warn the GM before writes start to fail. The function is pure.
 * @param {number} bytes
 * @param {number} [limit]
 * @returns {boolean}
 */
export function isNearQuota(bytes, limit = QUOTA_WARN_BYTES) {
  return bytes >= limit;
}

/**
 * The byte cost of a set of stored key and value pairs, keys included.
 * localStorage charges for both, in UTF-16 code units. The function is
 * pure, so a unit test can check the quota arithmetic without a storage
 * stub.
 * @param {Iterable<[string, string]>} pairs
 * @returns {number}
 */
export function footprintBytes(pairs) {
  let total = 0;
  for (const [key, value] of pairs) total += (key.length + value.length) * 2;
  return total;
}

/**
 * What this origin currently spends of its localStorage quota: every key,
 * not just the campaign save. The save, the undo ring, the custom library,
 * and the lock and preference flags all share this quota, so one save's
 * size does not show how close a write is to failing.
 * @returns {number}
 */
export function localStorageFootprint() {
  /** @type {[string, string][]} */
  const pairs = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key === null) continue;
    pairs.push([key, localStorage.getItem(key) ?? '']);
  }
  return footprintBytes(pairs);
}

/**
 * Store a campaign, reporting the outcome instead of throwing an error.
 * localStorage writes fail with a QuotaExceededError once data: URL images
 * push the origin past its quota, and a silent failure lets the GM believe
 * the campaign saved. `nearQuota` flags a write that succeeded but
 * leaves the origin close to the limit. It is judged on the whole
 * footprint, not on `bytes`, because the undo ring alone costs several
 * times what one save does. The function measures the footprint after the
 * write, which gives an exact number. A measurement before the write cannot
 * know the new save's size net of the old one it replaces, and the warning
 * concerns the next write either way.
 *
 * Image payloads go to their own key first, then the campaign, so
 * structure and blobs fail independently. `assetsOk` false leaves the GM a
 * saved map with a missing picture. One blob stored inside the campaign
 * string costs the GM both the map and the picture. Writing the
 * payloads first makes that the only failure shape, because the reverse
 * order can store structure that references nothing. It also settles the
 * cross-tab race: a follower tab wakes on the campaign key, and by then
 * the payloads are already stored. `bytes` measures the payload-free save.
 * Only `footprint` speaks to the quota, and it counts every key.
 *
 * `json` is the string that was written, or that the code attempted to
 * write. `HistoryLog.js` caches the state it just stored against this
 * string, so recording a history step costs a string comparison, not a
 * re-read and re-parse of the save.
 * @param {CampaignState} state
 * @param {string} [key]
 * @returns {{ ok: boolean, assetsOk: boolean, nearQuota: boolean, bytes: number, footprint: number, json: string }}
 */
export function trySaveToLocalStorage(state, key = DEFAULT_STORAGE_KEY) {
  const { state: detached, assets } = detachAssets(packState(state));
  const json = JSON.stringify(detached);
  const bytes = saveByteSize(json);
  const assetsOk = persistAssets(assets, json, [key]);
  try {
    localStorage.setItem(key, json);
  } catch {
    return {
      ok: false,
      assetsOk,
      nearQuota: true,
      bytes,
      footprint: localStorageFootprint(),
      json,
    };
  }
  const footprint = localStorageFootprint();
  return { ok: true, assetsOk, nearQuota: isNearQuota(footprint), bytes, footprint, json };
}

/**
 * @param {string} [key]
 * @returns {CampaignState | null}
 */
export function loadFromLocalStorage(key = DEFAULT_STORAGE_KEY) {
  const json = localStorage.getItem(key);
  return json ? deserialize(json, loadAssetTable()) : null;
}

/**
 * Start a browser download of the campaign as a .json file.
 * @param {CampaignState} state
 * @param {string} [filename]
 */
export function downloadState(state, filename = 'campaign.json') {
  downloadJSON(serialize(state), filename);
}

/**
 * True when a `storage` event represents another tab writing a new
 * campaign save, as opposed to a history-key write, a clear, or a no-op.
 * The browser fires `storage` only in tabs other than the one that made
 * the change, so a driving tab never sees its own saves. This is what a
 * follower tab watches for. The function is pure.
 * @param {StorageEvent} event
 * @param {string} [key]
 * @returns {boolean}
 */
export function isExternalSaveEvent(event, key = DEFAULT_STORAGE_KEY) {
  return event.key === key && event.newValue != null && event.newValue !== event.oldValue;
}

/**
 * Subscribe to campaign saves made in other tabs of the same origin. This
 * is the simplest multi-device setup this app supports: the GM tab drives,
 * and follower tabs react. There is no server and no dependency, only the
 * `storage` event. The function returns an unsubscribe function.
 * @param {() => void} callback run when another tab writes a new save
 * @param {string} [key]
 * @returns {() => void}
 */
export function onExternalSave(callback, key = DEFAULT_STORAGE_KEY) {
  const handler = (/** @type {StorageEvent} */ event) => {
    if (isExternalSaveEvent(event, key)) callback();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/**
 * Read a campaign from a File. The File can come, for example, from a file
 * input's change event.
 * @param {File} file
 * @returns {Promise<CampaignState>}
 */
export function readStateFromFile(file) {
  return readFileText(file).then(deserialize);
}
