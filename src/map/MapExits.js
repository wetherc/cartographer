import { NEIGHBORS4, parseCoords, tileIdAt } from './MapGeometry.js';
import { findRegionGroups } from './RegionGroups.js';
import { getTile } from './TileGrid.js';
import { kindOf } from './TilePalette.js';

/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').Tile} Tile */
/** @typedef {import('../types/map.js').MapExit} MapExit */
/** @typedef {import('../types/map.js').ExitSide} ExitSide */
/** @typedef {import('./RegionGroups.js').RegionGroup} RegionGroup */

/**
 * The four sides of a node, with the direction each one leads away in. Written
 * once here because the exit finder, the return-tile geometry, and the renderer
 * all walk the same four in the same order.
 * @type {{ side: ExitSide, dx: number, dy: number }[]}
 */
export const EXIT_SIDES = [
  { side: 'north', dx: 0, dy: -1 },
  { side: 'east', dx: 1, dy: 0 },
  { side: 'south', dx: 0, dy: 1 },
  { side: 'west', dx: -1, dy: 0 },
];

/**
 * Ways out of a node, back to the node above it. Zooming into a child is fully
 * modelled (see EntryPoint); this is the other direction, and it is what the map
 * draws a return arrow or badge for.
 *
 * An outdoor child reports one `edge` exit per side of the block it occupies in
 * its parent that touches painted parent tiles — walking off that side of the
 * map puts the party back on the terrain they crossed to get here. An interior
 * reports a `tile` exit per outer door and per unlinked stairs-up tile, the
 * authored ways in and out of a structure.
 *
 * A node with neither (an interior a GM sealed, or a child whose parent block
 * sits in unpainted terrain) reports a single `fallback` exit instead of
 * nothing, so a party can always get out of a space they walked into.
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
 * The sides of the parent's region block that abut usable parent terrain. A side
 * counts when any member cell of the block has an orthogonal neighbour in the
 * parent that carries an image and does not belong to the block itself, so a
 * ragged block is read cell by cell and a block sitting in blank terrain (or
 * flush against the parent's own edge) reports that side as no way out. Diagonal
 * contact past a corner does not count: the party would have nothing to step onto.
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
 * when it opens onto what is outside the structure: it sits on the grid border,
 * or beside a cell the map leaves empty (the void a generated dungeon leaves
 * around its rooms). Stairs up lead out only when the parent is the level above,
 * which it is when the parent links here through a stairs-down tile; a keep whose
 * entrance is a door has its own staircases inside, and those go to floors the map
 * does not model. Either way a tile that already links to a child node is a way
 * further in, not out, so it is skipped.
 * @param {MapNode} node
 * @param {MapNode} parent
 * @param {{ targetNodeId: string, targetName: string }} target
 * @returns {MapExit[]}
 */
