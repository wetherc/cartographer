import { NEIGHBORS4, parseCoords, tileIdAt } from './MapGeometry.js';
import { findRegionGroups } from './RegionGroups.js';
import { getTile } from './TileGrid.js';
import { kindOf } from './TilePalette.js';
import { clamp } from '../util/num.js';
import { labelSize } from './CanvasText.js';

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
 * An exit label rides inside its band, which is sized from the tile too, so the
 * label stays between the coordinate digits and a character name in weight.
 * The band's width is computed from this size, so the geometry and the drawing
 * both take it from here.
 */
const EXIT_LABEL_SCALE = { factor: 0.28, min: 12, max: 26 };

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
 * @param {MapNode | null} node node the party is in
 * @param {MapNode | null} parent its parent, or null at the root
 * @returns {MapExit[]}
 */
export function findExits(node, parent) {
  if (!node || !parent) return [];
  const target = { targetNodeId: parent.id, targetName: parent.name };
  const exits =
    node.kind === 'interior'
      ? interiorExits(node, parent, target)
      : edgeExits(node, parent, target);
  if (exits.length) return exits;
  return [{ kind: 'fallback', ...target }];
}

/**
 * The sides of the parent's region block that touch usable parent terrain. A
 * side counts when at least one cell of the block has an orthogonal neighbor
 * in the parent with an image, and that neighbor is not part of the block.
 * This function checks the block cell by cell. A block in blank terrain, or
 * flush against the parent's own edge, reports that side as no way out.
 * Diagonal contact past a corner does not count, because the party has
 * nothing to step onto there.
 * @param {MapNode} node
 * @param {MapNode} parent
 * @param {{ targetNodeId: string, targetName: string }} target
 * @returns {MapExit[]}
 */
