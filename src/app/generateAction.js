import { createMapNode } from '../map/TileGrid.js';
import { withNodeTiles } from '../map/TileIndex.js';
import { generateNodeTiles, generateDungeonLevels, ARCHETYPES } from '../map/MapGenerator.js';
import { ensureChildLink } from '../map/TilePaint.js';
import { resolveEntryTile } from '../map/EntryPoint.js';
import { entranceArtFor, freshNodeId, relandedTile } from '../map/NodeEdits.js';
import { mulberry32 } from '../util/Rng.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmModal, alertModal } from '../ui/Modal.js';
import { generateDialog } from '../ui/GenerateDialog.js';
import { resyncMapViews } from './mapResync.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */

/**
 * This is Build-mode procedural generation. It fills the current node with
 * an archetype layout (wilderness or town for regions, dungeon or castle for
 * interiors) at a size preset, as an alternative to painting a large map
 * tile by tile. Archetypes are filtered to the node's kind, and overwriting
 * a non-empty node asks for confirmation.
 * @param {AppContext} app
 * @param {MapEnv} env the map wiring's shared context, for the stroke-undo
 *   snapshot and the post-generate resync
 */
export function wireGenerateAction(app, env) {
  const { palette, grid, navigator, partyTracker } = app;

  mustGetElement('generate-btn').addEventListener('click', async () => {
    const node = navigator.getCurrentNode();
    const archetypes = ARCHETYPES[node.kind];

    /**
     * Build and cache the full generation result for a dialog choice. The
     * RNG is seeded from the choice, so the preview the dialog draws and the
     * layout stamped on accept are the same map. The seed shown to the GM
     * reproduces it later. This function builds multi-level dungeons whole,
     * so the preview's level 1 carries the exact stairs the accepted map will.
     * @type {{ key: string, gen: { width: number, height: number, tiles: import('../types/map.js').Tile[], entry: string }, levels: ReturnType<typeof generateDungeonLevels> | null } | null}
     */
    let candidate = null;
    const freshId = () => freshNodeId((id) => Boolean(grid.getNode(id)));
    /** @param {import('../ui/GenerateDialog.js').GenerateChoice} choice */
    const buildCandidate = (choice) => {
      const key = JSON.stringify(choice);
      if (candidate?.key !== key) {
        const rng = mulberry32(choice.seed);
        if (choice.archetype === 'dungeon') {
          // A dungeon can be a chain of levels. Each level's stairs-down
          // links to a freshly created child node that holds the level
          // below, so stairs always connect to a real generated level.
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
            gen: generateNodeTiles(
              palette,
              { kind: node.kind, archetype: choice.archetype, size: choice.size },
              rng,
            ),
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
    // The regenerated layout replaces the node, and can restamp its parent's
    // entrance link below. Snapshot both so the stroke-undo ring can revert it.
    const parentBefore = node.parentId ? grid.getNode(node.parentId) : null;
    env.snapshotEdit(node, ...(parentBefore ? [parentBefore] : []));
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
        grid.addNode(withNodeTiles(child, level.tiles));
      });
    }
    grid.updateNode(withNodeTiles({ ...node, width: gen.width, height: gen.height }, gen.tiles));
    // A generated map must be reachable from the overworld, not just
    // internally connected. If no parent tile links to this node yet, stamp
    // one (a POI marker matching the archetype) on the parent tile nearest
    // its center, so there is always a way in. Tell the GM where it landed,
    // so the GM can move it.
    const parent = node.parentId ? grid.getNode(node.parentId) : null;
    if (parent) {
      const artFor = entranceArtFor(values.archetype);
      const linked = ensureChildLink(parent, node.id, {
        // Wilderness gets no marker. The link rides the existing terrain tile
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
    // If the regenerated layout has shrunk past the party, or replaced the
    // party's tile with void or wall, re-land the party on the layout's
    // guaranteed entry tile.
    const pos = partyTracker.getPosition();
    if (pos.nodeId === node.id) {
      const moveTo = relandedTile({
        tileId: pos.tileId,
        width: gen.width,
        height: gen.height,
        entry: gen.entry,
        landing: resolveEntryTile(navigator.getCurrentNode(), pos.tileId),
      });
      if (moveTo) partyTracker.moveTo(node.id, moveTo);
    }
    resyncMapViews(app, env, { reframe: true });
    app.actions.markDirty();
    app.toasts.show(`Generated ${values.archetype} map in "${node.name}" (seed ${values.seed}).`);
  });
}
