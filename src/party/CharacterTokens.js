/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */
/** @typedef {import('../types/entities.js').CharacterPlacement} CharacterPlacement */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */

/**
 * Pure logic behind per-character map tokens. A character's `location` is
 * their own position on the world. Null means the character stands with the
 * party, at the shared party marker. The wiring resolves tokens per rendered
 * node through `characterTokens`, and moves characters through
 * `moveCharacter`. Both functions stay testable without a canvas.
 */

/**
 * Resolve which character tokens appear in a node, and where. A character
 * with their own location shows on that tile when the tile is in this node.
 * A character still with the party shows on the party's tile, when the
 * party is in this node.
 * @param {Character[]} characters
 * @param {PartyPosition} partyPosition
 * @param {string} nodeId The node being drawn.
 * @returns {{ tileId: string, name: string, characterId: string }[]}
 */
export function characterTokens(characters, partyPosition, nodeId) {
  /** @type {{ tileId: string, name: string, characterId: string }[]} */
  const tokens = [];
  for (const character of characters) {
    const location = character.location ?? null;
    if (location) {
      if (location.nodeId === nodeId) {
        tokens.push({ tileId: location.tileId, name: character.name, characterId: character.id });
      }
    } else if (partyPosition.nodeId === nodeId) {
      tokens.push({
        tileId: partyPosition.tileId,
        name: character.name,
        characterId: character.id,
      });
    }
  }
  return tokens;
}

/**
 * Move one character to a location of their own, or back to the party with
 * null. An unknown id leaves the roster unchanged.
 * @param {Character[]} characters
 * @param {string} id
 * @param {EncounterLocation | null} location
 * @returns {Character[]}
 */
export function moveCharacter(characters, id, location) {
  return characters.map((c) => (c.id === id ? { ...c, location } : c));
}

/**
 * True when anyone currently stands apart from the party marker. This tells
 * the caller whether turning off the split-party toggle needs a regroup
 * first.
 * @param {Character[]} characters
 * @returns {boolean}
 */
export function isSplit(characters) {
  return characters.some((c) => (c.location ?? null) !== null);
}

/**
 * Where a character actually stands: their own location when placed, or the
 * shared party position otherwise. This is the regroup target when the GM
 * gathers the party at one member. A location on a node that no longer
 * exists (deleted here, or gone from a save another tab adopted) counts as
 * with the party, so the caller never moves the party onto a missing node.
 * @param {Character} character
 * @param {PartyPosition} partyPosition
 * @param {(nodeId: string) => boolean} [nodeExists] defaults to trusting every node
 * @returns {PartyPosition}
 */
export function characterPosition(character, partyPosition, nodeExists = () => true) {
  const location = character.location ?? null;
  return location && nodeExists(location.nodeId) ? location : partyPosition;
}

/**
 * The characters the GM can regroup at: everyone with the party, plus
 * everyone placed on a node that still exists. A character on a missing node
 * has no tile to gather at, so the picker leaves them out.
 * @param {Character[]} characters
 * @param {(nodeId: string) => boolean} nodeExists
 * @returns {Character[]}
 */
export function regroupCandidates(characters, nodeExists) {
  return characters.filter((c) => !c.location || nodeExists(c.location.nodeId));
}

/**
 * Recall every character to the party marker. This is the whole-party
 * teleport: any individually placed character loses its own location and
 * follows the party again.
 * @param {Character[]} characters
 * @returns {Character[]}
 */
export function recallAll(characters) {
  return characters.map((c) => (c.location ? { ...c, location: null } : c));
}

/**
 * Recall the characters that stand in any of the given nodes. A node edit
 * that removes nodes calls this, so no character keeps a location on a map
 * that no longer exists. Characters elsewhere keep their own location.
 * @param {Character[]} characters
 * @param {Set<string>} nodeIds
 * @returns {Character[]}
 */
export function recallFrom(characters, nodeIds) {
  return characters.map((c) =>
    c.location && nodeIds.has(c.location.nodeId) ? { ...c, location: null } : c,
  );
}

/**
 * Where the characters standing in any of the given nodes are, so a caller
 * that is about to recall them can put them back later. Characters with the
 * party, and characters standing elsewhere, are not in the result.
 * @param {Character[]} characters
 * @param {Set<string>} nodeIds
 * @returns {CharacterPlacement[]}
 */
export function placementsIn(characters, nodeIds) {
  /** @type {CharacterPlacement[]} */
  const placements = [];
  for (const c of characters) {
    const location = c.location ?? null;
    if (location && nodeIds.has(location.nodeId)) {
      placements.push({ characterId: c.id, location });
    }
  }
  return placements;
}

/**
 * Put the recorded characters back where they stood. This is the undo of
 * `recallFrom`. Only the `location` field changes, so any other edit made to
 * a character since the recall stays. A placement for a character who is no
 * longer on the roster is skipped.
 * @param {Character[]} characters
 * @param {CharacterPlacement[]} placements
 * @returns {Character[]}
 */
export function restorePlacements(characters, placements) {
  if (placements.length === 0) return characters;
  const byId = new Map(placements.map((p) => [p.characterId, p.location]));
  return characters.map((c) => (byId.has(c.id) ? { ...c, location: byId.get(c.id) ?? null } : c));
}
