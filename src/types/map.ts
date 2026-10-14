export type POIType = 'settlement' | 'landmark' | 'dungeon' | 'shop' | 'quest' | 'custom';

export interface TileMetadata {
  poiType: POIType | null;
  /** When true, this POI stays hidden, with no outline and no tooltip, until
   * the party reaches it. A plain POI is visible as soon as its tile is
   * revealed. */
  discoverable: boolean;
  /** True when a discoverable POI is reached. Meaningless when discoverable
   * is false. Backfilled to false on older saves. */
  discovered: boolean;
  notes: string;
}

export interface Tile {
  id: string;
  imageRef: string;
  /** Image or images drawn on top of imageRef, for example a road or path.
   * This lets path pieces layer over the terrain beneath instead of
   * replacing it. Null means no overlay. An array draws in order, with the
   * first entry at the bottom, so overlays can stack, for example a river
   * channel over the shoreline where it drains into a lake. */
  overlayRef: string | string[] | null;
  metadata: TileMetadata;
  revealed: boolean;
  /** Id of the MapNode this tile zooms into, if any. */
  childNodeId: string | null;
  /** Side length, in tiles, of the block that this tile's image draws
   * scaled across, anchored here and extending right and down. This is
   * purely visual, and implies no region link. Absent or 1 means a normal
   * one-cell image. */
  span?: number;
}

/** Whether a node is an outdoor area or the inside of a structure. */
export type NodeKind = 'region' | 'interior';

/** What a tile's art means to the rules: whether the party can stand on it,
 * whether it is the authored way into a space, and whether it connects to
 * the level above or below. A wall and an obstacle, such as a pillar or a
 * table, are the kinds that the party cannot stand on. `plain` covers
 * everything with no such meaning: outdoor terrain, markers, and any custom
 * image a GM supplies. See TileKinds.tileKind. */
export type TileKind =
  'plain' | 'floor' | 'wall' | 'obstacle' | 'door' | 'stairs-up' | 'stairs-down';

export interface MapNode {
  id: string;
  name: string;
  parentId: string | null;
  width: number;
  height: number;
  tiles: Tile[];
  /** Outdoor area or building interior. Drives palette filtering and defaults. */
  kind: NodeKind;
  /** Environment tag, for example "forest" or "cave" for a region, "inn" or
   * "temple" for an interior. Null if unset. */
  environ: string | null;
  /** A lock on the way in, or absent for an open map. Every move of the
   * party or a character into the node stops at a lock that is not open.
   * The GM view can still zoom in. */
  lock?: NodeLock;
}

/** The lock of a map. `requires` is the item name that opens it, matched
 * without regard to case across every character, or null. `open` turns
 * true when the GM unlocks it. */
export interface NodeLock {
  requires: string | null;
  open: boolean;
}

/** A side of a node's grid, as an exit leads away from it. */
export type ExitSide = 'north' | 'east' | 'south' | 'west';

/** A way out of a node, back to its parent. See MapExits.findExits.
 *  `edge` is walked off one side of an outdoor map. `tile` is a door or a
 *  stairway inside a structure. `fallback` is offered when a node has
 *  neither, so a party is never stranded in a space it walked into.
 *  An `edge` exit with a `crossTileId` crosses a border into a sibling
 *  region instead: its target is that region, and `crossTileId` is the
 *  parent cell the party crosses into. `along` is the traveler's cell along
 *  the side, which the band on the map centers on. */
export type MapExit =
  | {
      kind: 'edge';
      side: ExitSide;
      targetNodeId: string;
      targetName: string;
      crossTileId?: string;
      along?: number;
    }
  | {
      kind: 'tile';
      tileId: string;
      via: 'door' | 'stairs-up' | 'stairs-down';
      targetNodeId: string;
      targetName: string;
    }
  | { kind: 'fallback'; targetNodeId: string; targetName: string };

export interface PartyPosition {
  nodeId: string;
  tileId: string;
}

