import {
  TileGrid,
  withNodeDefaults,
  withRepairedLinks,
  withRepairedParents,
} from '../map/TileGrid.js';
import { downloadJSON, readFileText } from './fileIO.js';
import { CURRENT_VERSION, migrateState, stateVersion } from './Migrations.js';
import { hoistAssets, nodeHoldsPayload, restoreAssets } from './Assets.js';
import { detachAssets, persistAssets, storeAssets } from './AssetStore.js';
import { mirrorActive, pruneMirror, stageAssets, storedAssetTable } from './AssetMirror.js';
import { createEntityPacker } from './EntityPack.js';
import { restoreGear, tabulateGear } from './GearTable.js';
import { restoreStrings, tabulateStrings } from './StringTable.js';
import { noteTruncation } from './ShortenedLoad.js';
import { encodeNodeTiles, decodeNodeList, decodeNodeTiles } from './TileCodec.js';
import { encodedOf, namesImageData, nodeReuser, rememberEncoded } from './EncodedNodes.js';
import { recordExternalWrite, removeStored, storageFootprint, writeStored } from './Footprint.js';
import { createSaveFollower } from './SaveFollower.js';
import { withDefaults as withCharacterDefaults } from '../entities/Character.js';
import { withDefaults as withCreatureDefaults } from '../entities/Creature.js';
import { withDefaults as withHandoutDefaults } from '../handout/Handouts.js';
import {
  combatState,
  creatureTemplates,
  entryTiles as entryTileMemory,
  gameClock,
  logEntries,
  partyPosition,
  quests as questRecords,
  record,
  records,
} from './RecordCoercion.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */
/**
 * The outcome of `trySaveToLocalStorage`. `pending` is present only when
 * the save waits on an image put and wrote nothing.
 * @typedef {{ ok: boolean, assetsOk: boolean, nearQuota: boolean, bytes: number, footprint: number, json: string, pending?: Promise<boolean> }} SaveResult
 */

const DEFAULT_STORAGE_KEY = 'campaign-builder:save';

/** The localStorage key the campaign save lives under. Cross-tab sync uses this key. */
export const STORAGE_KEY = DEFAULT_STORAGE_KEY;

/**
 * The localStorage key that ends every save bundle. `HistoryLog.js` removes
 * it before the campaign write, and writes a fresh value here after the
 * campaign key and the undo history, so a follower tab that acts on this
 * key reads a history that matches the campaign. See `SaveFollower.js`.
 *
 * A tab that knows the mark of the save it holds compares marks instead of
 * whole save strings. A mark that is missing tells it nothing, and it then
 * compares the strings. The removal before the write covers the time
 * between the campaign write and the new mark, when the old mark still
 * names a save that is gone.
 */
export const SAVE_MARK_KEY = 'campaign-builder:save-mark';

/** A per-tab counter, so two marks from one tab in one millisecond differ. */
let markSeq = 0;

/**
 * Write a new save mark, and return it. A failed write removes the old
 * mark and returns null. A follower that sees no mark adopts on its
 * fallback timer. An old mark left in place would tell another tab that
 * nothing moved, and its autosave would write over this save.
 * @returns {string | null}
 */
export function writeSaveMark() {
  const mark = `${Date.now()}:${(markSeq += 1)}:${Math.random().toString(36).slice(2, 8)}`;
  try {
    writeStored(SAVE_MARK_KEY, mark);
    return mark;
  } catch {
    clearSaveMark();
    return null;
  }
}

/** Remove the save mark. `HistoryLog.js` calls this before a campaign write. */
export function clearSaveMark() {
  removeStored(SAVE_MARK_KEY);
}

/**
 * The save mark stored now, or null when none is stored.
 * @returns {string | null}
 */
