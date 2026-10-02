/**
 * Pure helpers for the handout dialog: the "Shows at" choices, the
 * "Only for" audience field, and the short note under a GM's handout row.
 * The dialog itself lives in `app/handoutWiring.js`.
 */

import { cleanAudience } from './Handouts.js';
import { describeTile } from '../map/TileCoords.js';
import { capitalize } from '../util/text.js';

/** @typedef {import('../types/handout.js').Handout} Handout */
/** @typedef {import('../types/modal.js').FieldOption} FieldOption */

/**
 * Where a handout shows: campaign-wide (both null), a whole node (tileId
 * null), or one tile of a node.
 * @typedef {{ nodeId: string | null, tileId: string | null }} HandoutPlace
 */

/**
 * The select value that stands for a place. JSON keeps a node or tile id
 * with any character in it apart from the other id.
 * @param {HandoutPlace} place
 * @returns {string}
 */
export function placeValue(place) {
  return JSON.stringify([place.nodeId, place.nodeId === null ? null : place.tileId]);
}

/**
 * The place a select value stands for. A value that does not parse means
 * campaign-wide, the place that hides nothing from a player.
 * @param {string} value
 * @returns {HandoutPlace}
 */
export function parsePlace(value) {
  /** @type {unknown} */
  let parsed = null;
  try {
    parsed = JSON.parse(value);
  } catch {
    // Falls through to campaign-wide below.
  }
  if (!Array.isArray(parsed) || typeof parsed[0] !== 'string')
    return { nodeId: null, tileId: null };
  return { nodeId: parsed[0], tileId: typeof parsed[1] === 'string' ? parsed[1] : null };
}

/**
 * The "Shows at" options for the given places, in order, with repeats
 * dropped. The tile the party stands on says so, because the tile id alone
 * does not tell the GM which tile it is.
 * @param {HandoutPlace[]} places
 * @param {(nodeId: string) => string} nodeName
 * @param {HandoutPlace} party the party's node and tile
 * @returns {FieldOption[]}
 */
export function placeOptions(places, nodeName, party) {
  /** @type {Map<string, string>} */
  const options = new Map();
  for (const place of places) {
    const value = placeValue(place);
    if (options.has(value)) continue;
    let label = 'Everywhere (campaign-wide)';
    if (place.nodeId !== null && place.tileId === null) {
      label = `Anywhere in ${nodeName(place.nodeId)}`;
    } else if (place.nodeId !== null && place.tileId !== null) {
      const here = place.nodeId === party.nodeId && place.tileId === party.tileId;
      label = `${capitalize(describeTile(place.tileId))} of ${nodeName(place.nodeId)}${here ? " (the party's tile)" : ''}`;
    }
    options.set(value, label);
  }
  return [...options].map(([value, label]) => ({ value, label }));
}

/**
 * The audience list from the "Only for" field's comma-joined value. No box
 * checked means every player.
 * @param {string | undefined} value
 * @returns {string[] | null}
 */
export function parseAudience(value) {
  return cleanAudience((value ?? '').split(','));
}

/**
 * The GM's note under a handout row: the tile it waits on and who it is
 * for. An empty string means the handout has neither.
 * @param {Handout} handout
 * @param {(characterId: string) => string | undefined} characterName
 * @returns {string}
 */
export function describeHandout(handout, characterName) {
  const parts = [];
  if (handout.tileId !== null) parts.push(`Shows at ${describeTile(handout.tileId)}`);
  if (handout.audience !== null) {
    const names = handout.audience.map((id) => characterName(id) ?? 'a removed character');
    parts.push(`Only for ${names.join(', ')}`);
  }
  return parts.join('. ');
}
