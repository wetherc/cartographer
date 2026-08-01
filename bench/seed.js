/**
 * A campaign save built in Node, for a scenario that needs a specific starting
 * position.
 *
 * The fight scenario is the reason this file exists. A fight starts from the
 * Encounters panel, which lists only the encounters on the party's own tile,
 * and the example campaign starts the party on an empty tile. Walking there
 * through the map would measure travel, not combat. Instead the harness builds
 * the example campaign, moves the party onto the first encounter, serializes
 * it, and writes that string into localStorage. The app then loads it through
 * the same path a normal page load takes.
 */

import { TilePalette } from '../src/map/TilePalette.js';
import { buildExampleCampaign } from '../src/campaign/Campaigns.js';
import { buildState, serialize } from '../src/storage/SaveManager.js';
import { mulberry32 } from '../src/util/Rng.js';

export const SAVE_KEY = 'campaign-builder:save';

/**
 * The example campaign as a save string, with the party standing on the tile
 * of its first encounter. Returns null when the example campaign holds no
 * placed encounter.
 * @param {number} [seed]
 * @returns {string | null}
 */
export function exampleSaveOnEncounter(seed = 1) {
  const campaign = buildExampleCampaign(new TilePalette(), mulberry32(seed));
  const placed = campaign.encounters.find((e) => e.location?.nodeId && e.location?.tileId);
  if (!placed) return null;
  const state = buildState({
    ...campaign,
    party: { nodeId: placed.location.nodeId, tileId: placed.location.tileId },
  });
  return serialize(state);
}