export function readSaveMark() {
  return localStorage.getItem(SAVE_MARK_KEY);
}

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
    entryTiles = {},
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
    entryTiles,
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
 * copies every field except the default-valued ones, instead of picking the
 * known fields, so a field this function does not know about survives the
 * round trip instead of disappearing without warning.
 *
 * The copy skips fields as it builds and never deletes one. A `delete`
 * moves a V8 object to a hash-table property store, which costs about 224
 * bytes per tile where a plain object with the same fields costs about 20.
 *
 * A packed tile exists only inside the serialized string. Nothing in memory
 * ever holds one, because the renderer reads `tile.metadata` without a
 * presence check.
 * @param {import('../types/map.js').Tile} tile
 * @returns {Record<string, any>}
 */
function packTile(tile) {
  return copyPacked(tile, (key, value) => {
    if (key === 'overlayRef' || key === 'childNodeId') return value == null ? SKIP : value;
    if (key === 'revealed') return value === true ? value : SKIP;
    // An absent span and a span of 1 mean the same one-cell image, per `Tile`.
    if (key === 'span') return typeof value === 'number' && value > 1 ? value : SKIP;
    if (key === 'metadata') return packMetadata(value);
    return value;
  });
}

/**
 * The metadata block of a packed tile, or `SKIP` when it is not a record or
 * every field in it has its default value.
 * @param {unknown} value
 * @returns {unknown}
 */
function packMetadata(value) {
  const source = record(value);
  if (!source) return SKIP;
  const packed = copyPacked(source, (key, field) => {
    if (key === 'poiType') return field == null ? SKIP : field;
    if (key === 'discoverable' || key === 'discovered') return field === true ? field : SKIP;
    if (key === 'notes') return field ? field : SKIP;
    return field;
  });
  return Object.keys(packed).length ? packed : SKIP;
}

/** The answer of a `copyPacked` field function for a field to leave out. */
const SKIP = Symbol('skip');

/**
 * A copy of a tile or its metadata in the source's key order, with each
 * field replaced by what `pack` returns for it, and left out where `pack`
 * returns `SKIP`. An own `__proto__` key, which a parsed save can hold, is
 * defined as a plain field, because an assignment to that key sets the
 * prototype instead.
 * @param {Record<string, any>} source
 * @param {(key: string, value: unknown) => unknown} pack
 * @returns {Record<string, any>}
 */
