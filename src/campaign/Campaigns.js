import { createMapNode, TileGrid } from '../map/TileGrid.js';
import { loadFromLocalStorage, toTileGrid } from '../storage/SaveManager.js';
import { createClock } from '../time/GameClock.js';
import { buildExampleWorld } from './ExampleWorld.js';
import { buildExampleContent } from './ExampleContent.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */

/**
 * Everything that makes up one campaign's state at runtime. SaveManager's
 * CampaignState is the serialized form of this state.
 * @typedef {{
 *   grid: TileGrid,
 *   party: import('../types/map.js').PartyPosition,
 *   characters: import('../types/entities.js').Character[],
 *   creatures: import('../types/creature.js').Creature[],
 *   travelog: import('../types/log.js').LogEntry[],
 *   quests: import('../types/quest.js').Quest[],
 *   clock: import('../types/time.js').GameClock,
 *   handouts: import('../types/handout.js').Handout[],
 *   bestiary: import('../types/creature.js').CreatureTemplate[],
 *   splitParty: boolean,
 *   combat: import('../types/combat.js').CombatState | null,
 * }} Campaign
 */

/**
 * Whether the live campaign holds nothing the GM could lose: one world node
 * with no tiles, and no characters. The onboarding overlay shows only for
 * such a campaign, and "Load example" skips its replace warning for it.
 * @param {{ nodes: Map<string, unknown> }} grid
 * @param {{ tiles: readonly unknown[] }} currentNode
 * @param {readonly unknown[]} characters
 * @returns {boolean}
 */
export function isBlankCampaign(grid, currentNode, characters) {
  return grid.nodes.size === 1 && currentNode.tiles.length === 0 && characters.length === 0;
}

/**
 * A blank campaign has one empty world node, no characters in the party, and
 * no enemies. The first run of the app and the "New" button produce this
 * campaign. Demo content appears only when the GM asks for it.
 * @returns {Campaign}
 */
export function buildBlankCampaign() {
  const grid = new TileGrid();
  grid.addNode(createMapNode('world', 'World', null, 8, 6));
  return {
    grid,
    party: { nodeId: 'world', tileId: '0,0' },
    characters: [],
    creatures: [],
    travelog: [],
    quests: [],
    clock: createClock(),
    handouts: [],
    bestiary: [],
    splitParty: false,
    combat: null,
  };
}

/**
 * The example campaign loads on demand through the "Load example" button. It
 * has a 32x32 overworld and four linked subregions, populated end to end as a
 * playable story.
 *
 * Goblin raids out of the Northmarch march under the seal of King Ostrand,
 * the risen wight in the Barrow of the Old King. The quest chain runs from
 * crossroads rumors through the raiders' camp (Chieftain Snagtooth), the
 * wyvern Skalvyr guarding the hermit who holds the barrow's warding key, an
 * optional bargain with the mire hag, and down into the barrow to put
 * Ostrand back in his tomb.
 *
 * Field enemies appear in each biome. Briarwick has NPCs. Handouts, a
 * bestiary, and a two-member party complete the demo. The maps come from
 * ExampleWorld.js. The populace comes from ExampleContent.js. `rng` is
 * injectable so a test run can seed the generated subregions.
 * @param {TilePalette} palette
 * @param {() => number} [rng]
 * @returns {Campaign}
 */
export function buildExampleCampaign(palette, rng = Math.random) {
  const world = buildExampleWorld(palette, rng);
  return { grid: world.grid, ...buildExampleContent(palette, world) };
}

/**
 * The app boots with the saved campaign if a save exists. If no save exists,
 * the app boots with a blank campaign. The demo world loads only through the
 * "Load example" button, never by default. An empty character roster is
 * valid authored state, so the app never adds a default character.
 * @returns {Campaign}
 */
export function loadInitialCampaign() {
  const saved = loadFromLocalStorage();
  if (!saved) return buildBlankCampaign();
  // SaveManager's deserialize sets a default for every missing top-level field
  // and runs withDefaults for each entity. saved is a complete CampaignState
  // here. Only party and clock still need a runtime default, because
  // deserialize fills them with null.
  return {
    grid: toTileGrid(saved),
    party: saved.party ?? { nodeId: 'world', tileId: '0,0' },
    characters: saved.characters,
    creatures: saved.creatures,
    travelog: saved.travelog,
    quests: saved.quests,
    clock: saved.clock ?? createClock(),
    handouts: saved.handouts,
    bestiary: saved.bestiary,
    splitParty: saved.splitParty,
    combat: saved.combat ?? null,
  };
}

/**
 * A runtime campaign over a state whose objects are already live. The
 * cross-tab delta adoption builds such a state: it applies a saved delta to
 * this tab's own state, so every entity the delta did not touch is the live
 * object the views already hold. Unlike `loadInitialCampaign`, nothing here
 * re-parses or re-defaults. The entities came from live state on both sides
 * of the delta, so they already carry their defaults.
 * @param {import('../types/storage.js').CampaignState} state
 * @returns {Campaign}
 */
export function campaignFromLiveState(state) {
  const grid = new TileGrid();
  for (const node of state.nodes) grid.addNode(node);
  return {
    grid,
    party: state.party ?? { nodeId: 'world', tileId: '0,0' },
    characters: state.characters,
    creatures: state.creatures,
    travelog: state.travelog,
    quests: state.quests,
    clock: state.clock ?? createClock(),
    handouts: state.handouts,
    bestiary: state.bestiary,
    splitParty: state.splitParty,
    combat: state.combat ?? null,
  };
}

/**
 * The boot entry point. It calls `loadInitialCampaign`, but a save that the
 * app cannot read at all produces a blank campaign instead of an exception.
 *
 * Without this, one unreadable field causes a white screen. Import writes
 * what it reads before it reloads the app, so the unreadable campaign is
 * already the stored save, and the GM has no app left to press Undo
 * in. `failed` lets the caller report the error once the toasts mount. The
 * previous save is still in the undo ring, and Undo restores it.
 * @returns {{ campaign: Campaign, failed: boolean }}
 */
export function loadInitialCampaignSafe() {
  try {
    return { campaign: loadInitialCampaign(), failed: false };
  } catch (error) {
    console.error('Could not load the saved campaign; starting blank.', error);
    return { campaign: buildBlankCampaign(), failed: true };
  }
}
