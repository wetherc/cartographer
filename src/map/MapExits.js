import { NEIGHBORS4, inBounds, parseCoords, tileIdAt } from './MapGeometry.js';
import { findRegionGroups } from './RegionGroups.js';
import { getTile } from './TileGrid.js';
import { tileKind } from './TileKinds.js';
import { tileAtXY } from './TileIndex.js';
import { describeTile } from './TileCoords.js';
import { crossingFor } from './RegionCrossing.js';
import { memoizeByIdentity, memoizeByIdentity2 } from '../util/memoize.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').MapExit} MapExit */
/** @typedef {import('../types/map.js').ExitSide} ExitSide */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * The four sides of a node, with the direction each side leads to. This list
 * is defined once here. The exit finder, the return-tile geometry, and the
 * renderer all use the same order.
 * @type {{ side: ExitSide, dx: number, dy: number }[]}
 */
export const EXIT_SIDES = [
  { side: 'north', dx: 0, dy: -1 },
  { side: 'east', dx: 1, dy: 0 },
  { side: 'south', dx: 0, dy: 1 },
  { side: 'west', dx: -1, dy: 0 },
];

/**
 * Ways out of a node, back to the parent node. EntryPoint models the zoom into
 * a child. This function models the opposite direction. The map draws a
 * return arrow or badge from this data.
 *
 * An outdoor child reports one `edge` exit for each side of its block that
 * touches painted parent tiles. If the party walks off that side, they return
 * to the terrain they crossed to enter. An interior reports one `tile` exit
 * for each outer door and each unlinked staircase back to the parent level.
 * These are the authored ways in and out of the structure.
 *
 * A node with neither exit type reports one `fallback` exit instead of none.
 * This can occur for an interior the GM sealed, or a child whose parent block
 * sits in unpainted terrain. The fallback exit lets the party always leave a
 * space they entered.
 *
 * `throughTileId` is the parent tile the party zoomed through, when the
 * caller knows it. It matters only for a child that two blocks of the parent
 * link to, such as a cave with two mouths: the exits are then the sides of
 * the block the party came in by. Without it, the exits are the sides of
 * every block, so no way out is hidden from a party that arrived by teleport
 * or is looking at the node after a reload.
 *
 * `at` is the traveler's cell in the node, when the caller knows it. An
 * edge exit then records the traveler's coordinate along its side, and the
 * band on the map centers there. When the region across the border at that
 * point is another outdoor child of the same parent, the edge exit crosses
 * into it (`RegionCrossing.crossingFor`) and names it as its target, with
 * the parent cell it crosses into as `crossTileId`. `nodeById` looks up
 * that region.
 *
 * @param {MapNode | null} node node the party is in
 * @param {MapNode | null} parent its parent, or null at the root
 * @param {string | null} [throughTileId] parent tile the party entered through
 * @param {{ at?: { x: number, y: number } | null, nodeById?: (id: string) => MapNode | null | undefined }} [options]
 * @returns {MapExit[]}
 */
export function findExits(node, parent, throughTileId = null, options = {}) {
  if (!node || !parent) return [];
  const target = { targetNodeId: parent.id, targetName: parent.name };
  const exits =
    node.kind === 'interior'
      ? interiorExits(node, parent)
      : edgeExits(node, parent, target, throughTileId, options);
  if (exits.length) return exits;
  return [{ kind: 'fallback', ...target }];
}

/**
 * The sides of the parent's region blocks that touch usable parent terrain. A
 * side counts when at least one cell of a block has an orthogonal neighbor
 * in the parent with an image, and that neighbor is not part of the block.
 * This function checks each block cell by cell. A block in blank terrain, or
 * flush against the parent's own edge, contributes no side. Diagonal contact
 * past a corner does not count, because the party has nothing to step onto
 * there.
 *
 * The party's own block answers alone when `throughTileId` names it.
 * Otherwise every block linked to the child answers, and the sides are the
 * union. A side one block reports and another does not is still a way out:
 * the return landing puts the party beside the block it came in by, and
 * falls back to the first block when that is unknown.
 * @param {MapNode} node
 * @param {MapNode} parent
 * @param {{ targetNodeId: string, targetName: string }} target
 * @param {string | null} throughTileId
 * @param {{ at?: { x: number, y: number } | null, nodeById?: (id: string) => MapNode | null | undefined }} options
 * @returns {MapExit[]}
 */