function edgeExits(node, parent, target) {
  const group = blockFor(parent, node.id);
  if (!group) return [];
  /** @type {MapExit[]} */
  const exits = [];
  for (const { side, dx, dy } of EXIT_SIDES) {
    const abuts = group.cells.some((cell) => {
      const tile = getTile(parent, tileIdAt(cell.x + dx, cell.y + dy));
      return !!tile && !!tile.imageRef && tile.childNodeId !== node.id;
    });
    if (abuts) exits.push({ kind: 'edge', side, ...target });
  }
  return exits;
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
 * @param {MapNode} node
 * @param {MapNode} parent
 * @param {{ targetNodeId: string, targetName: string }} target
 * @returns {MapExit[]}
 */
function interiorExits(node, parent, target) {
  const back = stairwayTo(parent, node.id)?.back ?? null;
  /** @type {MapExit[]} */
  const exits = [];
  for (const tile of node.tiles) {
    if (tile.childNodeId) continue;
    const kind = kindOf(tile.imageRef);
    if (back && kind === back) {
      exits.push({ kind: 'tile', tileId: tile.id, via: back, ...target });
    } else if (kind === 'door' && opensOutward(node, tile)) {
      exits.push({ kind: 'tile', tileId: tile.id, via: 'door', ...target });
    }
  }
  // Sort the exits so the renderer and the accessible button list use the
  // same order, regardless of tile array order.
  return exits.sort((a, b) => exitTileId(a).localeCompare(exitTileId(b)));
}

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
function opensOutward(node, tile) {
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
 * @param {MapNode} parent
 * @param {string} childNodeId
 * @returns {{ tile: Tile, back: 'stairs-up' | 'stairs-down' } | null}
 */
export function stairwayTo(parent, childNodeId) {
  /** @type {{ tile: Tile, back: 'stairs-up' | 'stairs-down' } | null} */
  let found = null;
  for (const tile of parent.tiles) {
    if (tile.childNodeId !== childNodeId) continue;
    const back = stairwayBack(kindOf(tile.imageRef));
    if (!back) continue;
    // A child that returns through its stairs up is one the parent descends
    // into. This is the descent case given precedence above.
    if (back === 'stairs-up') return { tile, back };
    found = found ?? { tile, back };
  }
  return found;
}

/**
 * The block a child node occupies in its parent, or null when no parent tile
 * links to it.
 * @param {MapNode} parent
 * @param {string} childNodeId
 * @returns {RegionGroup | null}
 */
export function blockFor(parent, childNodeId) {
  return findRegionGroups(parent).find((g) => g.childNodeId === childNodeId) ?? null;
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
 * @param {MapNode | null} node
 * @param {MapNode | null} parent
 * @returns {string | null}
 */
export function authoringWarning(node, parent) {
  if (!node || !parent) return null;
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
}

/**
 * Which side of a node a cell is nearest to. This decides where a door leads
 * out, and where the party lands in the parent when they use it.
 * @param {MapNode} node
 * @param {{ x: number, y: number }} coords
 * @returns {ExitSide}
 */
export function nearestSide(node, coords) {
  /** @type {{ side: ExitSide, d: number }[]} */
  const distances = [
    { side: 'north', d: coords.y },
    { side: 'west', d: coords.x },
    { side: 'south', d: node.height - 1 - coords.y },
    { side: 'east', d: node.width - 1 - coords.x },
  ];
  return distances.reduce((best, entry) => (entry.d < best.d ? entry : best)).side;
}

/** Which axis a side runs along: sides on the north/south run along x. */
/** @param {ExitSide} side @returns {'x' | 'y'} */
export function sideAxis(side) {
  return side === 'north' || side === 'south' ? 'x' : 'y';
}

/**
 * The view geometry used to compute an exit band's rect. These fields match
 * what the renderer already holds in its view snapshot. One extra field
 * gives the cell along the side the band centers on, the party's row
 * or column.
 * @typedef {Object} ExitBandGeometry
 * @property {number} width node width in tiles
 * @property {number} height node height in tiles
 * @property {number} tileSize base tile size in buffer px at scale 1
 * @property {number} offsetX pan offset in buffer px
 * @property {number} offsetY pan offset in buffer px
 * @property {number} scale zoom factor
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {number} alongCell cell index along the side to centre the band on
 */

/** The band's rect in buffer px, with the type size its label is drawn at. */
/** @typedef {{ x: number, y: number, w: number, h: number, fontSize: number }} ExitBand */

/**
 * The view state used to place an exit band: the pan, zoom, and canvas
 * fields from the renderer's view snapshot. The fields are named
 * structurally so this module has no canvas dependency.
 * @typedef {Object} ExitBandView
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {string | null} [partyTileId]
 */

/**
 * The geometry used to compute one edge exit's band, read from live view
 * state. The band tracks the party along the side it leads off. An arrow
 * beside the party shows the way out, and stays on-screen on a long map
 * while the party is on-screen. If the party is elsewhere, in a node no one
 * stands in, the band centers on the side instead.
 *
 * Both the renderer and the pointer build their geometry here. This makes
 * sure that the arrow the GM sees and the rect the click test uses can never
 * differ.
 * @param {MapNode} node node being drawn
 * @param {ExitBandView} view
 * @param {number} tileSize base tile size in buffer px at scale 1
 * @param {MapExit} exit
 * @returns {ExitBandGeometry}
 */
export function exitBandGeometry(node, view, tileSize, exit) {
  const side = exit.kind === 'edge' ? exit.side : 'north';
  const axis = sideAxis(side);
  const party = view.partyTileId ? parseCoords(view.partyTileId) : null;
  const extent = axis === 'x' ? node.width : node.height;
  const alongCell = party ? (axis === 'x' ? party.x : party.y) : Math.floor((extent - 1) / 2);
  return {
    width: node.width,
    height: node.height,
    tileSize,
    offsetX: view.offsetX,
    offsetY: view.offsetY,
    scale: view.scale,
    canvasWidth: view.canvasWidth,
    canvasHeight: view.canvasHeight,
    alongCell,
  };
}

/**
 * The rect an edge exit's arrow is drawn in, and clicked in. This is a
 * bounded pill, not a whole side of the gutter, because the click target
 * must match what the GM can see. An unbounded band catches every click
 * that missed the map. The rect sits just outside the map border, centered
 * on the cell the party stands on along that side. It is clamped to stay on
 * the canvas. If the GM pans the map edge out of view, the arrow stays
 * pinned at the viewport edge instead of scrolling away.
 *
 * This is pure geometry with no ctx parameter. The renderer draws this rect,
 * and the pointer hit-tests it, so the two cannot disagree about the
 * arrow's position. A band wider than its gutter ends up clamped over the
 * map's own tiles. For this reason, the pointer tests bands before it
 * resolves a cell, so the click always lands on what the GM can see. The
 * label width is estimated from the character count for the same reason,
 * because measureText ties the rect to a canvas.
 * @param {MapExit} exit
 * @param {ExitBandGeometry} geom
 * @returns {ExitBand}
 */
export function edgeExitBand(exit, geom) {
  const side = exit.kind === 'edge' ? exit.side : 'north';
  const size = geom.tileSize * geom.scale;
  const fontSize = labelSize(size, EXIT_LABEL_SCALE);
  const label = exitLabel(exit);
  // Leave room for the chevron, the gap after it, and the label at the
  // average glyph width of the sans-serif stack.
  const w = Math.min(
    Math.max(geom.canvasWidth - 16, 40),
    fontSize * 1.9 + label.length * fontSize * 0.54,
  );
  const h = Math.round(clamp(size * 0.8, 26, 46));
  // A gap of 0.55 of a cell clears the coordinate labels, which hang half a
  // cell off the top and left edges.
  const gap = Math.max(10, size * 0.55);
  const along = clamp(geom.alongCell, 0, Math.max(0, sideLength(geom, side) - 1));
  let x;
  let y;
  if (side === 'north' || side === 'south') {
    x = geom.offsetX + (along + 0.5) * size - w / 2;
    y = side === 'north' ? geom.offsetY - gap - h : geom.offsetY + geom.height * size + gap;
  } else {
    y = geom.offsetY + (along + 0.5) * size - h / 2;
    x = side === 'west' ? geom.offsetX - gap - w : geom.offsetX + geom.width * size + gap;
  }
  return {
    x: clamp(x, 8, Math.max(8, geom.canvasWidth - w - 8)),
    y: clamp(y, 8, Math.max(8, geom.canvasHeight - h - 8)),
    w,
    h,
    fontSize,
  };
}

/**
 * Whether a buffer-space point falls inside an exit's band.
 * @param {MapExit} exit
 * @param {ExitBandGeometry} geom
 * @param {number} bufferX
 * @param {number} bufferY
 * @returns {boolean}
 */
export function hitExitBand(exit, geom, bufferX, bufferY) {
  const band = edgeExitBand(exit, geom);
  return (
    bufferX >= band.x &&
    bufferX <= band.x + band.w &&
    bufferY >= band.y &&
    bufferY <= band.y + band.h
  );
}

/**
 * The text on an exit's arrow, and on its button in the accessible exit list.
 * @param {MapExit} exit
 * @returns {string}
 */
export function exitLabel(exit) {
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
    return `${exitLabel(exit)}, through the ${viaText(exit.via)} at ${exit.tileId}`;
  }
  return exitLabel(exit);
}

/** @param {ExitBandGeometry} geom @param {ExitSide} side @returns {number} */
function sideLength(geom, side) {
  return sideAxis(side) === 'x' ? geom.width : geom.height;
}
