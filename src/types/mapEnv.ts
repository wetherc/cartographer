import type { MapCanvas } from '../map/MapCanvas.js';
import type { EditSnapshot } from '../map/EditHistory.js';
import type { MapNode } from './map.js';
import type { mountTileInspector } from '../ui/TileInspector.js';
import type { mountPalettePanel, Brush } from '../ui/PalettePanel.js';
import type { mountTileTooltip } from '../ui/TileTooltip.js';
import type { mountBreadcrumb } from '../ui/Breadcrumb.js';
import type { mountWorldTree } from '../ui/WorldTree.js';
import type { DeferredView } from './app.js';
import type { createNodeActions } from '../app/nodeActions.js';

/**
 * MapEnv is the mutable context shared between the map wiring
 * (`app/mapWiring.js`) and its gesture modules, mapAuthoring and mapTravel.
 * It holds the mounted views and the Build and Play UI state.
 *
 * Wiring sets the view fields in mount order. The gesture handlers only run
 * on user events, long after wiring completes, so reading the fields late is
 * safe. mapControls and nodeActions already rely on the same late binding.
 * `mapResync.js`'s resyncMapViews depends on the same rule: it reads
 * mapCanvas, breadcrumb, worldTree, and regionTree from this object instead
 * of the local variables. Do not call resyncMapViews, goToNode, resyncMap, or
 * a node action while wireMapView still runs.
 */
export interface MapEnv {
  mapCanvas: MapCanvas;
  inspector: ReturnType<typeof mountTileInspector>;
  /** Null until the first switch to Build mode mounts the palette. */
  palettePanel: ReturnType<typeof mountPalettePanel> | null;
  tileTooltip: ReturnType<typeof mountTileTooltip>;
  breadcrumb: ReturnType<typeof mountBreadcrumb>;
  /** The Build-rail tree. It mounts on the first switch to Build mode. */
  worldTree: DeferredView;
  regionTree: ReturnType<typeof mountWorldTree>;
  nodeActions: ReturnType<typeof createNodeActions>;
  selectedTileId: string | null;
  activeBrush: Brush;
  /** The id of the open Build rail tab. A brush paints only on the Paint tab. */
  buildTab: string;
  /** Refreshes the Build tool chip and the region highlight on the map. */
  syncBuildTool: () => void;
  fogTool: 'reveal' | 'hide' | null;
  goToNode: (nodeId: string) => void;
  selectTile: (tileId: string) => void;
  clearSelection: () => void;
  syncPartyMarker: () => void;
  syncExits: () => void;
  syncPaletteKind: () => void;
  refreshMapDescription: () => void;
  snapshotEdit: (node: MapNode, label?: string) => void;
  recordEdit: (snapshot: EditSnapshot) => void;
  finishEdit: () => void;
  /** Drops the stroke-undo and redo entries that name a deleted node. */
  pruneEdits: () => void;
}