function edgeExits(node, parent, target, throughTileId, { at = null, nodeById = () => null }) {
  const blocks = blocksFor(parent, node.id);
  if (blocks.length === 0) return [];
  const through = throughTileId ? blocks.find((g) => g.tileIds.includes(throughTileId)) : null;
  const scope = through ? [through] : blocks;
  /** @type {Set<ExitSide>} */
  const sides = new Set();
  for (const group of scope) {
    for (const { side, dx, dy } of EXIT_SIDES) {
      if (sides.has(side)) continue;
      const abuts = group.cells.some((cell) => {
        const tile = getTile(parent, tileIdAt(cell.x + dx, cell.y + dy));
        return !!tile && !!tile.imageRef && tile.childNodeId !== node.id;
      });
      if (abuts) sides.add(side);
    }
  }
  // EXIT_SIDES order, not the order the sides were found, so the renderer and
  // the accessible button list agree however the blocks are laid out.
  const home = through ?? blocks[0];
  return EXIT_SIDES.filter(({ side }) => sides.has(side)).map(({ side }) => {
    const cross = at ? crossingFor(parent, node, home, side, at, nodeById) : null;
    return {
      kind: /** @type {const} */ ('edge'),
      side,
      ...(cross
        ? {
            targetNodeId: cross.target.id,
            targetName: cross.target.name,
            crossTileId: cross.tileId,
          }
        : target),
      ...(at ? { along: sideAxis(side) === 'x' ? at.x : at.y } : {}),
    };
  });
}

/**
 * The door and stairway tiles that lead out of an interior. A door qualifies
 * when it opens to the outside of the structure. It can sit on the grid
 * border, or beside an empty cell (the void a generated dungeon leaves around
 * its rooms). A staircase qualifies only when it is the one tile the parent
 * level connects through. The function stairwayTo resolves this in either
 * direction. A crypt level below leaves through its stairs up. An upper
 * storey above leaves through its stairs down. A keep with a door entrance
 * has neither case. Its own staircases lead to floors the map does not
 * model. This function skips a tile that already links to a child node,
 * because that tile leads further in, not out.
 *
 * The result is memoized on the node and parent objects, because the Build
 * world tree asks for the warning of every node at each stroke end, and a
 * stroke changes one node. Treat the result as read only.
 * @type {(node: MapNode, parent: MapNode) => MapExit[]}
 */
const interiorExits = memoizeByIdentity2((node, parent) => {
  const target = { targetNodeId: parent.id, targetName: parent.name };
  const back = stairwayTo(parent, node.id)?.back ?? null;
  /** @type {MapExit[]} */
  const exits = [];
  for (const tile of node.tiles) {
    if (tile.childNodeId) continue;
    const kind = tileKind(tile);
    if (back && kind === back) {
      exits.push({ kind: 'tile', tileId: tile.id, via: back, ...target });
    } else if (kind === 'door' && opensOutward(node, tile)) {
      exits.push({ kind: 'tile', tileId: tile.id, via: 'door', ...target });
    }
  }
  // Sort the exits so the renderer and the accessible button list use the
  // same order, regardless of tile array order.
  return exits.sort((a, b) => exitTileId(a).localeCompare(exitTileId(b)));
});

/** @param {MapExit} exit @returns {string} */
function exitTileId(exit) {
  return exit.kind === 'tile' ? exit.tileId : '';
}

/**
 * Whether a door has the outside of the structure on one side of it.
 * @param {MapNode} node
 * @param {Tile} tile
 * @returns {boolean}
 */
export function opensOutward(node, tile) {
  const coords = parseCoords(tile.id);
  if (!coords) return false;
  const onBorder =
    coords.x === 0 || coords.y === 0 || coords.x === node.width - 1 || coords.y === node.height - 1;
  if (onBorder) return true;
  return NEIGHBORS4.some(([dx, dy]) => {
    const neighbor = getTile(node, tileIdAt(coords.x + dx, coords.y + dy));
    return !neighbor || !neighbor.imageRef;
  });
}

