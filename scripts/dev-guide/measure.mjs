/**
 * Save-size measurement for the developer guide.
 *
 * The numbers come from running the real packing functions over the real
 * example campaign. The example is built from a fixed seed, so the figure is
 * stable between runs.
 * Nothing here restates a measurement taken by hand.
 */
import { TilePalette } from '../../src/map/TilePalette.js';
import { buildExampleCampaign } from '../../src/campaign/Campaigns.js';
import { buildState, serialize } from '../../src/storage/SaveManager.js';
import { packEntities } from '../../src/storage/EntityPack.js';
import { hoistAssets } from '../../src/storage/Assets.js';
import { encodeNodeTiles } from '../../src/storage/TileCodec.js';
import { tabulateStrings } from '../../src/storage/StringTable.js';
import { withTileDefaults } from '../../src/map/NodeDefaults.js';
import { withDefaults as withCharacterDefaults } from '../../src/entities/Character.js';
import { withDefaults as withCreatureDefaults } from '../../src/entities/Creature.js';
import { withDefaults as withHandoutDefaults } from '../../src/handout/Handouts.js';
import { PartyTracker } from '../../src/party/PartyTracker.js';

const ENTITY_DEFAULTS = {
  characters: withCharacterDefaults,
  creatures: withCreatureDefaults,
  handouts: withHandoutDefaults,
};

export function measureSave() {
  const campaign = buildExampleCampaign(new TilePalette());
  const state = buildState(campaign);

  const tilesPacked = {
    ...state,
    nodes: state.nodes.map((node) => ({
      ...node,
      tiles: packEntities(node.tiles, withTileDefaults),
    })),
  };

  const entitiesPacked = { ...tilesPacked };
  for (const [key, withDefaults] of Object.entries(ENTITY_DEFAULTS)) {
    if (Array.isArray(entitiesPacked[key])) {
      entitiesPacked[key] = packEntities(entitiesPacked[key], withDefaults);
    }
  }

  const hoisted = hoistAssets(entitiesPacked);
  const encoded = { ...hoisted, nodes: hoisted.nodes.map(encodeNodeTiles) };
  const tabulated = tabulateStrings(encoded);

  const stages = [
    { id: 'raw', name: 'in-memory state', size: JSON.stringify(state).length },
    { id: 'tiles', name: '1. tile defaults', size: JSON.stringify(tilesPacked).length },
    { id: 'entities', name: '2. entity defaults', size: JSON.stringify(entitiesPacked).length },
    { id: 'assets', name: '3. assets hoisted', size: JSON.stringify(hoisted).length },
    { id: 'codec', name: '4. tile codec', size: JSON.stringify(encoded).length },
    { id: 'strings', name: '5. string table', size: JSON.stringify(tabulated).length },
  ];

  return {
    nodes: state.nodes.length,
    tiles: state.nodes.reduce((sum, node) => sum + node.tiles.length, 0),
    stages,
    serialized: serialize(state).length,
  };
}

/** The reveal radius the party tracker uses when nothing overrides it. */
export function measureRevealRadius() {
  const campaign = buildExampleCampaign(new TilePalette());
  return new PartyTracker(campaign.grid, campaign.party).revealRadius;
}

/**
 * What the codec is worth on a node whose tiles fill their grid. The example
 * campaign's own largest node is the sample, so this figure also follows the
 * repository.
 */
export function measureDensestNode() {
  const campaign = buildExampleCampaign(new TilePalette());
  const state = buildState(campaign);

  let best = null;
  for (const node of state.nodes) {
    const before = JSON.stringify(node).length;
    const after = JSON.stringify(encodeNodeTiles(node)).length;
    if (!best || before - after > best.saved) {
      best = {
        id: node.id,
        name: node.name,
        width: node.width,
        height: node.height,
        tiles: node.tiles.length,
        before,
        after,
        saved: before - after,
      };
    }
  }

  return best;
}