/** A place on a generated map that can open into a sub-map of its own, for
 *  example a town marker on a wilderness or the stairs down of a dungeon
 *  level. See GeneratorTree.expandTree.
 *  `tileIds` are the tiles that link to the sub-map. `size` is a size preset
 *  of MapGenerator.GENERATOR_SIZES. `label` names the kind of place, for
 *  example "inn" or "village", and a `forced` site uses it as the name
 *  suffix, for example "level 2". A `forced` site is always built, whatever
 *  the depth and the budget, because its tile already leads somewhere.
 *  `levels` is the level count of a dungeon or a cave, counted from this
 *  site down, and `level` is the number of the level that the site opens
 *  into, where the top level is 1. A `guide` gives the terrain of the parent
 *  under the site, so an open sub-map draws the same land at a larger scale. */
export interface GeneratedSite {
  tileIds: string[];
  archetype: string;
  kind: NodeKind;
  environ: string;
  size: string;
  label: string;
  forced?: boolean;
  levels?: number;
  level?: number;
  guide?: TerrainGuide;
}

/** The terrain of the cells of a parent map under the bounding box of a site,
 *  from GeneratorGuide.terrainGuide. Both arrays run row by row over the
 *  box, `width` cells wide and `height` cells tall. `biomes` is the biome
 *  of each cell, such as `forest`, or null for a cell whose art is not a
 *  built-in terrain. `rivers` lists the river arms of each cell, such as
 *  `ns` for a channel that runs north to south, and an empty string for a
 *  cell with no river. `block` is true for each cell of the site itself, and
 *  false for a cell of the box that belongs to a neighbor or to the sea. */
export interface TerrainGuide {
  width: number;
  height: number;
  biomes: (string | null)[];
  rivers: string[];
  block: boolean[];
}

/** A pier of a port town, from GeneratorTownDocks.planDocks. `side` is the
 *  border side of the sea, which the pier runs out toward. `quay` is the
 *  tile id of the shore cell where the pier meets the street, and `pier`
 *  lists the tile ids of the water cells under the pier, from the shore
 *  out to its head. */
export interface TownDock {
  side: 'n' | 'e' | 's' | 'w';
  quay: string;
  pier: string[];
}

/** Options of the MapCanvas constructor. */
export interface MapCanvasOptions {
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
  /** Detection range for encounter, NPC, and POI markers, in grid cells from
   * the party or a character token. This is conventionally twice the fog
   * reveal radius. */
  markerRange?: number;
  onCellClick?: (x: number, y: number, tile: Tile | null) => void;
  onCellContextMenu?: (
    x: number,
    y: number,
    tile: Tile | null,
    clientX: number,
    clientY: number,
  ) => void;
  onStrokeCell?: (x: number, y: number, tile: Tile | null, first: boolean) => void;
  onStrokeEnd?: () => void;
  getNodeName?: (nodeId: string) => string | undefined;
  onViewChange?: () => void;
  onCellHover?: (tile: Tile | null, clientX: number, clientY: number) => void;
  /** Fires when a way out of the current node is used. This happens on a
   * click on a border arrow, or on a cursor key pressed twice into the
   * border it leads off. */
  onExitClick?: (exit: MapExit) => void;
  /** Fires when a cursor key arms an edge exit (with the exit), and fires
   * again with null when the arming lapses. This lets the wiring narrate
   * the second press. */
  onExitArmed?: (exit: MapExit | null) => void;
  /** Fires after a cursor key lands the keyboard cursor on a cell, with the
   * cell's tile id, so the wiring can narrate what the cursor stands on. */
  onCursorMove?: (tileId: string) => void;
  /** Fires after Enter or Space authors a stroke on the cursor cell in
   * Build mode, with the cell's tile id and its tile before the stroke, so
   * the wiring can narrate what changed. */
  onCursorStroke?: (tileId: string, before: Tile | null) => void;
}
