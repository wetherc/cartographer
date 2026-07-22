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

export interface MapNode {
  id: string;
  name: string;
  parentId: string | null;
  width: number;
  height: number;
  tiles: Tile[];
}

export interface PartyPosition {
  nodeId: string;
  tileId: string;
}