function copyPacked(source, pack) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of Object.keys(source)) {
    const value = pack(key, source[key]);
    if (value === SKIP) continue;
    if (key === '__proto__') {
      Object.defineProperty(out, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      out[key] = value;
    }
  }
  return out;
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
 * One cached packer per collection in `ENTITY_DEFAULTS`. Each caches on the
 * entity's identity, so an entity that no edit touched since the last save
 * packs to the cached object instead of re-running its trial loop.
 * @type {Record<string, (list: any[]) => any[]>}
 */
const ENTITY_PACKERS = Object.fromEntries(
  Object.entries(ENTITY_DEFAULTS).map(([key, withDefaults]) => [
    key,
    createEntityPacker(withDefaults),
  ]),
);

/**
 * A node with its tiles packed.
 * @param {Record<string, any>} node
 * @returns {Record<string, any>}
 */
function packNode(node) {
  return { ...node, tiles: node.tiles.map(packTile) };
}

/**
 * One live node on its way into a save: its cached encoded form, or the
 * encode of a payload-free node, which goes into that cache
 * (`EncodedNodes.js`), or the packed node of a node that holds an inline
 * payload, which still needs the hoist.
 * @param {Record<string, any>} node a node whose `tiles` is an array
 * @returns {{ encoded: Record<string, any> } | { packed: Record<string, any> }}
 */
function packForSave(node) {
  const cached = encodedOf(node);
  if (cached) return { encoded: cached };
  const packed = packNode(node);
  if (nodeHoldsPayload(packed)) return { packed };
  const encoded = encodeNodeTiles(packed);
  rememberEncoded(node, encoded);
  return { encoded };
}

/**
 * One node in the form a save stores it: tiles packed, then encoded by
 * `TileCodec.js`. The undo log stores a whole node in this form, and it
 * reads the cache above, so a node that a save already encoded costs one
 * lookup. The node's image refs stay as they are, so a node that still
 * contains an inline payload keeps it.
 * @param {Record<string, any>} node a node whose `tiles` is an array
 * @returns {Record<string, any>}
 */
export function encodeHistoryNode(node) {
  const slot = packForSave(node);
  return 'encoded' in slot ? slot.encoded : encodeNodeTiles(slot.packed);
}

/**
 * The inverse of `encodeHistoryNode`: the tiles decoded, then every tile and
 * node default filled in, the same two steps `deserialize` runs on each
 * node. The function is pure.
 * @param {Record<string, any>} node
 * @returns {Record<string, any>}
 */
export function decodeHistoryNode(node) {
  return withNodeDefaults(/** @type {any} */ (decodeNodeTiles(node)));
}

/**
 * The campaign in its on-disk form: the state, with every node's tiles
 * packed, every entity's default-valued fields omitted, every repeated gear
 * piece moved into a `gear` table, every inline image payload hoisted into an
 * `assets` table, every node whose tiles fill a grid encoded by position, and
 * every palette string of those nodes moved into a `strings` table. The
 * function is pure. It never touches the state passed in.
 *
 * For a node with an inline payload, the tile codec runs after the asset
 * hoist. This order keeps `Assets.js` unaware of the codec. The hoist walks
 * `node.tiles[].imageRef`, a field an encoded node no longer has. Running
 * the codec afterward means its palette holds already-hoisted `asset:`
 * references, not the payloads themselves. A payload-free node skips the
 * hoist, which would pass it through unchanged, and encodes at once. The
 * string table (`StringTable.js`) runs last, over the encoded nodes, so the
 * encoded form of one node stays self-contained. Exported so a test can
 * observe that an unchanged node's encode is the cached object; `serialize`
 * is the production entry point.
 * @param {CampaignState} state
 * @returns {Record<string, any>}
 */
export function packState(state) {
  const slots = state.nodes.map(packForSave);
  /** @type {Record<string, any>} */
  const packed = {
    ...state,
    nodes: slots.flatMap((slot) => ('packed' in slot ? [slot.packed] : [])),
  };
  for (const [key, pack] of Object.entries(ENTITY_PACKERS)) {
    const list = packed[key];
    if (Array.isArray(list)) packed[key] = pack(list);
  }
  const hoisted = hoistAssets(tabulateGear(packed));
  const withPayload = /** @type {Record<string, any>[]} */ (hoisted.nodes).map(encodeNodeTiles);
  let next = 0;
  hoisted.nodes = slots.map((slot) => ('encoded' in slot ? slot.encoded : withPayload[next++]));
  return tabulateStrings(hoisted);
}

/**
 * The work of a first `packState` call, split into one step per node and one
 * per entity. Each step fills the same identity caches that `packState`
 * reads, and returns what it packed. A load hands every node and entity a
 * fresh object, so the first save packs the whole world, about 110 ms at 200
 * nodes and 1,200 creatures. A caller runs these steps in idle time so that
 * save is mostly cache lookups. The asset hoist is not split, because it
 * walks the whole state at once, and it costs little next to the packs.
 * @param {CampaignState} state
 * @returns {(() => unknown)[]}
 */
export function warmPackSteps(state) {
  /** @type {(() => unknown)[]} */
  const steps = state.nodes.map((node) => () => {
    const slot = packForSave(node);
    return 'encoded' in slot ? slot.encoded : slot.packed;
  });
  for (const [key, pack] of Object.entries(ENTITY_PACKERS)) {
    const list = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (state))[key];
    if (!Array.isArray(list)) continue;
    for (const entity of list) steps.push(() => pack([entity])[0]);
  }
  return steps;
}

/**
 * @param {CampaignState} state
 * @returns {string}
 */
export function serialize(state) {
  return JSON.stringify(packState(state));
}

