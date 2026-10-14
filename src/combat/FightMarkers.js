/**
 * The danger markers of the read-only fight map on the combat screen. The
 * Play map draws its red diamond only on the tile of a hostile creature that
 * still stands. The fight map applies the same rule to the creatures of the
 * running order, so a companion, a summoned ally, or a defeated foe gets no
 * diamond on either map.
 */

import { isDowned, sideOf } from './CombatView.js';

/** @typedef {import('./CombatView.js').ResolvedCombatant} ResolvedCombatant */

/**
 * The tile ids on `nodeId` that hold a standing foe of the order, each once,
 * in order of the first foe on that tile.
 * @param {{ id: string }[]} order the participants of the running fight
 * @param {string} nodeId the node that the fight map draws
 * @param {(id: string) => ResolvedCombatant | null} resolve
 * @returns {string[]}
 */
export function foeTiles(order, nodeId, resolve) {
  const tiles = new Set();
  for (const p of order) {
    const found = resolve(p.id);
    if (found?.kind !== 'creature' || sideOf(found) !== 'foe' || isDowned(found)) continue;
    const at = found.entity.location;
    if (at && at.nodeId === nodeId) tiles.add(at.tileId);
  }
  return [...tiles];
}