function interiorExits(node, parent, target) {
  const stacked = !!stairsDownTo(parent, node.id);
  /** @type {MapExit[]} */
  const exits = [];
  for (const tile of node.tiles) {
    if (tile.childNodeId) continue;
    const kind = kindOf(tile.imageRef);
    if (kind === 'stairs-up' && stacked) {
      exits.push({ kind: 'tile', tileId: tile.id, via: 'stairs-up', ...target });
    } else if (kind === 'door' && opensOutward(node, tile)) {
      exits.push({ kind: 'tile', tileId: tile.id, via: 'door', ...target });
    }
  }
  // Sorted so the renderer and the accessible button list agree on order
  // whatever order the tile array happens to be in.
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
 * The parent's stairs-down tile leading to a child, if the child is a level below
 * rather than a space entered from the side. The one authored connection between
 * two stacked levels, so it is both how the party gets down and where they come
 * back up, and it is what makes a child's own stairs-up a way out.
 * @param {MapNode} parent
 * @param {string} childNodeId
 * @returns {Tile | null}
 */
export function stairsDownTo(parent, childNodeId) {
  return (
    parent.tiles.find(
      (t) => t.childNodeId === childNodeId && kindOf(t.imageRef) === 'stairs-down',
    ) ?? null
  );
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
 * The exit a tile is, if any — the click path's lookup for a door or stairway
 * the party can leave through.
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
 * Whether an interior has no authored way out, so Build mode can say so. A GM
 * can still leave one in Play (findExits hands back a fallback), but a sealed
 * interior is nearly always an unfinished map rather than an intent.
 * @param {MapNode | null} node
 * @param {MapNode | null} parent
 * @returns {boolean}
 */
export function isSealedInterior(node, parent) {
  if (!node || !parent || node.kind !== 'interior') return false;
  return findExits(node, parent).every((e) => e.kind === 'fallback');
}

/**
 * What Build mode tells a GM about a sealed interior, or null when the node has
 * a way out. Stairs up only count as one on a level the parent reaches through
 * stairs down (interiorExits), so a keep entered through a town door is told to
 * paint a door and nothing else: advising stairs there would be advice that
 * cannot clear the warning.
 * @param {MapNode | null} node
 * @param {MapNode | null} parent
 * @returns {string | null}
 */
export function sealedInteriorHint(node, parent) {
  if (!isSealedInterior(node, parent) || !node || !parent) return null;
  return stairsDownTo(parent, node.id)
    ? 'No way out: paint a stairs-up tile, or a door on an outer wall.'
    : 'No way out: paint a door on an outer wall.';
}

/**
 * Which side of a node a cell is nearest to, used to decide where a door leads
 * out and where the party lands in the parent when they use it.
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
 * The view geometry an exit band's rect is computed from — the same fields the
 * renderer already holds on its view snapshot, plus which cell along the side
 * the band should centre on (the party's row or column).
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
 * The view state an exit band is placed from — the pan/zoom/canvas fields of the
 * renderer's view snapshot, named structurally so this module stays free of any
 * canvas dependency.
 * @typedef {Object} ExitBandView
 * @property {number} offsetX
 * @property {number} offsetY
 * @property {number} scale
 * @property {number} canvasWidth
 * @property {number} canvasHeight
 * @property {string | null} [partyTileId]
 */

/**
 * The geometry one edge exit's band is computed from, read off live view state.
 * The band tracks the party along the side it leads off: an arrow beside where
 * they stand reads as the way they would walk out, and it means a long map's
 * arrow is never off-screen while the party is on-screen. With the party
 * elsewhere (a node no one is standing in) it centres on the side instead.
 *
 * Both the renderer and the pointer build their geometry here, so the arrow the
 * GM sees and the rect their click is tested against can never drift apart.
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
 * The rect an edge exit's arrow is drawn in and clicked in. Deliberately a
 * bounded pill rather than a whole side of the gutter: the click target has to
 * be the thing the GM can see, and an unbounded band would swallow every click
 * that missed the map. It sits just outside the map border, centred on the cell
 * the party stands on along that side, and is clamped to stay on the canvas, so
 * panning the map's edge out of view leaves the arrow pinned at the viewport
 * edge instead of scrolling away with nothing to click.
 *
 * Pure geometry, no ctx: the renderer draws this rect and the pointer hit-tests
 * it, so the two cannot disagree about where the arrow is. A band wider than the
 * gutter it sits in ends up clamped over the map's own tiles, which is why the
 * pointer tests bands before it resolves a cell: whatever the GM can see is what
 * the click lands on. The label width is
 * estimated from the character count for the same reason — measureText would tie
 * the rect to a canvas.
 * @param {MapExit} exit
 * @param {ExitBandGeometry} geom
 * @returns {ExitBand}
 */
export function edgeExitBand(exit, geom) {
  const side = exit.kind === 'edge' ? exit.side : 'north';
  const size = geom.tileSize * geom.scale;
  const fontSize = Math.round(Math.max(12, Math.min(size * 0.28, 26)));
  const label = exitLabel(exit);
  // Room for the chevron, the gap after it, and the label at roughly the average
  // glyph width of the sans-serif stack at this size.
  const w = Math.min(
    Math.max(geom.canvasWidth - 16, 40),
    fontSize * 1.9 + label.length * fontSize * 0.54,
  );
  const h = Math.round(Math.max(26, Math.min(size * 0.8, 46)));
  // 0.55 of a cell out clears the coordinate labels, which hang half a cell off
  // the top and left edges.
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
 * A longer form for assistive tech, which has no arrow to look at and so needs
 * the way out named.
 * @param {MapExit} exit
 * @returns {string}
 */
export function exitDescription(exit) {
  if (exit.kind === 'edge') return `${exitLabel(exit)}, off the ${exit.side} edge of the map`;
  if (exit.kind === 'tile') {
    return `${exitLabel(exit)}, through the ${exit.via === 'door' ? 'door' : 'stairs up'} at ${exit.tileId}`;
  }
  return exitLabel(exit);
}

/** @param {ExitBandGeometry} geom @param {ExitSide} side @returns {number} */
function sideLength(geom, side) {
  return sideAxis(side) === 'x' ? geom.width : geom.height;
}

/** @param {number} value @param {number} min @param {number} max @returns {number} */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