/**
 * Which tile kind leads back the way a stairway came. If the parent reaches a
 * child through stairs down, the parent is the level above the child, and the
 * child returns through its stairs up. If the parent reaches a child through
 * stairs up, the parent is the level below the child, like a castle's ground
 * floor below its upper storey, and the child returns through its stairs
 * down. Any other kind of link, such as a town's door into a keep, is not a
 * stacked level and has no stairway back.
 * @param {string | undefined} kind
 * @returns {'stairs-up' | 'stairs-down' | null}
 */
function stairwayBack(kind) {
  if (kind === 'stairs-down') return 'stairs-up';
  if (kind === 'stairs-up') return 'stairs-down';
  return null;
}

/**
 * The parent's stairway tile that leads to a child, with the matching tile
 * kind in the child. This is the one authored connection between two stacked
 * levels. The party uses it to leave the parent and to arrive back in the
 * parent. It is what makes the child's own staircase a way out.
 *
 * A parent can link the same child from both a stairs-down tile and a
 * stairs-up tile. This is a contradiction. In this case, the descent wins,
 * because a level below is the more common shape, and existing maps already
 * resolved to it before the ascent was modelled.
 *
 * The answers for every child of a parent come from one scan of its tiles,
 * cached on the tile list. A Build stroke end asks once for each node, so
 * the scan runs once for each parent and not once for each child. Treat the
 * result as read only.
 * @param {MapNode} parent
 * @param {string} childNodeId
 * @returns {{ tile: Tile, back: 'stairs-up' | 'stairs-down' } | null}
 */
export function stairwayTo(parent, childNodeId) {
  return stairwaysOf(parent.tiles).get(childNodeId) ?? null;
}

/**
 * The stairway of each child that a tile list links to, by child node id.
 * @type {(tiles: Tile[]) => Map<string, { tile: Tile, back: 'stairs-up' | 'stairs-down' }>}
 */
const stairwaysOf = memoizeByIdentity((tiles) => {
  /** @type {Map<string, { tile: Tile, back: 'stairs-up' | 'stairs-down' }>} */
  const found = new Map();
  for (const tile of tiles) {
    if (!tile.childNodeId) continue;
    const back = stairwayBack(tileKind(tile));
    if (!back) continue;
    // A child that returns through its stairs up is one the parent descends
    // into. This is the descent case given precedence above, so the first
    // such tile replaces a stairs-down tile found before it.
    const known = found.get(tile.childNodeId);
    if (!known || (back === 'stairs-up' && known.back !== 'stairs-up')) {
      found.set(tile.childNodeId, { tile, back });
    }
  }
  return found;
});

/**
 * Every block a child node occupies in its parent, in the order
 * `findRegionGroups` reports them. A parent can link one child from two
 * blocks that do not touch, for example a cave with two mouths, and both are
 * real ways in.
 * @param {MapNode} parent
 * @param {string} childNodeId
 * @returns {RegionGroup[]}
 */
export function blocksFor(parent, childNodeId) {
  return findRegionGroups(parent).filter((g) => g.childNodeId === childNodeId);
}

/**
 * The one block of a child that the party is in, or null when no parent tile
 * links to the child. For a child linked from two blocks that do not touch,
 * the block that holds `throughTileId`, the parent tile the party zoomed
 * through, is the one the party is in. The function returns the first block
 * when no tile is given, or when the tile belongs to no block of this child.
 * @param {MapNode} parent
 * @param {string} childNodeId
 * @param {string | null} [throughTileId] parent tile the party entered through
 * @returns {RegionGroup | null}
 */
export function blockFor(parent, childNodeId, throughTileId = null) {
  const blocks = blocksFor(parent, childNodeId);
  const through = throughTileId ? blocks.find((g) => g.tileIds.includes(throughTileId)) : null;
  return through ?? blocks[0] ?? null;
}

/**
 * The exit at a tile, if any. The click path uses this to look up a door or
 * stairway the party can leave through.
 * @param {MapExit[]} exits
 * @param {string} tileId
 * @returns {MapExit | null}
 */
export function exitForTile(exits, tileId) {
  return exits.find((e) => e.kind === 'tile' && e.tileId === tileId) ?? null;
}

