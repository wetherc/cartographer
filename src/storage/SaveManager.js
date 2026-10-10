/**
 * The campaign save as a value and as a string: `buildState` collects the
 * live campaign, `serialize` packs it into the stored form, and `deserialize`
 * reads a stored or imported string back into a fully defaulted state. The
 * functions here are pure. `SaveStorage.js` writes the string to
 * localStorage.
 */

import {
  TileGrid,
  withNodeDefaults,
  withRepairedLinks,
  withRepairedParents,
} from '../map/TileGrid.js';
import { CURRENT_VERSION, migrateState, stateVersion } from './Migrations.js';
import { hoistAssets, restoreAssets } from './Assets.js';
import { createEntityPacker } from './EntityPack.js';
import { packForSave } from './NodePack.js';
import { restoreGear, tabulateGear } from './GearTable.js';
import { restoreStrings, tabulateStrings } from './StringTable.js';
import { noteTruncation } from './ShortenedLoad.js';
import { encodeNodeTiles, decodeNodeList } from './TileCodec.js';
import { encodedOf, namesImageData, nodeReuser, rememberEncoded } from './EncodedNodes.js';
import { CAMPAIGN_FIELDS, campaignFields } from './CampaignFields.js';
import { withDefaults as withCharacterDefaults } from '../entities/Character.js';
import { withDefaults as withCreatureDefaults } from '../entities/Creature.js';
import { withDefaults as withHandoutDefaults } from '../handout/Handouts.js';
import { partyPosition, record, records } from './RecordCoercion.js';

/** @typedef {import('../types/storage.js').CampaignState} CampaignState */

/**
 * Collect the whole campaign (tile hierarchy, party position, characters,
 * encounters, and everything else at the top level) into one plain,
 * JSON-serializable object.
 *
 * The fields come from `CAMPAIGN_FIELDS`. A caller that omits a field gets
 * the same empty value that a save without the field reads as. The argument
 * is a single object, not a positional list, so a caller that does not know
 * a field cannot drop it from the save.
 * @param {import('../types/storage.js').CampaignSource} campaign
 * @returns {CampaignState}
 */
export function buildState(campaign) {
  return {
    nodes: campaign.grid.allNodes(),
    party: campaign.party ?? null,
    ...campaignFields(campaign),
    // This function writes the save, so the version it stamps is the format
    // it produces, whatever version a caller's source object still claims.
    version: CURRENT_VERSION,
  };
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
  const state = /** @type {CampaignState} */ ({
    version: CURRENT_VERSION,
    nodes: repaired,
    party: partyPosition(parsed.party),
    ...Object.fromEntries(CAMPAIGN_FIELDS.map(({ key, coerce }) => [key, coerce(parsed[key])])),
  });
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
