import { createMapNode, TileGrid } from '../map/TileGrid.js';
import { withDefaults } from '../entities/Character.js';
import { withDefaults as withEncounterDefaults } from '../entities/Encounter.js';
import { loadFromLocalStorage, toTileGrid } from '../storage/SaveManager.js';
import { createClock } from '../time/GameClock.js';
import { withDefaults as withNPCDefaults } from '../entities/NPC.js';
import { withDefaults as withHandoutDefaults } from '../handout/Handouts.js';
import { buildExampleWorld } from './ExampleWorld.js';
import { buildExampleContent } from './ExampleContent.js';

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
 *   quests: import('../types/quest.js').Quest[],
 *   clock: import('../types/time.js').GameClock,
 *   npcs: import('../types/npc.js').NPC[],
 *   handouts: import('../types/handout.js').Handout[],
 *   bestiary: import('../types/entities.js').EncounterTemplate[],
 *   splitParty: boolean,
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
    quests: [],
    clock: createClock(),
    npcs: [],
    handouts: [],
    bestiary: [],
    splitParty: false,
  };
}

/**
 * The example campaign, loadable on demand via the "Load example" button: the
 * 32x32 overworld plus four linked subregions, populated end to end as a
 * playable arc. Goblin raids out of the Northmarch turn out to be marching
 * under the seal of King Ostrand, the risen wight in the Barrow of the Old
 * King; the quest chain runs from crossroads rumors through the raiders' camp
 * (Chieftain Snagtooth), the wyvern Skalvyr guarding the hermit who keeps the
 * barrow's warding key, an optional bargain with the mire hag, and down into
 * the barrow to put Ostrand back in his tomb. Field enemies dot each biome,
 * Briarwick is staffed with NPCs, and handouts, a bestiary, and a two-member
 * party round out the demo. The maps come from ExampleWorld.js and the
 * populace from ExampleContent.js. `rng` is injectable so tests can seed the
 * generated subregions.
 * @param {TilePalette} palette
 * @param {() => number} [rng]
 * @returns {Campaign}
 */
export function buildExampleCampaign(palette, rng = Math.random) {
  const world = buildExampleWorld(palette, rng);
  return { grid: world.grid, ...buildExampleContent(palette, world) };
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
  // deserialize (SaveManager) already defaults every missing top-level field, so
  // saved is a complete CampaignState here; only party and clock, which it fills
  // with null, still need a runtime default.
  return {
    grid: toTileGrid(saved),
    party: saved.party ?? { nodeId: 'world', tileId: '0,0' },
    characters: saved.characters.map(withDefaults),
    encounters: saved.encounters.map(withEncounterDefaults),
    travelog: saved.travelog,
    quests: saved.quests,
    clock: saved.clock ?? createClock(),
    npcs: saved.npcs.map(withNPCDefaults),
    handouts: saved.handouts.map(withHandoutDefaults),
    bestiary: saved.bestiary,
    splitParty: saved.splitParty,
  };
}