/**
 * The exit on one side of the map, if there is one.
 * @param {MapExit[]} exits
 * @param {ExitSide} side
 * @returns {MapExit | null}
 */
export function exitForSide(exits, side) {
  return exits.find((e) => e.kind === 'edge' && e.side === side) ?? null;
}

/**
 * Whether an interior has no authored way out, so Build mode can report it.
 * A GM can still leave through the fallback exit in Play mode, findExits
 * returns one. A sealed interior nearly always means an unfinished map, not
 * an intent.
 * @param {MapNode | null} node
 * @param {MapNode | null} parent
 * @returns {boolean}
 */
export function isSealedInterior(node, parent) {
  if (!node || !parent || node.kind !== 'interior') return false;
  return findExits(node, parent).every((e) => e.kind === 'fallback');
}

/**
 * What Build mode tells a GM about the node in view, or null when there is
 * nothing to say. The problems are listed in the order a GM must solve them.
 *
 * A node with no parent tile link is unreachable. The party can never walk
 * into it, and players never see what is painted inside. This check comes
 * first because the link also decides the later answers. A staircase counts
 * as a way out only in the direction the link runs. Advice about stairs
 * before a link exists is a guess.
 *
 * The next check is a linked node where every exit is the fallback exit. For
 * a sealed interior, only the staircase back to the parent level counts, see
 * interiorExits. The warning names only that direction. A crypt level is told
 * about its stairs up. An upper storey is told about its stairs down. A keep
 * entered through a town door is told about a door alone, because stairs
 * there does not clear the warning. For an outdoor child, this case means
 * the block sits in blank parent terrain with nothing beside it to walk
 * onto. The fix for that case is painted on the parent, not here.
 *
 * All of these are warnings about an unfinished map, not about a stuck
 * party. findExits always gives Play mode a fallback exit.
 *
 * The Build world tree asks for the warning of every node at each stroke
 * end, and a stroke changes one node, so the answer is memoized on the node
 * and parent objects. With 273 nodes the pass costs 0.02 ms where it costs
 * 1.1 ms without the memo.
 *
 * @param {MapNode | null} node
 * @param {MapNode | null} parent
 * @returns {string | null}
 */
export function authoringWarning(node, parent) {
  return node && parent ? warningFor(node, parent) : null;
}

/**
 * True when no tile of the parent links to the node, so the fix is a Region
 * stroke on the parent. The Build warning then offers a button that opens
 * the parent with the Region brush set to this node.
 * @param {MapNode | null} node
 * @param {MapNode | null} parent
 * @returns {boolean}
 */
export function needsLink(node, parent) {
  return !!node && !!parent && !blockFor(parent, node.id);
}

/** @type {(node: MapNode, parent: MapNode) => string | null} */
const warningFor = memoizeByIdentity2((node, parent) => {
  if (!blockFor(parent, node.id)) {
    return `Nothing leads here: link a tile on ${parent.name} to this map.`;
  }
  if (!findExits(node, parent).every((e) => e.kind === 'fallback')) return null;
  if (node.kind !== 'interior') {
    return `No way out: paint terrain on ${parent.name} beside the tiles that link here.`;
  }
  const back = stairwayTo(parent, node.id)?.back ?? null;
  return back
    ? `No way out: paint a ${back} tile, or a door on an outer wall.`
    : 'No way out: paint a door on an outer wall.';
});

/**
 * Which side of a node a cell is nearest to. This decides where a door leads
 * out, and where the party lands in the parent when they use it.
 * @param {MapNode} node
 * @param {{ x: number, y: number }} coords
 * @returns {ExitSide}
 */
export function nearestSide(node, coords) {
  const distances = sideDistances(node, coords);
  return distances.reduce((best, entry) => (entry.d < best.d ? entry : best)).side;
}

/**
 * The distance in tiles from a cell to each side of a node, with the sides
 * in the tie-break order of nearestSide.
 * @param {MapNode} node
 * @param {{ x: number, y: number }} coords
 * @returns {{ side: ExitSide, d: number }[]}
 */
