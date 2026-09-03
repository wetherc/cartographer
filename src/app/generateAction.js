import { createMapNode } from '../map/TileGrid.js';
import { withNodeTiles } from '../map/TileIndex.js';
import { generateNodeTiles, generateDungeonLevels, ARCHETYPES } from '../map/MapGenerator.js';
import { ensureChildLink } from '../map/TilePaint.js';
import { resolveEntryTile } from '../map/EntryPoint.js';
import { entranceArtFor, freshNodeId } from '../map/NodeEdits.js';
import {
  linkedDescendants,
  regenerateLanding,
  regenerateSnapshot,
  regenerateTokenMoves,
} from '../map/RegenerateNode.js';
import { creaturePlacementsIn, moveCreature } from '../entities/CreatureMap.js';
import { forgetEntries } from '../map/EntryMemory.js';
import { revealAround } from '../map/FogOfWar.js';
import { describeTile } from '../map/TileCoords.js';
import { moveCharacter, placementsIn, recallFrom } from '../party/CharacterTokens.js';
import { mulberry32 } from '../util/Rng.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmModal, alertModal } from '../ui/Modal.js';
import { generateDialog } from '../ui/GenerateDialog.js';
import { resyncMapViews } from './mapResync.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */
/** @typedef {import('../ui/GenerateDialog.js').GenerateChoice} GenerateChoice */
/** @typedef {{ width: number, height: number, tiles: import('../types/map.js').Tile[], entry: string }} Layout */

/**
 * The question the GM answers before a non-empty node is replaced. It names
 * the sub-maps that go with the old tiles, when there are any.
 * @param {import('../types/map.js').MapNode} node
 * @param {import('../types/map.js').MapNode[]} removed
 * @returns {string}
 */
function replaceQuestion(node, removed) {
  const base = `Replace every tile in "${node.name}" with a generated map?`;
  if (removed.length === 0) return base;
  const count = removed.length === 1 ? 'the 1 sub-map' : `the ${removed.length} sub-maps`;
  return `${base} This also removes ${count} its tiles lead to.`;
}

/**
 * This is Build-mode procedural generation. It fills the current node with
 * an archetype layout (wilderness or town for regions, dungeon or castle for
 * interiors) at a size preset, as an alternative to painting a large map
 * tile by tile. Archetypes are filtered to the node's kind, and overwriting
 * a non-empty node asks for confirmation. The sub-maps the old tiles led to
 * are removed with the tiles, because nothing reaches them once the tiles
 * are gone. The stroke-undo ring records the whole change.
 * @param {AppContext} app
 * @param {MapEnv} env the map wiring's shared context, for the stroke-undo
 *   snapshot and the post-generate resync
 */
