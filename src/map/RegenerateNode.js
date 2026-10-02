import { collectSubtreeIds } from './WorldTree.js';
import { ENTRANCE_ART, entranceArtFor, relandedTile } from './NodeEdits.js';
import { stairwayTo } from './MapExits.js';
import { ensureChildLink } from './TilePaint.js';
import { repaintRegionBlock } from './RegionRepaint.js';
import { guideSize, terrainGuide } from './GeneratorGuide.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('./EditHistory.js').EditSnapshot} EditSnapshot */
/** @typedef {import('../types/entities.js').CharacterPlacement} CharacterPlacement */
/** @typedef {import('../types/entities.js').CreaturePlacement} CreaturePlacement */
/** @typedef {import('../types/handout.js').HandoutBinding} HandoutBinding */
/** @typedef {import('./EntryMemory.js').EntryMemory} EntryMemory */
/** @typedef {import('../types/map.js').TerrainGuide} TerrainGuide */
/** @typedef {import('./TilePalette.js').TilePalette} TilePalette */

/**
 * What a regeneration does beyond the node's own tiles. A generated layout
 * replaces every tile of the node. Every child the old tiles linked to loses
 * its way in, and a multi-level dungeon leaves its old deeper levels behind
 * under a new level 1 with new stairs. These functions decide which nodes
 * go with the old tiles, where the party and each placed token land, and
 * what undo must record.
 * They are pure, so `app/generateAction.js` stays glue.
 */

/**
 * The nodes the old tiles of `node` link to, with their whole subtrees. A
 * regeneration removes these. A child that no tile links to is already
 * unreachable, and the regeneration leaves it alone. The node itself is
 * never in the result, even when a tile links back to it. Many tiles can
 * link to one child, for example every tile of a region on a world map, so
 * each child subtree is walked once.
 * @param {MapNode[]} nodes every node in the grid
 * @param {MapNode} node the node being regenerated
 * @returns {MapNode[]}
 */
export function linkedDescendants(nodes, node) {
  const children = new Set(
    node.tiles.map((t) => t.childNodeId).filter((id) => id && id !== node.id),
  );
  /** @type {Set<string>} */
  const doomed = new Set();
  for (const child of children) {
    for (const id of collectSubtreeIds(nodes, /** @type {string} */ (child))) doomed.add(id);
  }
  doomed.delete(node.id);
  return nodes.filter((n) => doomed.has(n.id));
}

/**
 * The place of a node in a stack of levels, or null when its parent does not
 * reach it by a staircase. `back` is the tile kind in the node that leads
 * back to the parent (`MapExits.stairwayTo`). `level` is the number of the
 * node in its stack when the node is a level below its parent: the first
 * level, the one a door leads into, is 1, and each staircase down adds 1.
 * A floor above its parent gets level 2, which only a stacked archetype
 * reads. A regeneration passes `level` to the generator, so a level below
 * the first gets stairs up, not a door on the map edge.
 * @param {MapNode} node
 * @param {(node: MapNode) => MapNode | null} parentOf
 * @returns {{ back: 'stairs-up' | 'stairs-down', level: number } | null}
 */
export function stackPlace(node, parentOf) {
  const parent = parentOf(node);
  const stairway = parent ? stairwayTo(parent, node.id) : null;
  if (!parent || !stairway) return null;
  let level = 2;
  if (stairway.back === 'stairs-up') {
    // The seen set stops the walk on a parent loop in a damaged save.
    const seen = new Set([node.id, parent.id]);
    let at = parent;
    let up = parentOf(at);
    while (up && !seen.has(up.id) && stairwayTo(up, at.id)?.back === 'stairs-up') {
      seen.add(up.id);
      level++;
      at = up;
      up = parentOf(at);
    }
  }
  return { back: stairway.back, level };
}

/** The labels that `GeneratorTree.expandTree` adds to the name of a forced sub-map. */
const STACK_LABEL = / \((level \d+|upper floor|dungeons|cellar)\)$/;

/**
 * The name of the map at the top of a stack, for a node named after it.
 * `expandTree` names a forced sub-map as its top map plus a label, for
 * example "Ashford Barrow (level 2)". A regenerated level takes this name as
 * its base, so its new levels read "Ashford Barrow (level 3)", not "Ashford
 * Barrow (level 2) (level 3)".
 * @param {string} name
 * @returns {string}
 */
export function stackBase(name) {
  return name.replace(STACK_LABEL, '');
}

/**
 * The size preset that fits the block of parent tiles linking to a node
 * (`GeneratorGuide.guideSize`), or undefined when no parent tile links to
 * it. The Generate dialog starts on this size, so a regenerated region map
 * has as many cells per parent cell as a region map from world generation.
 * @param {MapNode} parent
 * @param {string} nodeId
 * @returns {string | undefined}
 */
export function blockSize(parent, nodeId) {
  const block = parent.tiles.filter((t) => t.childNodeId === nodeId).map((t) => t.id);
  return block.length ? guideSize(terrainGuide(parent.tiles, block)) : undefined;
}