/**
 * A save collection read back as fully-defaulted entities: the record
 * coercion from `RecordCoercion.js`, then the paired `withDefaults`. This is
 * the unpack half of `packState`'s omission, so it must run here on load,
 * not only in the startup path. A stored character can legitimately carry
 * no `spellbook` key now, and `undoHistory` and `readStateFromFile` pass
 * their result to callers that apply no defaulting of their own.
 * @param {string} key a key of ENTITY_DEFAULTS
 * @param {unknown} value
 * @returns {any[]}
 */
function entities(key, value) {
  const withDefaults = ENTITY_DEFAULTS[key];
  return records(value).map((entry) => withDefaults(entry));
}

/**
 * Parse a serialized campaign. The function defaults any missing field to
 * an empty value instead of throwing an error, so an older or hand-edited
 * save still loads. It coerces every field whose shape the load path
 * trusts, so a malformed field cannot pass through. This is the only
 * validation a save goes through. Import stores what it reads and then
 * reloads it, so an unreadable field that survives this function becomes
 * the stored save of an app that no longer starts. The function removes
 * nodes with no id, breaks parent loops (`withRepairedParents`), and
 * clears tile links to missing nodes (`withRepairedLinks`).
 * `withNodeDefaults` (TileGrid) defends the tiles inside
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
 * stored form is read: the payloads live apart from the campaign string
 * (`AssetMirror.storedAssetTable`), so only the readers of a stored string
 * pass this argument. A
 * table inside the string wins over it, so an exported file, which is
 * always self-contained, is unaffected.
 *
 * `previous` is the node list of a state that this tab already holds. A
 * stored node whose encoded record equals the cached encoded form of the
 * previous node with the same id (`EncodedNodes.nodeReuser`) comes back as
 * that node, with no decode, no asset walk, and no defaults pass. Every other
 * node decodes. A decoded node whose record names no image payload and no
 * `asset:` key, and whose refs the asset walk left unchanged, caches that
 * record as its encoded form, so the first save after a load and the next
 * read of a save string skip it.
 * @param {string} json
 * @param {Record<string, string>} [assets]
 * @param {readonly Record<string, any>[]} [previous]
 * @returns {CampaignState}
 */
export function deserialize(json, assets, previous = []) {
  // The string table is read back first, so every later step sees node
  // palettes that hold strings, the same form one encoded node has alone.
  const raw = restoreStrings(restoreGear(record(JSON.parse(json)) ?? {}));
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
  let report = { dropped: 0, emptied: 0 };
  /** @type {WeakSet<object>} */
  const reused = new WeakSet();
  /** @type {WeakSet<object>} */
  const untouched = new WeakSet();
  /** @type {Map<object, Record<string, any>>} */
  const sources = new Map();
  if (Array.isArray(decoded.nodes)) {
    const reuseNode = nodeReuser(previous);
    const { nodes, dropped, emptied } = decodeNodeList(decoded.nodes, {
      reuse(stored) {
        const live = reuseNode(stored);
        if (live) {
          reused.add(live);
          untouched.add(live);
        }
        return live;
      },
      onDecode(node, stored) {
        if (!namesImageData(stored)) sources.set(node, stored);
      },
    });
    decoded.nodes = nodes;
    report = { dropped, emptied };
  }
  if (assets && Object.keys(assets).length) {
    // The sidecar table is a fallback under whatever the string itself
    // carries, so a save holding its own table resolves from that table alone.
    decoded.assets = { ...assets, ...(record(decoded.assets) ?? {}) };
  }
  const parsed = restoreAssets(decoded, untouched);
  /** @type {Map<object, Record<string, any>>} */
  const seeds = new Map();
  const nodes = records(parsed.nodes)
    .filter((node) => typeof node.id === 'string')
    .map((node) => {
      if (reused.has(node)) return /** @type {import('../types/map.js').MapNode} */ (node);
      const full = withNodeDefaults(node);
      const source = untouched.has(node) ? sources.get(node) : undefined;
      if (source) seeds.set(full, source);
      return full;
    });
  // The link palette of an encoded node lists every `childNodeId` of its
  // tiles, so a reused node skips the tile walk of the dead-link repair.
  const repaired = withRepairedLinks(withRepairedParents(nodes), (node) =>
    reused.has(node) ? (encodedOf(node)?.links ?? []) : undefined,
  );
  for (const node of repaired) {
    const source = seeds.get(node);
    if (source) rememberEncoded(node, source);
  }
  const state = {
    version: CURRENT_VERSION,
    nodes: repaired,
    party: partyPosition(parsed.party),
    entryTiles: entryTileMemory(parsed.entryTiles),
    characters: entities('characters', parsed.characters),
    creatures: entities('creatures', parsed.creatures),
    travelog: logEntries(parsed.travelog),
    quests: questRecords(parsed.quests),
    clock: gameClock(parsed.clock),
    handouts: entities('handouts', parsed.handouts),
    bestiary: creatureTemplates(parsed.bestiary),
    splitParty: parsed.splitParty === true,
    combat: combatState(parsed.combat),
  };
  // The shortened map reaches the GM through `loadTruncation`
  // (`ShortenedLoad.js`), so the next save does not store it unannounced.
  noteTruncation(state, report);
  return state;
}

