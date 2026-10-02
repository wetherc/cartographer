import { createMapNode } from '../map/TileGrid.js';
import { withNodeTiles } from '../map/TileIndex.js';
import {
  generateNodeTiles,
  archetypesFor,
  levelsLeft,
  NESTED_ARCHETYPES,
  STACKED_ARCHETYPES,
  SIZE_OPTIONS,
} from '../map/MapGenerator.js';
import { expandTree } from '../map/GeneratorTree.js';
import { renamedFor } from '../map/GeneratorNames.js';
import { resolveEntryTile } from '../map/EntryPoint.js';
import { freshNodeId } from '../map/NodeEdits.js';
import {
  blockSize,
  linkedDescendants,
  regenerateLanding,
  regenerateSnapshot,
  regenerateTokenMoves,
  reshapeParent,
  stackBase,
  stackPlace,
} from '../map/RegenerateNode.js';
import { creaturePlacementsIn, moveCreature, unplaceFrom } from '../entities/CreatureMap.js';
import { bindingsIn, tileBindingsLost, unbindFrom, unbindTiles } from '../handout/Handouts.js';
import { linksIn } from '../quest/QuestLinks.js';
import { unlinkRemovedNodes } from './questCleanup.js';
import { refreshLocationPanels } from './locationPanels.js';
import { forgetEntries } from '../map/EntryMemory.js';
import { describeTile } from '../map/TileCoords.js';
import { moveCharacter, placementsIn, recallFrom } from '../party/CharacterTokens.js';
import { mulberry32 } from '../util/Rng.js';
import { mustGetElement } from '../ui/dom.js';
import { confirmModal, alertModal } from '../ui/Modal.js';
import { generateDialog } from '../ui/GenerateDialog.js';
import { resyncMapViews } from './mapResync.js';
import { worldStart } from '../map/WorldStart.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('./mapWiring.js').MapEnv} MapEnv */
/** @typedef {import('../ui/GenerateDialog.js').GenerateChoice} GenerateChoice */
/** @typedef {import('../map/GeneratorTree.js').TreeRoot} TreeRoot */
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
 * an archetype layout (a climate archetype or a town for regions, a dungeon
 * or a castle for interiors) at a size preset, as an alternative to painting a large map
 * tile by tile. Archetypes are filtered to the node's kind, and overwriting
 * a non-empty node asks for confirmation. The sub-maps the old tiles led to
 * are removed with the tiles, because nothing reaches them once the tiles
 * are gone. The generation also creates the new sub-maps: the levels below
 * a dungeon, the cellar under a trapdoor, and, to the depth the GM picks,
 * the maps of the places on the new map (see `GeneratorTree.expandTree`).
 * The stroke-undo ring records the whole change, so one undo removes every
 * new sub-map.
 * @param {AppContext} app
 * @param {MapEnv} env the map wiring's shared context, for the stroke-undo
 *   snapshot and the post-generate resync
 */