/**
 * The parent of a regenerated node as the regeneration leaves it, and the
 * terrain guide of the new map. When no parent tile links to the node,
 * `TilePaint.ensureChildLink` stamps a link near the middle of the parent,
 * and `tileId` names that tile. An existing link keeps its tiles, and its
 * marker follows the new archetype. The linked block then takes the ground
 * of a new climate archetype (`RegionRepaint.repaintRegionBlock`).
 *
 * `guide` reads the finished block (`GeneratorGuide.terrainGuide`), so an
 * open-terrain map draws the land, the coasts, and the rivers of its block
 * at a larger scale, the same as a region map from world generation. It is
 * undefined when the parent has no room for a link. The town, world, and
 * interior archetypes ignore it.
 *
 * The Generate preview and the accepted regeneration both call this with an
 * RNG seeded from the dialog seed. A random repaint then gives the preview
 * the same block, and so the same map, that the GM accepts.
 * @param {{
 *   parent: MapNode,
 *   nodeId: string,
 *   archetype: string,
 *   palette: TilePalette,
 *   rng: () => number,
 * }} opts
 * @returns {{ node: MapNode, tileId: string | null, guide?: TerrainGuide }}
 */
export function reshapeParent({ parent, nodeId, archetype, palette, rng }) {
  const art = entranceArtFor(archetype);
  const linked = ensureChildLink(parent, nodeId, {
    // A wilderness gets no marker. Its link uses the terrain tile, or a new
    // grass tile, and shows as a region outline once discovered.
    markerRef: art ? (palette.get(art.marker)?.imageRef ?? null) : null,
    createRef: palette.pickVariant('grass', rng).imageRef,
    poiType: art ? art.poi : null,
    genericRefs: new Set(
      Object.values(ENTRANCE_ART).map((entry) => palette.get(entry.marker)?.imageRef ?? ''),
    ),
  });
  const node = repaintRegionBlock(linked.node, nodeId, archetype, palette, rng);
  const block = node.tiles.filter((t) => t.childNodeId === nodeId).map((t) => t.id);
  if (!block.length) return { node, tileId: linked.tileId };
  return { node, tileId: linked.tileId, guide: terrainGuide(node.tiles, block) };
}

/**
 * Where the party goes after a regeneration, or null to stay put. A party
 * standing in a removed node lands on the new layout's entry tile. A party
 * in the node itself follows `NodeEdits.relandedTile`: it stays when its
 * tile is still walkable, and moves to the nearest walkable tile or the
 * entry otherwise. A party elsewhere does not move.
 * @param {{
 *   position: PartyPosition,
 *   nodeId: string,
 *   removedIds: Set<string>,
 *   width: number,
 *   height: number,
 *   entry: string,
 *   landing: string,
 * }} opts `landing` is `EntryPoint.resolveEntryTile`'s answer for the
 *   party's current tile on the new layout
 * @returns {PartyPosition | null}
 */
export function regenerateLanding({ position, nodeId, removedIds, width, height, entry, landing }) {
  if (removedIds.has(position.nodeId)) return { nodeId, tileId: entry };
  if (position.nodeId !== nodeId) return null;
  const tileId = relandedTile({ tileId: position.tileId, width, height, entry, landing });
  return tileId ? { nodeId, tileId } : null;
}

/**
 * Where each token standing in a regenerated node goes. A token is a split
 * character or a placed creature: both hold a location of their own, and the
 * new layout can turn the tile they hold into wall or void, or shrink past
 * it. Each token follows the rule the party follows
 * (`NodeEdits.relandedTile`): a tile outside the new extent goes to the
 * layout's entry tile, and a tile inside it goes wherever the node's entry
 * rules resolve for it. A token with no location of its own, or one standing
 * in another node, is not in the result, and neither is one whose tile is
 * still good.
 *
 * `landingFor` is a callback so this function never reads a node. The caller
 * passes `EntryPoint.resolveEntryTile` bound to the regenerated node.
 * @param {{
 *   tokens: { id: string, location?: { nodeId: string, tileId: string } | null }[],
 *   nodeId: string,
 *   width: number,
 *   height: number,
 *   entry: string,
 *   landingFor: (tileId: string) => string,
 * }} opts
 * @returns {{ id: string, tileId: string }[]}
 */
export function regenerateTokenMoves({ tokens, nodeId, width, height, entry, landingFor }) {
  /** @type {{ id: string, tileId: string }[]} */
  const moves = [];
  for (const token of tokens) {
    const location = token.location ?? null;
    if (!location || location.nodeId !== nodeId) continue;
    const tileId = relandedTile({
      tileId: location.tileId,
      width,
      height,
      entry,
      landing: landingFor(location.tileId),
    });
    if (tileId) moves.push({ id: token.id, tileId });
  }
  return moves;
}

/**
 * The undo record for a regeneration. It holds the node and its parent as
 * they were, the ids of the deeper levels the generator created, the nodes
 * the regeneration removed, where the party stood, the entry memory, and
 * what the regeneration did to every other location. A character or a
 * creature in a removed node comes back to the party marker or to no place
 * at all, one in the node itself re-lands on the new layout, and a handout
 * bound to a removed node becomes campaign-wide. Undo needs each of those
 * as it stood.
 * @param {{
 *   node: MapNode,
 *   parent: MapNode | null,
 *   created: string[],
 *   removed: MapNode[],
 *   party: PartyPosition,
 *   recalled: CharacterPlacement[],
 *   creatures: CreaturePlacement[],
 *   handouts: HandoutBinding[],
 *   entryTiles: EntryMemory,
 * }} opts
 * @returns {EditSnapshot}
 */
export function regenerateSnapshot({
  node,
  parent,
  created,
  removed,
  party,
  recalled,
  creatures,
  handouts,
  entryTiles,
}) {
  return {
    nodes: parent ? [node, parent] : [node],
    after: null,
    created,
    removed,
    party,
    recalled,
    creatures,
    handouts,
    entryTiles,
  };
}
