import { createMapNode } from '../map/TileGrid.js';
import { generateNodeTiles, generateDungeonLevels, ARCHETYPES } from '../map/MapGenerator.js';
import { ensureChildLink } from '../map/TilePaint.js';
import { resolveEntryTile } from '../map/EntryPoint.js';
import { mulberry32 } from '../util/Rng.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmModal, alertModal } from '../ui/Modal.js';
import { generateDialog } from '../ui/GenerateDialog.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Build-mode procedural generation: fill the current node with an archetype
 * layout (wilderness/town for regions, dungeon/castle for interiors) at a size
 * preset, as an alternative to painting a large map tile by tile. Archetypes
 * are filtered to the node's kind, and overwriting a non-empty node confirms.
 * @param {AppContext} app
 */
export function wireGenerateAction(app) {
  const { palette, grid, navigator, partyTracker } = app;

  mustGetElement('generate-btn').addEventListener('click', async () => {
    const node = navigator.getCurrentNode();
    const archetypes = ARCHETYPES[node.kind];

    /**
     * Build (and memoize) the full generation result for a dialog choice. The
     * RNG is seeded from the choice, so the preview the dialog renders and the
     * layout stamped on accept are the same map — and the seed shown to the GM
     * reproduces it later. Multi-level dungeons are built whole here so the
     * preview's level 1 carries the exact stairs the accepted map will.
     * @type {{ key: string, gen: { width: number, height: number, tiles: import('../types/map.js').Tile[], entry: string }, levels: ReturnType<typeof generateDungeonLevels> | null } | null}
     */
    let candidate = null;
    const freshId = () => {
      let id;
      do id = `node-${Math.random().toString(36).slice(2, 8)}`;
      while (grid.getNode(id));
      return id;
    };
    /** @param {import('../ui/GenerateDialog.js').GenerateChoice} choice */
    const buildCandidate = (choice) => {
      const key = JSON.stringify(choice);
      if (candidate?.key !== key) {
        const rng = mulberry32(choice.seed);
        if (choice.archetype === 'dungeon') {
          // A dungeon can be a chain of levels: each level's stairs-down is
          // linked to a freshly created child node holding the level below, so
          // stairs always connect to a real generated level.
          const levels = generateDungeonLevels(
            palette,
            { size: choice.size, levels: choice.levels },
            rng,
            freshId,
          );
          candidate = { key, gen: levels[0], levels };
        } else {
          candidate = {
            key,
            gen: generateNodeTiles(palette, { kind: node.kind, archetype: choice.archetype, size: choice.size }, rng),
            levels: null,
          };
        }
      }
      return candidate;
    };
    /** @param {import('../ui/GenerateDialog.js').GenerateChoice} choice */
    const makeCandidate = (choice) => buildCandidate(choice).gen;

    const values = await generateDialog({ archetypes, makeCandidate });
    if (!values) return;
    if (
      node.tiles.length > 0 &&
      !(await confirmModal(`Replace every tile in "${node.name}" with a generated map?`, {
        danger: true,
        confirmLabel: 'Replace',
      }))
    ) {
      return;
    }
    const built = buildCandidate(values);
    const gen = built.gen;
    // The regenerated layout replaces the node (and may restamp its parent's
    // entrance link below); snapshot both so the stroke-undo ring can revert it.
    const parentBefore = node.parentId ? grid.getNode(node.parentId) : null;
    app.actions.snapshotEdit(node, ...(parentBefore ? [parentBefore] : []));
    if (built.levels) {
      built.levels.slice(1).forEach((level, i) => {
        const child = createMapNode(
          /** @type {string} */ (level.id),
          `${node.name} (level ${i + 2})`,
          node.id,
          level.width,
          level.height,
          { kind: 'interior', environ: node.environ },
        );
        grid.addNode({ ...child, tiles: level.tiles });
      });
    }
    grid.updateNode({ ...node, width: gen.width, height: gen.height, tiles: gen.tiles });
    // A generated map must be reachable from the overworld, not just internally
    // connected: if no parent tile links to this node yet, stamp one (a POI
    // marker matching the archetype) on the parent tile nearest its centre, so
    // there is always a way in. Tell the GM where it landed so it can be moved.
    const parent = node.parentId ? grid.getNode(node.parentId) : null;
    if (parent) {
      /** @type {Record<string, { marker: string, poi: import('../types/map.js').POIType }>} */
      const entranceArt = {
        dungeon: { marker: 'dungeon', poi: 'dungeon' },
        castle: { marker: 'castle', poi: 'landmark' },
        town: { marker: 'settlement', poi: 'settlement' },
      };
      const artFor = entranceArt[values.archetype];
      const linked = ensureChildLink(parent, node.id, {
        // Wilderness gets no marker: the link rides the existing terrain tile
        // (or a fresh grass tile) and shows as a region outline once discovered.
        markerRef: artFor ? (palette.get(artFor.marker)?.imageRef ?? null) : null,
        createRef: palette.pickVariant('grass', Math.random).imageRef,
        poiType: artFor ? artFor.poi : null,
      });
      if (linked.tileId) {
        grid.updateNode(linked.node);
        alertModal(
          `Linked "${node.name}" from ${parent.name} at tile (${linked.tileId}), so it can be reached during play. Repaint or relink that tile to move the entrance.`,
          { title: 'Entrance placed', label: 'OK' },
        );
      }
    }
    // The regenerated layout may have shrunk past the party or replaced its tile
    // with void/wall; re-land it on the layout's guaranteed entry tile if so.
    const pos = partyTracker.getPosition();
    if (pos.nodeId === node.id) {
      const [px, py] = pos.tileId.split(',').map(Number);
      const landing = resolveEntryTile(navigator.getCurrentNode(), pos.tileId);
      if (px >= gen.width || py >= gen.height || landing !== pos.tileId) {
        partyTracker.moveTo(node.id, px >= gen.width || py >= gen.height ? gen.entry : landing);
      }
    }
    app.views.mapCanvas.setNode(navigator.getCurrentNode());
    app.actions.clearSelection();
    app.actions.syncPaletteKind();
    app.actions.syncPartyMarker();
    app.views.worldTree.update();
    app.views.regionTree.update();
    app.actions.refreshMapDescription();
    app.actions.markDirty();
    app.toasts.show(`Generated ${values.archetype} map in "${node.name}" (seed ${values.seed}).`);
  });
}