function sideDistances(node, coords) {
  return [
    { side: 'north', d: coords.y },
    { side: 'west', d: coords.x },
    { side: 'south', d: node.height - 1 - coords.y },
    { side: 'east', d: node.width - 1 - coords.x },
  ];
}

/**
 * How near an edge the traveler stands before its arrow shows, in sight
 * radii. A traveler in the middle of a large map sees no arrows, so the
 * gutter does not frame the whole map with ways out that are far away.
 */
export const EXIT_REACH_SIGHTS = 3;

/**
 * The exits to show while the traveler stands at `at`. An edge exit shows
 * only when the traveler is at most `reach` tiles from the painted edge of
 * the node on its side (see `paintedDistance`). A tile exit or the fallback
 * always shows. With no traveler in the node, every exit shows, because no
 * distance can be measured.
 * @param {MapNode} node
 * @param {MapExit[]} exits
 * @param {{ x: number, y: number } | null} at
 * @param {number} reach
 * @returns {MapExit[]}
 */
export function exitsInReach(node, exits, at, reach) {
  if (!at) return exits;
  const near = new Set(
    EXIT_SIDES.flatMap(({ side, dx, dy }) =>
      paintedDistance(node, at, dx, dy) <= reach ? [side] : [],
    ),
  );
  return exits.filter((exit) => exit.kind !== 'edge' || near.has(exit.side));
}

/**
 * How many tiles a traveler at `at` walks in the direction (dx, dy) before
 * the next step leaves the painted part of the node: off the grid, or onto a
 * blank cell. A guided region has blank cells outside the outline of its
 * block, so a traveler on the coast of a region that does not fill its grid
 * stands at the edge even far from the grid border. A traveler on a blank
 * cell, such as a party on a map that the GM has not painted yet, measures
 * to the grid border instead.
 * @param {MapNode} node
 * @param {{ x: number, y: number }} at
 * @param {number} dx @param {number} dy
 * @returns {number}
 */
export function paintedDistance(node, at, dx, dy) {
  const painted = Boolean(tileAtXY(node, at.x, at.y));
  /** @param {number} x @param {number} y */
  const inside = (x, y) => (painted ? Boolean(tileAtXY(node, x, y)) : inBounds(node, x, y));
  let d = 0;
  while (inside(at.x + dx * (d + 1), at.y + dy * (d + 1))) d++;
  return d;
}

/** Which axis a side runs along: sides on the north/south run along x. */
/** @param {ExitSide} side @returns {'x' | 'y'} */
export function sideAxis(side) {
  return side === 'north' || side === 'south' ? 'x' : 'y';
}

/**
 * The text on an exit's arrow, and on its button in the accessible exit list.
 * A border crossing with no target name is one that a player tab cannot see
 * past yet, so its label does not name the region. An edge that goes up to
 * the parent map reads "Leave to", so a GM can tell it apart from a crossing
 * into a neighbour region on the same side.
 * @param {MapExit} exit
 * @returns {string}
 */
export function exitLabel(exit) {
  if (exit.kind === 'edge' && exit.crossTileId) {
    return exit.targetName ? `Cross into ${exit.targetName}` : 'Cross the border';
  }
  if (exit.kind === 'edge') return `Leave to ${exit.targetName}`;
  return `Return to ${exit.targetName}`;
}

/**
 * The words for a tile exit's kind. The tile kinds are hyphenated in the
 * palette and the warning copy, which name pieces a GM paints. This function
 * returns a plain phrase instead.
 * @param {'door' | 'stairs-up' | 'stairs-down'} via
 * @returns {string}
 */
function viaText(via) {
  if (via === 'door') return 'door';
  return via === 'stairs-up' ? 'stairs up' : 'stairs down';
}

/**
 * A longer form for assistive technology. It has no arrow to look at, so it
 * needs the way out named directly.
 * @param {MapExit} exit
 * @returns {string}
 */
export function exitDescription(exit) {
  if (exit.kind === 'edge') return `${exitLabel(exit)}, off the ${exit.side} edge of the map`;
  if (exit.kind === 'tile') {
    return `${exitLabel(exit)}, through the ${viaText(exit.via)} at ${describeTile(exit.tileId)}`;
  }
  return exitLabel(exit);
}
