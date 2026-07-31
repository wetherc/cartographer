export type POIType = 'settlement' | 'landmark' | 'dungeon' | 'shop' | 'quest' | 'custom';

export interface TileMetadata {
  poiType: POIType | null;
  /** When true, this POI stays hidden (no outline, no tooltip) until the party
   * reaches it; a plain POI is visible as soon as its tile is revealed. */
  discoverable: boolean;
  /** Whether a discoverable POI has been reached yet. Meaningless when
   * discoverable is false. Backfilled false on older saves. */
  discovered: boolean;
  notes: string;
}

export interface Tile {
  id: string;
  imageRef: string;
  /** image(s) drawn on top of imageRef (e.g. a road/path), so path pieces
   * layer over the terrain beneath instead of replacing it; null if none.
   * An array draws in order (first at the bottom), letting overlays stack —
   * e.g. a river channel over the shoreline where it drains into a lake. */
  overlayRef: string | string[] | null;
  metadata: TileMetadata;
  revealed: boolean;
  /** id of the MapNode this tile zooms into, if any */
  childNodeId: string | null;
  /** side length, in tiles, of the block this tile's image is drawn scaled
   * across (anchored here, extending right/down) — purely visual, no region
   * link implied. Absent or 1 means a normal one-cell image. */
  span?: number;
}

/** Whether a node is an outdoor area or the inside of a structure. */
export type NodeKind = 'region' | 'interior';

/** What a tile's art means to the rules: whether the party can stand on it,
 * whether it is the authored way into a space, and whether it connects to the
 * level above or below. `plain` covers everything with no such meaning —
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
  /** outdoor area vs. building interior; drives palette filtering and defaults */
  kind: NodeKind;
  /** environment tag, e.g. "forest"/"cave" for a region, "inn"/"temple" for an interior; null if unset */
  environ: string | null;
}

/** A side of a node's grid, as an exit leads away from it. */
export type ExitSide = 'north' | 'east' | 'south' | 'west';

/** A way out of a node, back to its parent. See MapExits.findExits.
 *  `edge` is walked off one side of an outdoor map; `tile` is a door or a
 *  stairway inside a structure; `fallback` is offered when a node has neither,
 *  so a party is never stranded in a space they walked into. */
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