export function wireGenerateAction(app, env) {
  const { palette, grid, navigator, partyTracker, state } = app;

  const generateBtn = mustGetElement('generate-btn');
  generateBtn.addEventListener('click', async () => {
    const node = navigator.getCurrentNode();
    const archetypes = ARCHETYPES[node.kind];

    /**
     * Build and cache the full generation result for a dialog choice. The
     * RNG is seeded from the choice, so the preview the dialog draws and the
     * layout stamped on accept are the same map. The seed shown to the GM
     * reproduces it later. This function builds multi-level dungeons whole,
     * so the preview's level 1 carries the exact stairs the accepted map will.
     * The rng is kept so the entrance art drawn after the layout follows the
     * seed too.
     * @type {{ key: string, gen: Layout, levels: ReturnType<typeof generateDungeonLevels> | null, rng: () => number } | null}
     */
    let candidate = null;
    const freshId = () => freshNodeId((id) => Boolean(grid.getNode(id)));
    /** @param {GenerateChoice} choice */
    const buildCandidate = (choice) => {
      if (candidate?.key !== JSON.stringify(choice)) {
        const rng = mulberry32(choice.seed);
        candidate = { key: JSON.stringify(choice), ...buildLayout(choice, rng), rng };
      }
      return candidate;
    };
    /**
     * @param {GenerateChoice} choice
     * @param {() => number} rng
     * @returns {{ gen: Layout, levels: ReturnType<typeof generateDungeonLevels> | null }}
     */
    const buildLayout = (choice, rng) => {
      if (choice.archetype === 'dungeon') {
        // A dungeon can be a chain of levels. Each level's stairs-down
        // links to a freshly created child node that holds the level
        // below, so stairs always connect to a real generated level.
        const options = { size: choice.size, levels: choice.levels };
        const levels = generateDungeonLevels(palette, options, rng, freshId);
        return { gen: levels[0], levels };
      }
      const options = { kind: node.kind, archetype: choice.archetype, size: choice.size };
      return { gen: generateNodeTiles(palette, options, rng), levels: null };
    };
    /** @param {GenerateChoice} choice */
    const makeCandidate = (choice) => buildCandidate(choice).gen;

    const values = await generateDialog({
      archetypes,
      makeCandidate,
      imageCache: env.mapCanvas.renderer.imageCache,
      returnFocus: generateBtn,
    });
    if (!values) return;
    const removed = linkedDescendants([...grid.nodes.values()], node);
    if (
      node.tiles.length > 0 &&
      !(await confirmModal(replaceQuestion(node, removed), {
        variant: 'danger',
        confirmLabel: 'Replace',
      }))
    ) {
      return;
    }
    const built = buildCandidate(values);
    const gen = built.gen;
    const deeper = built.levels ? built.levels.slice(1) : [];
    const removedIds = new Set(removed.map((n) => n.id));
    // The regenerated layout replaces the node, removes the sub-maps its old
    // tiles led to, adds the deeper levels, and can restamp its parent's
    // entrance link below. It also recalls every character standing in a
    // removed node and re-lands every character and creature standing in the
    // node itself. Record all of it so the stroke-undo ring can revert it.
    env.recordEdit(
      regenerateSnapshot({
        node,
        parent: grid.getParent(node),
        created: deeper.map((level) => /** @type {string} */ (level.id)),
        removed,
        party: partyTracker.getPosition(),
        recalled: placementsIn(state.characters, new Set([...removedIds, node.id])),
        creatures: creaturePlacementsIn(state.creatures, new Set([node.id])),
        entryTiles: state.entryTiles,
      }),
    );
    for (const doomed of removed) {
      if (grid.getNode(doomed.id)) grid.removeNode(doomed.id);
    }
    state.characters = recallFrom(state.characters, removedIds);
    // Nothing leads to the removed sub-maps any more, so how they were
    // entered no longer describes anything.
    state.entryTiles = forgetEntries(state.entryTiles, removedIds);
    deeper.forEach((level, i) => {
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
    grid.updateNode(withNodeTiles({ ...node, width: gen.width, height: gen.height }, gen.tiles));
    // A generated map must be reachable from the overworld, not just
    // internally connected. If no parent tile links to this node yet, stamp
    // one (a POI marker matching the archetype) on the parent tile nearest
    // its center, so there is always a way in. Tell the GM where it landed,
    // so the GM can move it.
    const parent = grid.getParent(node);
    if (parent) {
      const artFor = entranceArtFor(values.archetype);
      const linked = ensureChildLink(parent, node.id, {
        // Wilderness gets no marker. The link rides the existing terrain tile
        // (or a fresh grass tile) and shows as a region outline once discovered.
        markerRef: artFor ? (palette.get(artFor.marker)?.imageRef ?? null) : null,
        createRef: palette.pickVariant('grass', built.rng).imageRef,
        poiType: artFor ? artFor.poi : null,
      });
      if (linked.tileId) {
        grid.updateNode(linked.node);
        alertModal(
          `Linked "${node.name}" from ${parent.name} at ${describeTile(linked.tileId)}, so it can be reached during play. Repaint or relink that tile to move the entrance.`,
          { title: 'Entrance placed', label: 'OK' },
        );
      }
    }
    // If the regenerated layout has shrunk past the party, replaced the
    // party's tile with void or wall, or removed the level the party stood
    // in, re-land the party on the layout. Every split character and every
    // placed creature standing in the node needs the same treatment on their
    // own tile. Every landing reads the same node, before any move reveals
    // fog on it.
    const position = partyTracker.getPosition();
    const fresh = grid.getNode(node.id) ?? node;
    const layout = {
      nodeId: node.id,
      width: gen.width,
      height: gen.height,
      entry: gen.entry,
      landingFor: (/** @type {string} */ tileId) => resolveEntryTile(fresh, tileId),
    };
    const moveTo = regenerateLanding({
      position,
      nodeId: node.id,
      removedIds,
      width: gen.width,
      height: gen.height,
      entry: gen.entry,
      landing: resolveEntryTile(fresh, position.tileId),
    });
    const moves = regenerateTokenMoves({ ...layout, tokens: state.characters });
    const foeMoves = regenerateTokenMoves({ ...layout, tokens: state.creatures });
    if (moveTo) partyTracker.moveTo(moveTo.nodeId, moveTo.tileId);
    for (const move of moves) {
      state.characters = moveCharacter(state.characters, move.id, {
        nodeId: node.id,
        tileId: move.tileId,
      });
    }
    for (const move of foeMoves) {
      state.creatures = moveCreature(state.creatures, move.id, {
        nodeId: node.id,
        tileId: move.tileId,
      });
    }
    if (moves.length) {
      // A character's step reveals fog around it, the same as a walk does.
      // Without this, a moved token stands in a blank fog field. A creature
      // reveals nothing: fog follows the party and the characters.
      let revealed = grid.getNode(node.id) ?? fresh;
      for (const move of moves) {
        revealed = revealAround(revealed, move.tileId, partyTracker.revealRadius);
      }
      grid.updateNode(revealed);
    }
    // The moves above change which creatures stand on the party's tile,
    // which is what a running fight is scoped to.
    if (moveTo || foeMoves.length) app.actions.syncCombatLocation();
    resyncMapViews(app, env, { reframe: true });
    app.actions.markDirty();
    app.toasts.show(`Generated ${values.archetype} map in "${node.name}" (seed ${values.seed}).`);
  });
}