/**
 * Rebuild a TileGrid from a CampaignState's flat node list. The grid holds
 * the state's own node objects. `deserialize` has already run
 * `withNodeDefaults` on every node, and that function re-maps and
 * re-freezes every tile, so running it here again costs a full pass over
 * the world on every load for no change. Keeping the parsed objects also
 * lets the first save after a load diff against them by identity, because
 * the history cache holds the same parsed state.
 * @param {CampaignState} state
 * @returns {TileGrid}
 */
export function toTileGrid(state) {
  const grid = new TileGrid();
  for (const node of state.nodes) grid.addNode(node);
  return grid;
}

/**
 * Warn when stored data approaches the localStorage origin quota of about 5
 * MB. This leaves headroom for the history log, which shares the same
 * quota, and for the image table when IndexedDB is not in use.
 * localStorage stores UTF-16 code units, so the byte cost of a string is
 * twice its length.
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

export { footprintBytes } from './Footprint.js';

/**
 * What this origin currently spends of its localStorage quota: every key,
 * not just the campaign save. The save, the undo ring, the custom library,
 * and the lock and preference flags all share this quota, so one save's
 * size does not show how close a write is to failing. The number comes
 * from the ledger in `Footprint.js`, so it does not read every stored
 * value again after each save.
 * @returns {number}
 */