export function wireGenerateAction(app, env) {
  const { palette, grid, navigator, partyTracker, state } = app;

  const generateBtn = mustGetElement('generate-btn');
  /**
   * Open the Generate dialog for the current node and apply the choice.
   * `presets` starts the Archetype and Sub-maps fields on given values when
   * the node offers that archetype.
   * @param {{ archetype?: string, depth?: string }} [presets]
   * @returns {Promise<{ partyStart: boolean } | null>} null when the GM cancels.
   *   `partyStart` tells whether the party moved to the start of a new world.
   */
  async function openGenerate(presets = {}) {
    const node = navigator.getCurrentNode();
    // A node that its parent reaches by a staircase is a level of a stack.
    // It keeps the staircase back to its parent, so the dialog offers only
    // the archetypes that make one, and a level below the first gets its
    // number in the stack.
    const stack = stackPlace(node, (n) => grid.getParent(n));
    const archetypes = archetypesFor(node.kind, stack?.back ?? null);
    const parent = grid.getParent(node);

    /**
     * The parent as the choice leaves it, with the guide of the new map
     * (`RegenerateNode.reshapeParent`), or null for the root node. It reads
     * the parent from the grid on each call, so the accepted regeneration
     * starts from the parent as it stands when the dialog closes.
     * @param {GenerateChoice} choice
     */
    const reshapeFor = (choice) => {
      const current = grid.getParent(node);
      if (!current) return null;
      return reshapeParent({
        parent: current,
        nodeId: node.id,
        archetype: choice.archetype,
        palette,
        rng: mulberry32(choice.seed),
      });
    };

    /**
     * The spec of the top map for a dialog choice. The preview and the
     * accepted tree both generate the top map from this spec and a fresh RNG
     * seeded from the choice, so the preview is the map the GM gets, and the
     * seed shown to the GM reproduces it later. A multi-level dungeon or
     * cave previews its first level with the stairs down that lead to the
     * level below. A generated name follows the new archetype
     * (`GeneratorNames.renamedFor`), so the label of a world region names
     * its new climate. A level of a stack keeps its name, because its name
     * comes from the top of the stack. An open-terrain map follows the
     * parent block under the node.
     * @param {GenerateChoice} choice
     * @returns {TreeRoot}
     */
    const rootFor = (choice) => {
      const name = stack ? node.name : renamedFor(node.name, choice.archetype);
      return {
        id: node.id,
        name,
        base: stack ? stackBase(node.name) : name,
        kind: node.kind,
        environ: node.environ,
        archetype: choice.archetype,
        size: choice.size,
        levels: choice.levels,
        level: stack?.level,
        guide: reshapeFor(choice)?.guide,
      };
    };
    /** @type {{ key: string, gen: Layout } | null} */
    let preview = null;
    /** @param {GenerateChoice} choice */
    const makeCandidate = (choice) => {
      const key = JSON.stringify({ ...choice, depth: 0 });
      if (preview?.key !== key) {
        const root = rootFor(choice);
        const spec = { ...root, environ: root.environ ?? undefined };
        preview = { key, gen: generateNodeTiles(palette, spec, mulberry32(choice.seed)) };
      }
      return preview.gen;
    };

    const removed = linkedDescendants([...grid.nodes.values()], node);
    /** @type {GenerateChoice | null} the choice of the last dialog, kept when the GM cancels the replace confirm */
    let last = null;
    /** @type {GenerateChoice | null} */
    let values = null;
    // Cancel on the replace confirm returns to the dialog with the same
    // choice, so the GM does not lose the archetype, size, and seed.
    for (;;) {
      values = await generateDialog({
        archetypes,
        sizes: SIZE_OPTIONS,
        size: last?.size ?? (parent ? blockSize(parent, node.id) : undefined),
        stacked: STACKED_ARCHETYPES,
        maxLevels: levelsLeft(stack?.level ?? 1),
        nested: NESTED_ARCHETYPES,
        makeCandidate,
        imageCache: env.mapCanvas.renderer.imageCache,
        returnFocus: generateBtn,
        archetype:
          last?.archetype ??
          (archetypes.some((a) => a.value === presets.archetype) ? presets.archetype : undefined),
        depth: last ? String(last.depth) : presets.depth,
        levels: last?.levels,
        seed: last?.seed,
      });
      if (!values) return null;
      if (
        node.tiles.length === 0 ||
        (await confirmModal(replaceQuestion(node, removed), {
          title: `Replace the map of ${node.name}?`,
          variant: 'danger',
          confirmLabel: 'Replace',
        }))
      ) {
        break;
      }
      last = values;
    }
    const tree = expandTree(
      palette,
      rootFor(values),
      { seed: values.seed, depth: values.depth },
      () => freshNodeId((id) => Boolean(grid.getNode(id))),
    );
    const [gen, ...deeper] = tree.nodes;
    const removedIds = new Set(removed.map((n) => n.id));
    // Every tile of the node is new, so a handout bound to one of the old
    // tiles binds to the whole node.
    const lostTiles = tileBindingsLost(state.handouts, node.id, () => false);
    // The regenerated layout replaces the node, removes the sub-maps its old
    // tiles led to, adds the new sub-maps, and can restamp its parent's
    // entrance link below. It also empties every location the removed nodes
    // held, and re-lands every character and creature standing in the node
    // itself. Record all of it so the stroke-undo ring can revert it.
    env.recordEdit({
      ...regenerateSnapshot({
        node,
        parent: grid.getParent(node),
        created: deeper.map((sub) => sub.id),
        removed,
        party: partyTracker.getPosition(),
        recalled: placementsIn(state.characters, new Set([...removedIds, node.id])),
        creatures: creaturePlacementsIn(state.creatures, new Set([...removedIds, node.id])),
        handouts: [...bindingsIn(state.handouts, removedIds), ...lostTiles],
        entryTiles: state.entryTiles,
      }),
      questLinks: linksIn(state.quests, removedIds),
    });
    for (const doomed of removed) {
      if (grid.getNode(doomed.id)) grid.removeNode(doomed.id);
    }
    // Every location the removed nodes held now names a node that is gone,
    // which hides whatever holds it from every panel. A character rejoins
    // the party, a creature becomes unplaced, a handout becomes
    // campaign-wide, and a quest link goes, the same answers the delete path
    // gives.
    state.characters = recallFrom(state.characters, removedIds);
    state.creatures = unplaceFrom(state.creatures, removedIds);
    state.handouts = unbindTiles(unbindFrom(state.handouts, removedIds), lostTiles);
    unlinkRemovedNodes(app, removedIds);
    // Nothing leads to the removed sub-maps any more, so how they were
    // entered no longer describes anything.
    state.entryTiles = forgetEntries(state.entryTiles, removedIds);
    for (const sub of deeper) {
      const child = createMapNode(sub.id, sub.name, sub.parentId, sub.width, sub.height, {
        kind: sub.kind,
        environ: sub.environ,
      });
      grid.addNode(withNodeTiles(child, sub.tiles));
    }
    grid.updateNode(
      withNodeTiles({ ...node, name: gen.name, width: gen.width, height: gen.height }, gen.tiles),
    );
    // A generated map must be reachable from the overworld, not just
    // internally connected. If no parent tile links to this node yet, stamp
    // one (a POI marker matching the archetype) on the parent tile nearest
    // its center, so there is always a way in. Tell the GM where it landed,
    // so the GM can move it. An existing link keeps its tile, and its marker
    // changes to match the new archetype. The ground of the linked block, such
    // as a region on a world map, changes to the climate of the new archetype
    // (`RegionRepaint.repaintRegionBlock`). The new map follows that block
    // (`RegenerateNode.reshapeParent`). The snapshot above records the
    // parent, so undo restores both.
    const linked = reshapeFor(values);
    if (linked) {
      if (linked.node !== grid.getParent(node)) grid.updateNode(linked.node);
      if (linked.tileId) {
        alertModal(
          `Linked "${gen.name}" from ${linked.node.name} at ${describeTile(linked.tileId)}, so it can be reached during play. Repaint or relink that tile to move the entrance.`,
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
    // The new layout starts in fog. The party and every character still in
    // the node reveal fog around the tile they stand on, whether or not they
    // moved, the same as a walk does. Without this, a party whose tile stayed
    // valid stands in a blank fog field. A creature reveals nothing, because
    // fog follows the party and the characters.
    const seers = [
      partyTracker.getPosition(),
      ...state.characters.map((c) => c.location).filter((at) => at != null),
    ].filter((at) => at.nodeId === node.id);
    if (seers.length) {
      const revealed = grid.getNode(node.id) ?? fresh;
      grid.updateNode(
        partyTracker.reveal(
          revealed,
          seers.map((at) => at.tileId),
        ),
      );
    }
    // A new world puts the party beside its first town, inside that town's
    // region, so Play mode opens on land. The snapshot above records the
    // party, so undo puts it back.
    const start = !parent && values.archetype === 'world' ? worldStart(tree.nodes) : null;
    const startNode = start ? grid.getNode(start.nodeId) : undefined;
    if (start && startNode) {
      partyTracker.moveTo(start.nodeId, start.tileId);
      // A character split off on the old world map rejoins the party, so it
      // does not stay behind while the party token stands in a region. A
      // character in any other node keeps its place. The snapshot above
      // records the old places, so undo puts them back.
      state.characters = recallFrom(state.characters, new Set([node.id]));
      grid.updateNode(partyTracker.reveal(startNode, [start.tileId]));
    }
    env.finishEdit();
    // The removal and the moves above change which creatures stand on the
    // party's tile, which is what a running fight is scoped to.
    app.actions.syncCombatLocation();
    resyncMapViews(app, env, { reframe: true });
    refreshLocationPanels(app);
    app.actions.markDirty();
    const subs = deeper.length === 1 ? '1 sub-map' : `${deeper.length} sub-maps`;
    const extra = deeper.length ? ` with ${subs}` : '';
    const unbuilt = tree.skipped ? ` ${tree.skipped} more places have no map yet.` : '';
    app.toasts.show(
      `Generated ${values.archetype} map in "${gen.name}"${extra} (seed ${values.seed}).${unbuilt}`,
    );
    return { partyStart: Boolean(start && startNode) };
  }

  generateBtn.addEventListener('click', () => void openGenerate());
  // The Welcome card starts a world with its regions and towns. A world is
  // the top map, so the dialog opens on the root node. On a sub-region it
  // would put a second world inside that region, and the party would not move.
  app.actions.generateWorld = () => {
    const [root] = grid.getBreadcrumb(navigator.currentNodeId);
    if (root && root.id !== navigator.currentNodeId) env.goToNode(root.id);
    return openGenerate({ archetype: 'world', depth: '9' });
  };
}
