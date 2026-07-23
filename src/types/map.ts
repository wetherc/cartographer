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
  /** image drawn on top of imageRef (e.g. a road/path), so path pieces layer
   * over the terrain beneath instead of replacing it; null if none */
  overlayRef: string | null;
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

export interface PartyPosition {
  nodeId: string;
  tileId: string;
}
