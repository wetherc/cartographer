/**
 * A campaign state that runs every branch of the load path: the example
 * campaign (a generated world whose regions link to sub-maps), one more
 * generated region, and tiles with spans, metadata, unknown fields, image
 * payloads, `asset:` keys, refs the app refuses to load, and links to nodes
 * that do not exist.
 */

import { buildExampleCampaign } from '../../src/campaign/Campaigns.js';
import { TilePalette } from '../../src/map/TilePalette.js';
import { generateNodeTiles } from '../../src/map/MapGenerator.js';
import { createMapNode, createTile, setTile } from '../../src/map/TileGrid.js';
import { withNodeTiles } from '../../src/map/TileIndex.js';
import { mulberry32 } from '../../src/util/Rng.js';
import { buildState } from '../../src/storage/SaveManager.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

/**
 * The tiles that replace the first cells of a node, keyed by tile id.
 * @param {string} childId a node that exists
 * @returns {Record<string, Partial<import('../../src/types/map.js').Tile> & Record<string, any>>}
 */
function oddTiles(childId) {
  return {
    '0,0': { imageRef: 'https://evil.example/x.png', overlayRef: ['//evil/a.png', 'road'] },
    '1,0': { imageRef: PNG },
    '2,0': { overlayRef: PNG, revealed: true },
    '3,0': { childNodeId: 'missing-node' },
    '4,0': {
      span: 2,
      metadata: { poiType: 'landmark', discoverable: true, discovered: false, notes: 'n' },
    },
    '5,0': { extraField: 'kept', childNodeId: childId },
    '6,0': { imageRef: 'asset:zzz' },
    '7,0': { imageRef: 'asset:BAD!' },
  };
}

/**
 * @param {import('../../src/types/map.js').MapNode} node
 * @param {string} childId
 * @returns {import('../../src/types/map.js').MapNode}
 */
function withOddTiles(node, childId) {
  let next = node;
  for (const [id, fields] of Object.entries(oddTiles(childId))) {
    const old = next.tiles.find((t) => t.id === id);
    if (old)
      next = setTile(next, /** @type {any} */ ({ ...createTile(id, old.imageRef), ...fields }));
  }
  return next;
}

/**
 * @returns {import('../../src/storage/SaveManager.js').CampaignState}
 */
export function loadFixtureState() {
  const palette = new TilePalette();
  const campaign = buildExampleCampaign(palette);
  const gen = generateNodeTiles(palette, { archetype: 'town', size: 'small' }, mulberry32(7));
  const extra = createMapNode('extra-region', 'Extra', 'world', gen.width, gen.height);
  campaign.grid.addNode(withNodeTiles(extra, gen.tiles));
  const state = buildState(campaign);
  const [first, second] = state.nodes.filter((n) => n.width >= 8 && n.height >= 2);
  const nodes = state.nodes.map((n) =>
    n === first ? withOddTiles(n, second.id) : n === second ? withOddTiles(n, first.id) : n,
  );
  // A node whose tile ids are not grid positions stays in the per-tile form.
  const loose = createMapNode('loose', 'Loose', 'world', 2, 1);
  nodes.push({ ...loose, tiles: [createTile('a-b', 'https://evil.example/y.png')] });
  return { ...state, nodes };
}
