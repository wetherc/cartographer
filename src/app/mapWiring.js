import { getTile, updateTileMetadata } from '../map/TileGrid.js';
import { MapCanvas } from '../map/MapCanvas.js';
import { clientToBuffer, screenToTile } from '../map/MapGeometry.js';
import { paintTile, eraseTile, erasePath, normalizeRect, tilesInRect, linkTilesInRect, stampRegionLink } from '../map/TilePaint.js';
import { computeRegionEntryTile, resolveEntryTile } from '../map/EntryPoint.js';
import { discoveredNodes, revealAll, revealAround, setTileRevealed } from '../map/FogOfWar.js';
import { characterTokens, moveCharacter, recallAll } from '../party/CharacterTokens.js';
import { pushEdit, popEdit } from '../map/EditHistory.js';
import { renderNodeToCanvas, downloadCanvasPNG, exportFilename } from '../map/MapExport.js';
import { findRegionGroups } from '../map/RegionGroups.js';
import { createNodeActions } from './nodeActions.js';
import { mustGetElement } from '../ui/dom.js';
import { mountBreadcrumb } from '../ui/Breadcrumb.js';
import { mountWorldTree } from '../ui/WorldTree.js';
import { mountTileInspector } from '../ui/TileInspector.js';
import { mountPalettePanel } from '../ui/PalettePanel.js';
import { mountMapControls } from '../ui/MapControls.js';
import { mountMapDescription } from '../ui/MapDescription.js';
import { mountTileTooltip } from '../ui/TileTooltip.js';
import { promptModal, confirmModal } from '../ui/Modal.js';
import { isDefeated } from '../entities/Encounter.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Everything on and around the map: the canvas and its stroke/click gestures,
 * the breadcrumb and both world trees, the tile inspector, the palette and its
 * drag-drop, fog controls, the screen-reader map description, stroke-level
 * undo, and the Build-rail tools (Undo stroke, Export PNG). Owns the
 * Build-mode UI state (selection, brush, fog tool, marquee, edit history);
 * registers the map-facing actions the other modules call.
 * @param {AppContext} app
 */
