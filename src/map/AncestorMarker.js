import { parseCoords } from './MapGeometry.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * The tile of an ancestor map where the party marker goes, while the GM
 * looks at a map above the one where the party stands. It is the tile that
 * links down toward the party's map. A region that covers several linked
 * tiles gets the one nearest their middle, so the marker sits inside the
 * block instead of on its corner. The result is null when the map in view
 * is not above the party's map, or when no tile on it links down.
 * @param {MapNode[]} partyPath the breadcrumb from the root to the party's map
 * @param {MapNode} view the map in view
 * @returns {string | null}
 */
export function ancestorMarkerTile(partyPath, view) {
  const index = partyPath.findIndex((node) => node.id === view.id);
  if (index < 0 || index === partyPath.length - 1) return null;
  const childId = partyPath[index + 1].id;
  const linked = view.tiles
    .filter((tile) => tile.childNodeId === childId)
    .map((tile) => ({ id: tile.id, at: parseCoords(tile.id) }))
    .filter((entry) => entry.at !== null);
  if (linked.length === 0) return null;
  const points = linked.map((entry) => /** @type {{ x: number, y: number }} */ (entry.at));
  const midX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const midY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  /** @param {{ x: number, y: number }} p */
  const distance = (p) => (p.x - midX) ** 2 + (p.y - midY) ** 2;
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (distance(points[i]) < distance(points[best])) best = i;
  }
  return linked[best].id;
}
