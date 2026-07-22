import { createMapNode, createTile, setTile, TileGrid } from '../map/TileGrid.js';
import { createCharacter, addResource, withDefaults, withHP } from '../entities/Character.js';
import { createResource } from '../entities/Resource.js';
import {
  createEncounter,
  withDefaults as withEncounterDefaults,
} from '../entities/Encounter.js';
import { loadFromLocalStorage, toTileGrid } from '../storage/SaveManager.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */

/**
 * Everything that makes up one campaign's state, as the app works with it at
 * runtime (SaveManager's CampaignState is the serialized counterpart).
 * @typedef {{
 *   grid: TileGrid,
 *   party: import('../types/map.js').PartyPosition,
 *   characters: import('../types/entities.js').Character[],
 *   encounters: import('../types/entities.js').Encounter[],
 *   travelog: import('../types/log.js').LogEntry[],
 * }} Campaign
 */

/**
 * A genuinely blank campaign: one empty world node to author into, nobody in
 * the party, nothing to fight. This is what a first run and the "New" button
 * produce, so demo content only ever appears when explicitly asked for.
 * @returns {Campaign}
 */
export function buildBlankCampaign() {
  const grid = new TileGrid();
  grid.addNode(createMapNode('world', 'World', null, 8, 6));
  return {
    grid,
    party: { nodeId: 'world', tileId: '0,0' },
    characters: [],
    encounters: [],
    travelog: [],
  };
}

/**
 * A small example world, loadable on demand via the "Load example" button.
 * @param {TilePalette} palette
 * @returns {Campaign}
 */
export function buildExampleCampaign(palette) {
  const rng = () => Math.random();
  const grid = new TileGrid();

  let world = createMapNode('world', 'World', null, 8, 6);
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 8; x++) {
      // The 2x2 block linking to the forested Northmarch region shows forest
      // terrain on the world map too, so the overview hints at what's inside.
      const inRegionBlock = x < 2 && y < 2;
      const entry =
        y === 2
          ? // end-* names the tile's open edge: the westmost tile connects to
            // the road on its east, so it takes end-e (and vice versa at x=7).
            palette.getRoadPiece(x === 0 ? 'end-e' : x === 7 ? 'end-w' : 'h')
          : palette.pickVariant(inRegionBlock ? 'forest' : 'grass', rng);
      if (!entry) continue;
      world = setTile(
        world,
        createTile(`${x},${y}`, entry.imageRef, inRegionBlock ? { childNodeId: 'region' } : {}),
      );
    }
  }
  grid.addNode(world);

  let region = createMapNode('region', 'Northmarch Region', 'world', 4, 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      region = setTile(region, createTile(`${x},${y}`, palette.pickVariant('forest', rng).imageRef));
    }
  }
  grid.addNode(region);

  let hero = withHP(createCharacter('hero', 'Hero', { STR: 14, DEX: 12, CON: 13 }, 'Human'), 12);
  hero = addResource(hero, createResource('mana', 'Mana', 'mana', 10));

  return {
    grid,
    party: { nodeId: 'world', tileId: '3,3' },
    characters: [hero],
    encounters: [createEncounter('goblin', 'Goblin', 7, {}, { nodeId: 'world', tileId: '5,2' })],
    travelog: [],
  };
}

/**
 * The campaign the app boots with: the saved one if a save exists, otherwise a
 * blank campaign (the demo world is opt-in via "Load example", never a silent
 * default). Loaded entities are default-filled for back-compat with older
 * saves; an empty character roster is legitimate authored state, so no default
 * character is ever injected.
 * @returns {Campaign}
 */
export function loadInitialCampaign() {
  const saved = loadFromLocalStorage();
  if (!saved) return buildBlankCampaign();
  return {
    grid: toTileGrid(saved),
    party: saved.party ?? { nodeId: 'world', tileId: '0,0' },
    characters: saved.characters.map(withDefaults),
    encounters: saved.encounters.map(withEncounterDefaults),
    travelog: saved.travelog ?? [],
  };
}