export function wireMapView(app) {
  const { palette, grid, navigator, partyTracker, toasts, state } = app;

  const canvasEl = /** @type {HTMLCanvasElement} */ (mustGetElement('map-canvas'));

  /** @type {string | null} tile id selected for inspection/editing in Build mode */
  let selectedTileId = null;
  /** @type {import('../ui/PalettePanel.js').Brush} active Build-mode paint brush */
  let activeBrush = null;
  /** @type {'reveal' | 'hide' | null} active Play-mode GM fog brush */
  let fogTool = null;
  /** @type {{ x: number, y: number } | null} first cell of an in-progress region-tool drag */
  let regionAnchor = null;

  /**
   * Build-mode stroke-level undo: an in-memory ring of node snapshots taken
   * before each paint/erase stroke, region link, tile link, drop-paint, and
   * generate, so one bad edit is reversible without reloading a whole earlier
   * save. Session-only — the persisted Undo button stays the save-level story.
   * @type {import('../types/map.js').MapNode[][]}
   */
  let editHistory = [];

  /** Snapshot the given nodes' pre-edit state onto the stroke-undo ring.
   * @param {...import('../types/map.js').MapNode} nodes */
  function snapshotEdit(...nodes) {
    editHistory = pushEdit(editHistory, nodes);
  }
  app.actions.snapshotEdit = snapshotEdit;

  /** Restore the most recent stroke-undo snapshot, skipping nodes deleted since. */
  function undoStroke() {
    const popped = popEdit(editHistory);
    editHistory = popped.history;
    if (!popped.nodes) {
      toasts.show('Nothing to undo.');
      return;
    }
    for (const node of popped.nodes) {
      if (grid.getNode(node.id)) grid.updateNode(node);
    }
    mapCanvas.setNode(navigator.getCurrentNode());
    clearSelection();
    syncPartyMarker();
    worldTree.update();
    regionTree.update();
    refreshMapDescription();
    app.actions.markDirty();
    toasts.show('Undid the last edit.');
  }
  app.actions.undoStroke = undoStroke;

  /** Show the party marker only on the node the party is actually standing in,
   * and resolve each character's named token for the node being viewed (their
   * own location, or the party's tile for characters still with the party).
   * With the split-party toggle off everyone moves as one, so the individual
   * named tokens stay hidden and only the shared party marker renders. */
  function syncPartyMarker() {
    const position = partyTracker.getPosition();
    const nodeId = navigator.getCurrentNode().id;
    mapCanvas.setPartyTile(position.nodeId === nodeId ? position.tileId : null);
    mapCanvas.setCharacterTokens(
      state.splitParty ? characterTokens(state.characters, position, nodeId) : [],
    );
    syncEncounterMarkers();
    syncNPCMarkers();
    refreshMapDescription();
  }
  app.actions.syncPartyMarker = syncPartyMarker;

  /** Mark the current node's tiles that carry a live (undefeated) encounter, so
   * the map shows where danger lies once the party comes within detection range. */
  function syncEncounterMarkers() {
    const nodeId = navigator.getCurrentNode().id;
    mapCanvas.setEncounterTiles(
      state.encounters
        .filter((e) => e.location && e.location.nodeId === nodeId && !isDefeated(e))
        .map((e) => /** @type {import('../types/entities.js').EncounterLocation} */ (e.location).tileId),
    );
  }
  app.actions.syncEncounterMarkers = syncEncounterMarkers;

  /** Mark the current node's tiles that hold a placed NPC (distinct blue marker),
   * shown once the party comes within detection range. */
  function syncNPCMarkers() {
    const nodeId = navigator.getCurrentNode().id;
    mapCanvas.setNPCTiles(
      state.npcs
        .filter((n) => n.location && n.location.nodeId === nodeId)
        .map((n) => /** @type {import('../types/entities.js').EncounterLocation} */ (n.location).tileId),
    );
  }
  app.actions.syncNPCMarkers = syncNPCMarkers;

  /** Re-narrate the current map for the screen-reader live region. Called wherever
   * the node, party, fog, or tiles change (the same events that redraw). */
  function refreshMapDescription() {
    mapDescription.update(navigator.getCurrentNode(), partyTracker.getPosition(), state.mode === 'build');
  }
  app.actions.refreshMapDescription = refreshMapDescription;

  /**
   * Navigate to a node by id and resync every view that reflects the location.
   * @param {string} nodeId
   */
  function goToNode(nodeId) {
    navigator.goTo(nodeId);
    mapCanvas.setNode(navigator.getCurrentNode());
    clearSelection();
    syncPartyMarker();
    syncPaletteKind();
    breadcrumb.update(navigator.getBreadcrumb());
    worldTree.update();
    regionTree.update();
  }

  /** Show the palette only the terrain the current node's kind can use. */
  function syncPaletteKind() {
    palettePanel.setKind(navigator.getCurrentNode().kind);
  }
  app.actions.syncPaletteKind = syncPaletteKind;

  /** Drop any Build-mode tile selection and its inspector/canvas highlight. */
  function clearSelection() {
    selectedTileId = null;
    mapCanvas.setSelectedTile(null);
    inspector.setTile(null);
  }
  app.actions.clearSelection = clearSelection;

  const breadcrumb = mountBreadcrumb(mustGetElement('breadcrumb-container'), goToNode);

  const worldTree = mountWorldTree(mustGetElement('world-tree-container'), {
    getNodes: () => [...grid.nodes.values()],
    getCurrentId: () => navigator.getCurrentNode().id,
    onSelect: goToNode,
    onAddChild: (id) => nodeActions.addChildNode(id),
    onEdit: (id) => nodeActions.editNode(id),
    onDelete: (id) => nodeActions.deleteNode(id),
  });
  app.views.worldTree = worldTree;

  // The Play-mode counterpart to the Build-mode world tree: the same hierarchy,
  // but read-only (no add/delete affordances). Players only see nodes the party
  // has actually discovered, so unexplored regions stay hidden from the table;
  // the GM always sees the whole world. Selecting a node offers to teleport the
  // party there.
  const regionTree = mountWorldTree(mustGetElement('region-tree-container'), {
    getNodes: () =>
      isGM(state.role)
        ? [...grid.nodes.values()]
        : discoveredNodes([...grid.nodes.values()], partyTracker.getPosition()),
    getCurrentId: () => navigator.getCurrentNode().id,
    onSelect: teleportToNode,
    collapsible: true,
  });
  app.views.regionTree = regionTree;

  /**
   * Offer to teleport the party to a discovered node. Clicking the node the
   * party already occupies just brings the view back to it; otherwise a confirm
   * dialog gates the move. The party lands on the node's first revealed tile
   * (there is always one for a discovered node with tiles), falling back to the
   * grid centre for a tile-less node.
   * @param {string} nodeId
   */
  async function teleportToNode(nodeId) {
    const node = grid.getNode(nodeId);
    if (!node) return;
    // Teleporting the party is the GM's call; a player selecting a node just
    // brings it into view without moving anyone.
    if (!isGM(state.role) || partyTracker.getPosition().nodeId === nodeId) {
      goToNode(nodeId);
      return;
    }
    const ok = await confirmModal(`Would you like to teleport to "${node.name}"?`, {
      confirmLabel: 'Teleport',
    });
    if (!ok) return;
    // Resolve the landing spot against the node's real tiles, so a teleport into
    // a sparse or walled node (e.g. a generated dungeon) never strands the party
    // on a wall or an empty cell.
    const target = resolveEntryTile(
      node,
      node.tiles.find((t) => t.revealed)?.id ??
        `${Math.floor(node.width / 2)},${Math.floor(node.height / 2)}`,
    );
    // No revealed tile yet means the party has never set foot here, so this
    // teleport is the region's discovery (checked before moveTo reveals fog).
    const firstVisit = !node.tiles.some((t) => t.revealed);
    partyTracker.moveTo(nodeId, target);
    state.characters = recallAll(state.characters); // the whole party teleports
    goToNode(nodeId);
    app.actions.logEvent('travel', firstVisit ? `Discovered ${node.name}.` : `Traveled to ${node.name}.`);
    refreshLocationPanels();
    app.actions.maybeTriggerEncounter();
  }

  /** The party may have changed nodes; re-filter every location-scoped panel. */
  function refreshLocationPanels() {
    app.views.encounterPanel.update();
    app.views.initiativePanel.update();
    app.views.npcPanel.update();
    app.views.handoutPanel.update();
  }

  /**
   * Resolve a completed region-tool drag: link every existing tile in the
   * marquee block to a child node chosen from the current node's children, or to
   * a newly created one — the area counterpart to the inspector's per-tile link.
   */
  async function finishRegionStroke() {
    const rect = mapCanvas.marquee;
    regionAnchor = null;
    mapCanvas.setMarquee(null);
    if (!rect) return;
    const node = navigator.getCurrentNode();
    if (!tilesInRect(node, rect).length) {
      await confirmModal('No tiles in the selected block. Paint tiles first, then link them.', {
        confirmLabel: 'OK',
      });
      return;
    }
    const children = grid.getChildren(node.id);
    /** @type {string | null} */
    let childId;
    if (children.length) {
      const values = await promptModal(
        'Link region block',
        [
          {
            name: 'target',
            label: 'Link to',
            type: 'select',
            options: [
              ...children.map((c) => ({ value: c.id, label: c.name })),
              { value: '', label: 'Create new region...' },
            ],
          },
        ],
        { submitLabel: 'Link' },
      );
      if (!values) return;
      childId = values.target || (await nodeActions.addChildNode(node.id));
    } else {
      childId = await nodeActions.addChildNode(node.id);
    }
    if (!childId) return;
    snapshotEdit(navigator.getCurrentNode());
    const updated = linkTilesInRect(navigator.getCurrentNode(), rect, childId);
    grid.updateNode(updated);
    mapCanvas.refreshNode(updated);
    if (selectedTileId) inspector.setTile(getTile(updated, selectedTileId) ?? null, true);
    app.actions.markDirty();
  }

  /** @type {{ update: () => void } | null} assigned right after mapCanvas exists */
  let mapControls = null;

  const mapCanvas = new MapCanvas(canvasEl, palette, {
    tileSize: 48,
    // Encounter/NPC/POI markers are sensed out to twice the fog reveal radius
    // around the party (and any split-off character), but no further.
    markerRange: partyTracker.revealRadius * 2,
    getNodeName: (nodeId) => grid.getNode(nodeId)?.name,
    onViewChange: () => mapControls?.update(),
    // Play-mode read side of the Build-mode tile inspector: hovering a revealed
    // tile with metadata shows what the GM authored there. Build mode already
    // surfaces the same data through the inspector, so hover stays quiet there.
    onCellHover: (tile, clientX, clientY) => {
      if (
        state.mode !== 'play' ||
        !tile ||
        !tile.revealed ||
        (tile.metadata.discoverable && !tile.metadata.discovered)
      ) {
        tileTooltip.hide();
        return;
      }
      const nodeId = navigator.getCurrentNode().id;
      const npcNames = state.npcs
        .filter((n) => n.location && n.location.nodeId === nodeId && n.location.tileId === tile.id)
        .map((n) => n.name);
      const poiType = tile.metadata.poiType;
      // Notes are the GM's secret; players see the POI type and who stands
      // here (the marker is already visible once the tile is revealed).
      const gm = isGM(state.role);
      const visible = poiType || npcNames.length > 0 || (gm && tile.metadata.notes);
      if (!visible) {
        tileTooltip.hide();
        return;
      }
      tileTooltip.show(
        {
          title: poiType ? poiType.charAt(0).toUpperCase() + poiType.slice(1) : '',
          npcs: npcNames.join(', '),
          notes: gm ? tile.metadata.notes : '',
        },
        clientX,
        clientY,
      );
    },
    // Build-mode authoring arrives as strokes: a left-drag applies the active
    // brush to every cell it crosses (a click is a one-cell stroke), so painting
    // a row is one gesture instead of one click per tile. The Region brush
    // instead drags out a marquee block, resolved to a child-node link on release.
    onStrokeCell: (x, y, tile, first) => {
      const id = `${x},${y}`;
      // Play-mode GM fog brush: strokes reveal/hide fog instead of authoring
      // tiles. Only active while a fog tool is toggled on (which is what put the
      // canvas in authoring mode outside Build).
      if (state.mode === 'play') {
        if (fogTool) {
          applyToTile(id, (node) => setTileRevealed(node, id, fogTool === 'reveal'));
        }
        return;
      }
      // A whole drag coalesces into one stroke, so one snapshot on its first
      // cell makes the stroke the unit of undo. Inspect (no brush) and the
      // region marquee don't mutate here; the region tool snapshots on link.
      if (first && activeBrush && activeBrush !== 'region') {
        snapshotEdit(navigator.getCurrentNode());
      }
      if (activeBrush === 'region') {
        if (first) regionAnchor = { x, y };
        if (regionAnchor) mapCanvas.setMarquee(normalizeRect(regionAnchor, { x, y }));
      } else if (activeBrush === 'erase') {
        applyToTile(id, (node) => eraseTile(node, id));
      } else if (activeBrush === 'erase-path') {
        applyToTile(id, (node) => erasePath(node, id));
      } else if (activeBrush) {
        // Captured so the closure below keeps the non-null narrowing.
        const brush = activeBrush;
        const overlay = brush.type === 'road';
        applyToTile(id, (node) => paintTile(node, id, brush.imageRef, overlay));
      } else if (first) {
        // Inspect acts on the pressed cell only; dragging doesn't re-select.
        selectTile(id);
      }
    },
    onStrokeEnd: () => {
      if (regionAnchor) finishRegionStroke();
    },
    onCellClick: (x, y, tile) => {
      // Fires only outside authoring mode: Play-mode navigation and moves.
      // Empty cells are inert. Who moves depends on the tab: the GM's clicks
      // move the whole party (recalling any individually placed character), a
      // bound player tab's clicks move only that player's own character, and a
      // spectator tab moves no one (region tiles still navigate the view).
      if (!tile) return;
      const gm = isGM(state.role);
      if (tile.childNodeId) {
        const parent = navigator.getCurrentNode();
        if (navigator.zoomIn(tile.id)) {
          const child = navigator.getCurrentNode();
          if (gm) {
            // Checked before moveTo reveals entry fog: an all-fogged child has
            // never been visited, so stepping in now is its discovery.
            const firstVisit = !child.tiles.some((t) => t.revealed);
            // Zooming into a region moves the party into it. Unless the party
            // has already been placed in this child before, drop them at the
            // edge they approached from and reveal fog around it, so the child
            // doesn't render as a blank fog field with no party marker.
            if (partyTracker.getPosition().nodeId !== child.id) {
              partyTracker.moveTo(
                child.id,
                computeRegionEntryTile(parent, child, tile.childNodeId, partyTracker.getPosition()),
              );
              state.characters = recallAll(state.characters);
            }
            app.actions.logEvent('travel', firstVisit ? `Discovered ${child.name}.` : `Entered ${child.name}.`);
            app.actions.markDirty(); // party position and fog changed
          }
          // Re-read the node: moveTo wrote a new, fog-revealed node into the grid,
          // so the `child` captured above is stale and still fully fogged.
          mapCanvas.setNode(navigator.getCurrentNode());
          breadcrumb.update(navigator.getBreadcrumb());
          worldTree.update();
          // Entering a node for the first time discovers it.
          regionTree.update();
          syncPartyMarker();
          refreshLocationPanels();
          if (gm) app.actions.maybeTriggerEncounter();
        }
        return;
      }
      if (gm) {
        partyTracker.moveTo(navigator.getCurrentNode().id, tile.id);
        state.characters = recallAll(state.characters);
        discoverTile(tile);
        mapCanvas.refreshNode(navigator.getCurrentNode());
        syncPartyMarker();
        app.actions.markDirty(); // party position and fog changed
        refreshLocationPanels();
        app.actions.maybeTriggerEncounter();
        return;
      }
      moveBoundCharacter(tile);
    },
  });
  app.views.mapCanvas = mapCanvas;

  // The node create/edit/delete actions live in their own module; they resync
  // the views above, which now all exist, so their context can be handed over.
  // Earlier handlers close over this binding but only run after wiring, so
  // declaring it here (past their definitions) is safe.
  const nodeActions = createNodeActions({
    grid,
    navigator,
    partyTracker,
    mapCanvas,
    breadcrumb,
    worldTree,
    regionTree,
    goToNode,
    clearSelection,
    syncPaletteKind,
    syncPartyMarker,
    markDirty: () => app.actions.markDirty(),
  });

  const inspector = mountTileInspector(mustGetElement('inspector-container'), {
    onChange: (patch) => {
      if (!selectedTileId) return;
      const updated = updateTileMetadata(navigator.getCurrentNode(), selectedTileId, patch);
      grid.updateNode(updated);
      mapCanvas.refreshNode(updated);
      inspector.setTile(getTile(updated, selectedTileId) ?? null, true);
      app.actions.markDirty();
    },
    linking: {
      getOptions: () => grid.getChildren(navigator.currentNodeId).map((n) => ({ id: n.id, name: n.name })),
      onChange: (childNodeId) => linkSelectedTile(childNodeId),
      onCreateNew: async () => {
        const id = await nodeActions.addChildNode(navigator.currentNodeId);
        if (id) linkSelectedTile(id);
      },
    },
    // Build-mode spawn placement: make the selected tile the party's start.
    onSetSpawn: (tileId) => {
      partyTracker.moveTo(navigator.getCurrentNode().id, tileId);
      state.characters = recallAll(state.characters);
      mapCanvas.refreshNode(navigator.getCurrentNode());
      syncPartyMarker();
      app.actions.markDirty();
    },
  });

  /**
   * Point the selected tile's childNodeId at a node (or null to unlink), so
   * zooming that tile enters the linked node. On outdoor maps the link stamps
   * a 2x2 block (and unlinking clears the whole block); interiors stay
   * single-tile. Re-derives region groups via the canvas refresh so the block
   * outline updates immediately.
   * @param {string | null} childNodeId
   */
  function linkSelectedTile(childNodeId) {
    if (!selectedTileId) return;
    const node = navigator.getCurrentNode();
    snapshotEdit(node);
    const updated = stampRegionLink(node, selectedTileId, childNodeId);
    grid.updateNode(updated);
    mapCanvas.refreshNode(updated);
    inspector.setTile(getTile(updated, selectedTileId) ?? null, true);
    app.actions.markDirty();
  }

  /**
   * Select a tile within the current node and point the inspector at it.
   * @param {string} tileId
   */
  function selectTile(tileId) {
    selectedTileId = tileId;
    mapCanvas.setSelectedTile(tileId);
    inspector.setTile(getTile(navigator.getCurrentNode(), tileId) ?? null, true);
  }

  /**
   * Apply a pure node transform (paint/erase) to the current node, persist it,
   * re-render the canvas, and keep the inspector in sync if it was showing the
   * affected tile.
   * @param {string} tileId
   * @param {(node: import('../types/map.js').MapNode) => import('../types/map.js').MapNode} transform
   */
  function applyToTile(tileId, transform) {
    const updated = transform(navigator.getCurrentNode());
    grid.updateNode(updated);
    mapCanvas.refreshNode(updated);
    if (tileId === selectedTileId) {
      inspector.setTile(getTile(updated, tileId) ?? null, true);
    }
    refreshMapDescription();
    app.actions.markDirty();
  }

  /**
   * Mark a discoverable POI discovered once the party reaches it, persisting the
   * flag and logging the find. A non-discoverable or already-found tile is a
   * no-op. Read the node fresh from the navigator since the party's move just
   * rewrote it in the grid.
   * @param {import('../types/map.js').Tile} tile
   */
  function discoverTile(tile) {
    if (!tile.metadata.discoverable || tile.metadata.discovered) return;
    const node = navigator.getCurrentNode();
    grid.updateNode(updateTileMetadata(node, tile.id, { discovered: true }));
    const what = tile.metadata.poiType ?? 'a hidden location';
    app.actions.logEvent('travel', `Discovered ${what}${tile.metadata.notes ? `: ${tile.metadata.notes}` : ''}.`);
  }

  /**
   * A bound player tab moving its own character: the character takes their own
   * location on the current node's tile (rejoining the party when the click
   * lands on the party's tile), their step reveals fog around them, and an
   * encounter on that tile alerts under the character's name. A spectator tab
   * (no binding) moves no one.
   * @param {import('../types/map.js').Tile} tile
   */
  function moveBoundCharacter(tile) {
    // Individual movement exists only while the GM's split-party toggle is on;
    // otherwise the party moves simultaneously, by GM clicks alone.
    if (!state.splitParty) return;
    const boundId = app.actions.getBoundCharacterId();
    const character = state.characters.find((c) => c.id === boundId);
    if (!character) return;
    const nodeId = navigator.getCurrentNode().id;
    const party = partyTracker.getPosition();
    const rejoined = party.nodeId === nodeId && party.tileId === tile.id;
    state.characters = moveCharacter(state.characters, character.id, rejoined ? null : { nodeId, tileId: tile.id });
    grid.updateNode(revealAround(navigator.getCurrentNode(), tile.id, partyTracker.revealRadius));
    discoverTile(tile);
    mapCanvas.refreshNode(navigator.getCurrentNode());
    syncPartyMarker();
    regionTree.update();
    app.actions.markDirty();
    app.actions.maybeTriggerEncounter({ nodeId, tileId: tile.id }, character.name);
  }

  const tileTooltip = mountTileTooltip(document.body);

  // The tooltip doubles as the palette's hover label, naming each image-only swatch.
  const palettePanel = mountPalettePanel(
    mustGetElement('palette-container'),
    palette,
    (brush) => {
      activeBrush = brush;
    },
    tileTooltip,
  );

  // The canvas is a drop target for palette swatches: dragging a tile onto a grid
  // cell paints it there, an alternative to selecting a brush and clicking.
  canvasEl.addEventListener('dragover', (event) => {
    if (state.mode === 'build') event.preventDefault();
  });
  canvasEl.addEventListener('drop', (event) => {
    if (state.mode !== 'build') return;
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/tile-id');
    const entry = id ? palette.get(id) : undefined;
    if (!entry) return;
    const rect = canvasEl.getBoundingClientRect();
    const buffer = clientToBuffer(event.clientX, event.clientY, rect, canvasEl.width, canvasEl.height);
    const coords = screenToTile(buffer.x, buffer.y, mapCanvas.tileSize, mapCanvas.offsetX, mapCanvas.offsetY, mapCanvas.scale);
    const tileId = `${coords.x},${coords.y}`;
    snapshotEdit(navigator.getCurrentNode());
    applyToTile(tileId, (node) => paintTile(node, tileId, entry.imageRef, entry.type === 'road'));
  });

  mapControls = mountMapControls(mustGetElement('map-viewport'), {
    onZoomIn: () => mapCanvas.zoomBy(1.25),
    onZoomOut: () => mapCanvas.zoomBy(1 / 1.25),
    onFit: () => mapCanvas.fit(),
    getZoom: () => mapCanvas.scale,
    // GM fog controls (hidden from the player role via CSS): brushes stroke fog
    // on/off, reveal-all lights the whole current node.
    fog: {
      getTool: () => fogTool,
      onToolChange: (tool) => {
        fogTool = state.mode === 'play' ? tool : null;
        // A fog brush needs the stroke gesture, which only fires in authoring
        // mode; Build mode keeps authoring on regardless.
        mapCanvas.setAuthoring(state.mode === 'build' || fogTool !== null);
      },
      onRevealAll: () => {
        const node = revealAll(navigator.getCurrentNode());
        grid.updateNode(node);
        mapCanvas.refreshNode(node);
        regionTree.update();
        refreshMapDescription();
        app.actions.markDirty();
        toasts.show(`Revealed all of "${node.name}".`);
      },
    },
  });

  const mapDescription = mountMapDescription(mustGetElement('map-viewport'));

  // The map-facing consequences of a mode switch, called by sessionControls
  // after it flips the body classes.
  app.actions.onModeChanged = (mode) => {
    mapCanvas.setRevealAll(mode === 'build');
    mapCanvas.setAuthoring(mode === 'build');
    tileTooltip.hide();
    regionAnchor = null;
    fogTool = null; // the fog brush is a Play-mode tool; changing modes drops it
    mapControls?.update();
    if (mode !== 'build') clearSelection();
    worldTree.update();
    regionTree.update();
    refreshMapDescription();
  };

  // Likewise for a role switch: players don't get the fog brush or the
  // authoring gesture, and any open tooltip may now show too much.
  app.actions.onRoleChanged = (role) => {
    if (role === 'player') {
      fogTool = null;
      mapCanvas.setAuthoring(false);
      mapControls?.update();
    }
    tileTooltip.hide();
    // The sidebar world tree shows everything to the GM but only discovered
    // nodes to players, so a role flip changes its contents.
    regionTree.update();
  };

  // Keep the canvas buffer matched to the CSS size of the element (times the
  // device pixel ratio), so the map fills the fluid layout column instead of
  // staying a fixed 720x540 island; each resize re-frames the node.
  const resizeMapToViewport = () => {
    const dpr = window.devicePixelRatio || 1;
    mapCanvas.resize(
      Math.max(1, Math.round(canvasEl.clientWidth * dpr)),
      Math.max(1, Math.round(canvasEl.clientHeight * dpr)),
    );
  };
  new ResizeObserver(resizeMapToViewport).observe(canvasEl);

  // Build-rail map tools: stroke-level undo and a fog-free PNG export of the
  // current node (Build rail, so GM/Build only — a player never sees these).
  mustGetElement('stroke-undo-btn').addEventListener('click', undoStroke);
  mustGetElement('export-png-btn').addEventListener('click', async () => {
    const node = navigator.getCurrentNode();
    const canvas = await renderNodeToCanvas(node, {
      tileSize: 64,
      regionGroups: findRegionGroups(node),
      getNodeName: (id) => grid.getNode(id)?.name,
    });
    downloadCanvasPNG(canvas, exportFilename(node.name));
    toasts.show(`Exported "${node.name}" as PNG.`);
  });

  mapCanvas.setNode(navigator.getCurrentNode());
  syncPartyMarker();
  syncPaletteKind();
  breadcrumb.update(navigator.getBreadcrumb());
}
