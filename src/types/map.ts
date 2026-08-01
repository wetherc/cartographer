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
 * the level above or below. `plain` covers everything with no such meaning:
 * outdoor terrain, markers, and any custom image a GM supplies.
 * See TilePalette.kindOf. */
export type TileKind = 'plain' | 'floor' | 'wall' | 'door' | 'stairs-up' | 'stairs-down';

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
}

/** A side of a node's grid, as an exit leads away from it. */
export type ExitSide = 'north' | 'east' | 'south' | 'west';

/** A way out of a node, back to its parent. See MapExits.findExits.
 *  `edge` is walked off one side of an outdoor map. `tile` is a door or a
 *  stairway inside a structure. `fallback` is offered when a node has
 *  neither, so a party is never stranded in a space it walked into. */
export type MapExit =
  | { kind: 'edge'; side: ExitSide; targetNodeId: string; targetName: string }
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
