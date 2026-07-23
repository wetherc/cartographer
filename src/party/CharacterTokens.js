/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').EncounterLocation} EncounterLocation */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */

/**
 * Pure logic behind per-character map tokens. A character's `location` is
 * their own position on the world; null means "with the party", i.e. they
 * stand wherever the shared party marker is. The wiring resolves tokens per
 * rendered node through `characterTokens` and moves characters through
 * `moveCharacter`, so both stay testable without a canvas.
 */

/**
 * Resolve which character tokens appear in a node and where. A character with
 * their own location shows on that tile when it's in this node; a character
 * still with the party shows on the party's tile when the party is here.
 * @param {Character[]} characters
 * @param {PartyPosition} partyPosition
 * @param {string} nodeId the node being rendered
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
      tokens.push({ tileId: partyPosition.tileId, name: character.name, characterId: character.id });
    }
  }
  return tokens;
}

/**
 * Move one character to a location of their own (or back to the party with
 * null). Unknown ids leave the roster unchanged.
 * @param {Character[]} characters
 * @param {string} id
 * @param {EncounterLocation | null} location
 * @returns {Character[]}
 */
export function moveCharacter(characters, id, location) {
  return characters.map((c) => (c.id === id ? { ...c, location } : c));
}

/**
 * Whether anyone currently stands apart from the party marker — i.e. whether
 * turning the split-party toggle off needs a regroup first.
 * @param {Character[]} characters
 * @returns {boolean}
 */
export function isSplit(characters) {
  return characters.some((c) => (c.location ?? null) !== null);
}

/**
 * Where a character actually stands: their own location when placed, the
 * shared party position otherwise. This is the regroup target when the GM
 * gathers the party at one member.
 * @param {Character} character
 * @param {PartyPosition} partyPosition
 * @returns {PartyPosition}
 */
export function characterPosition(character, partyPosition) {
  return character.location ?? partyPosition;
}

/**
 * Recall every character to the party marker — the whole-party teleport: any
 * individually placed character drops their own location and follows again.
 * @param {Character[]} characters
 * @returns {Character[]}
 */
export function recallAll(characters) {
  return characters.map((c) => (c.location ? { ...c, location: null } : c));
}