export function localStorageFootprint() {
  return storageFootprint();
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
 * Image payloads are stored before the campaign, so structure and blobs
 * fail independently. `assetsOk` false leaves the GM a saved map with a
 * missing picture. One blob stored inside the campaign string costs the GM
 * both the map and the picture. The payloads go first because the reverse
 * order can store structure that references nothing, and a follower tab
 * that adopts that campaign looks up a key that is not stored yet. `bytes`
 * measures the payload-free save. Only `footprint` speaks to the quota,
 * and it counts every localStorage key.
 *
 * The payloads go to IndexedDB when `AssetMirror.js` has a backend, and to
 * their own localStorage key (`AssetStore.js`) otherwise. An IndexedDB put
 * is asynchronous. When the save adds a payload that is not committed yet,
 * this function writes nothing and returns `pending`, the promise of that
 * put. The caller saves again once it settles, and that save finds the
 * payload committed and writes the campaign. A put that fails makes the
 * next save write the campaign with `assetsOk` false. A page that closes
 * while a put is pending keeps its previous save.
 *
 * `json` is the string that was written, or that the code attempted to
 * write. `HistoryLog.js` caches the state it just stored against this
 * string, so recording a history step costs a string comparison, not a
 * re-read and re-parse of the save.
 *
 * The payload write adds and never removes. The retention scan that removes
 * unreferenced payloads runs only after the campaign write succeeds. When
 * the campaign write fails, the stored campaign stays in place and every
 * image it references still resolves.
 *
 * `keepPrevious` skips that scan, so every payload that the save being
 * replaced references stays in the table. `HistoryLog.js` sets it when it
 * stores the replaced save string as a snapshot record after this write.
 * Without it, the payload table drops the images of the replaced save
 * before the snapshot key exists to reference them, and an undo restores a
 * campaign with missing pictures.
 *
 * `beforeWrite` runs right before the first campaign write, and not for a
 * pending save. `HistoryLog.js` removes the save mark there.
 *
 * `makeRoom` runs when the campaign write fails. It removes data that the
 * caller can spare and returns true when it removed something. The write
 * then runs again with the same string, so a retry does not pack the
 * campaign again. `HistoryLog.saveCampaign` passes a function that drops
 * undo steps, because a campaign that exists only in memory is a worse
 * loss than undo depth. On the localStorage path, a payload write that
 * failed runs again first, so the freed room goes to the images.
 * @param {CampaignState} state
 * @param {string} [key]
 * @param {{ keepPrevious?: boolean, makeRoom?: () => boolean, beforeWrite?: () => void }} [options]
 * @returns {SaveResult}
 */
export function trySaveToLocalStorage(state, key = DEFAULT_STORAGE_KEY, options = {}) {
  const { state: detached, assets } = detachAssets(packState(state));
  const json = JSON.stringify(detached);
  const bytes = saveByteSize(json);
  const mirrored = mirrorActive();
  /** @param {boolean} ok @param {boolean} assetsOk @returns {SaveResult} */
  const result = (ok, assetsOk) => {
    const footprint = localStorageFootprint();
    return { ok, assetsOk, nearQuota: !ok || isNearQuota(footprint), bytes, footprint, json };
  };
  let assetsOk = true;
  if (mirrored) {
    const staged = stageAssets(assets);
    if (staged.pending)
      return { ...result(false, true), nearQuota: false, pending: staged.pending };
    assetsOk = staged.assetsOk;
  } else {
    assetsOk = storeAssets(assets);
  }
  options.beforeWrite?.();
  for (;;) {
    try {
      writeStored(key, json);
      break;
    } catch {
      if (!options.makeRoom?.()) return result(false, assetsOk);
      if (!mirrored && !assetsOk) assetsOk = storeAssets(assets);
    }
  }
  // The replaced save is gone from `key` now. When the caller still needs
  // its images, the scan waits for the next save, which finds the snapshot
  // record that references them.
  if (!options.keepPrevious) {
    if (mirrored) pruneMirror(json);
    else assetsOk = persistAssets(assets, json) && assetsOk;
  }
  return result(true, assetsOk);
}

/**
 * @param {string} [key]
 * @returns {CampaignState | null}
 */
export function loadFromLocalStorage(key = DEFAULT_STORAGE_KEY) {
  const json = localStorage.getItem(key);
  return json ? deserialize(json, storedAssetTable()) : null;
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
 * Subscribe to campaign saves made in other tabs of the same origin. This
 * is the simplest multi-device setup this app supports: the GM tab drives,
 * and follower tabs react. There is no server and no dependency, only the
 * `storage` event. The browser fires `storage` only in tabs other than the
 * one that made the change, so a driving tab never sees its own saves. The
 * callback runs once per save bundle, after its save mark arrives, as
 * `SaveFollower.js` describes. The function returns an unsubscribe function.
 * @param {() => void} callback run when another tab writes a new save
 * @param {string} [key]
 * @returns {() => void}
 */
export function onExternalSave(callback, key = DEFAULT_STORAGE_KEY) {
  const follow = createSaveFollower({
    saveKey: key,
    markKey: SAVE_MARK_KEY,
    onSave: callback,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (handle)),
  });
  const handler = (/** @type {StorageEvent} */ event) => {
    // Every write another tab makes passes through here, not only a save, so
    // the footprint ledger follows the other tab's history and sidecar keys.
    recordExternalWrite(event);
    follow(event);
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
