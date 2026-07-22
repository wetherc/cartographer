export type POIType = 'settlement' | 'landmark' | 'dungeon' | 'shop' | 'quest' | 'custom';

export interface TileMetadata {
  poiType: POIType | null;
  discoverable: boolean;
  notes: string;
}

export interface Tile {
  id: string;
  imageRef: string;
  metadata: TileMetadata;
  revealed: boolean;
  /** id of the MapNode this tile zooms into, if any */
  childNodeId: string | null;
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
