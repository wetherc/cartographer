import {
  addHandoutBindings,
  commitEdit,
  liveEdits,
  popEdit,
  pushEdit,
  samePosition,
} from '../map/EditHistory.js';
import { revertEdit } from '../map/EditRevert.js';
import { withoutDeadLinks } from '../map/TileGrid.js';
import { collectSubtreeIds } from '../map/WorldTreeModel.js';
import { deleteLanding, locationsAfterDelete } from '../map/NodeCleanup.js';
import { forgetEntries } from '../map/EntryMemory.js';
import { restorePlacements } from '../party/CharacterTokens.js';
import { restoreCreaturePlacements } from '../entities/CreatureMap.js';
import { restoreBindings } from '../handout/Handouts.js';
import { restoreLinks } from '../quest/QuestLinks.js';
import { confirmModal } from '../ui/Modal.js';
import { unlinkRemovedNodes } from './questCleanup.js';
import { refreshLocationPanels } from './locationPanels.js';
import { resyncMapViews } from './mapResync.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/mapEnv.js').MapEnv} MapEnv */
/** @typedef {import('../types/map.js').MapNode} MapNode */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {import('../map/EditHistory.js').EditSnapshot} EditSnapshot */

/**
 * What the Undo and Redo buttons offer: a description of the edit each one
 * would revert or apply again, or null when its ring is empty.
 * @typedef {{ undo: string | null, redo: string | null }} StrokeStatus
 */

/**
 * The stroke-level undo and redo of Build mode. Two in-memory rings keep
 * the edits: an undo ring of edits to take back, and a redo ring of undone
 * edits to apply again. Each step applies one entry and pushes its inverse
 * onto the other ring, so undo and redo run the same code. A new edit
 * empties the redo ring. The rings last only for this session. The header
 * Undo and Redo buttons still step between saves.
 * @param {AppContext} app
 * @param {MapEnv} env
 * @param {{ confirm?: typeof confirmModal }} [options] `confirm` asks the
 *   GM before a step that removes maps or edits a map out of view
 */
export function createStrokeHistory(app, env, { confirm = confirmModal } = {}) {
  const { grid, navigator, partyTracker, toasts, state } = app;
  /** @type {EditSnapshot[]} */
  let undoRing = [];
  /** @type {EditSnapshot[]} */
  let redoRing = [];
  /** @type {(status: StrokeStatus) => void} */
  let listener = () => {};

  const exists = (/** @type {string} */ id) => grid.getNode(id) !== undefined;

  /** The edit and the map it changed, as the buttons and toasts name it.
   * @param {EditSnapshot} entry */
  function describe(entry) {
    const id = entry.nodes[0]?.id;
    const name = (id && grid.getNode(id)?.name) ?? entry.nodes[0]?.name;
    return name ? `${entry.label} on ${name}` : entry.label;
  }

  function status() {
    const undo = undoRing[undoRing.length - 1];
    const redo = redoRing[redoRing.length - 1];
    return { undo: undo ? describe(undo) : null, redo: redo ? describe(redo) : null };
  }

  const changed = () => listener(status());

  /** Save an edit's state before the edit. A new edit empties the redo ring.
   * @param {EditSnapshot} snapshot */
  function record(snapshot) {
    undoRing = pushEdit(undoRing, snapshot);
    redoRing = [];
    changed();
  }

  /** Record the nodes and the party as the most recent edit left them. */
  function finish() {
    undoRing = commitEdit(undoRing, (id) => grid.getNode(id), partyTracker.getPosition());
    changed();
  }

  /** Add handout bindings that the most recent edit learned at its end.
   * @param {import('../types/handout.js').HandoutBinding[]} bindings */
  function addBindings(bindings) {
    undoRing = addHandoutBindings(undoRing, bindings);
  }

  /** Drop the entries that name a node that is gone. A node delete calls
   * this, and so does each step before it reads a ring. */
  function prune() {
    const undo = liveEdits(undoRing, exists);
    const redo = liveEdits(redoRing, exists);
    if (undo === undoRing && redo === redoRing) return;
    undoRing = undo;
    redoRing = redo;
    changed();
  }

  /**
   * The nodes a step removes: each node the entry created, with any map
   * added under it since. Also where the party goes when it stands in one
   * of them and its recorded place is gone, or null when no node is left
   * to land in.
   * @param {EditSnapshot} entry
   */
  function plan(entry) {
    const nodes = grid.allNodes();
    /** @type {Set<string>} */
    const doomed = new Set();
    for (const id of entry.created) {
      if (exists(id)) for (const sub of collectSubtreeIds(nodes, id)) doomed.add(sub);
    }
    const added = new Set(entry.removed.map((n) => n.id));
    const position = partyTracker.getPosition();
    const inDoomed = doomed.has(position.nodeId);
    const recorded = entry.party;
    const goBack =
      recorded !== null &&
      (exists(recorded.nodeId) || added.has(recorded.nodeId)) &&
      !doomed.has(recorded.nodeId) &&
      (!entry.partyAfter || samePosition(position, entry.partyAfter) || inDoomed);
    /** @type {PartyPosition | null} */
    let party = goBack ? recorded : null;
    if (!party && inDoomed) {
      // The party comes out of the top removed map, beside its block in the
      // parent, the same landing a node delete gives.
      let rootId = position.nodeId;
      for (let up = grid.getNode(rootId)?.parentId; up && doomed.has(up);) {
        rootId = up;
        up = grid.getNode(up)?.parentId;
      }
      party = deleteLanding(nodes, rootId, doomed);
      if (!party) return null;
    }
    return { doomed, party };
  }

  /**
   * Apply one entry and return its inverse. The inverse names the nodes as
   * this step found them and left them, the maps it removed and added back,
   * and every location it moved, so the other ring can apply it later.
   * @param {EditSnapshot} entry
   * @param {{ doomed: Set<string>, party: PartyPosition | null }} steps
   * @returns {EditSnapshot}
   */
  function apply(entry, { doomed, party }) {
    const charIds = new Set(entry.recalled.map((p) => p.characterId));
    const foeIds = new Set(entry.creatures.map((p) => p.creatureId));
    const handoutIds = new Set(entry.handouts.map((b) => b.handoutId));
    const inDoomed = (/** @type {{ nodeId: string } | null | undefined} */ at) =>
      Boolean(at && doomed.has(at.nodeId));
    const startedAt = partyTracker.getPosition();
    const startNodes = entry.nodes.map((n) => /** @type {MapNode} */ (grid.getNode(n.id)));
    /** @type {EditSnapshot} */
    const inverse = {
      label: entry.label,
      nodes: [],
      after: [],
      created: entry.removed.map((n) => n.id),
      removed: grid.allNodes().filter((n) => doomed.has(n.id)),
      party: null,
      partyAfter: null,
      recalled: state.characters
        .filter((c) => charIds.has(c.id) || inDoomed(c.location))
        .map((c) => ({ characterId: c.id, location: c.location ?? null })),
      creatures: state.creatures
        .filter((c) => foeIds.has(c.id) || inDoomed(c.location))
        .map((c) => ({ creatureId: c.id, location: c.location ?? null })),
      handouts: state.handouts
        .filter((h) => handoutIds.has(h.id) || (h.nodeId !== null && doomed.has(h.nodeId)))
        .map((h) => ({ handoutId: h.id, nodeId: h.nodeId, tileId: h.tileId })),
      questLinks: [],
      entryTiles: entry.entryTiles || doomed.size ? state.entryTiles : null,
    };

    for (const id of entry.created) if (exists(id)) grid.removeNode(id);
    for (const node of entry.removed) grid.addNode(node);
    entry.nodes.forEach((before, i) => {
      const current = /** @type {MapNode} */ (grid.getNode(before.id));
      const reverted = revertEdit(current, before, entry.after?.[i] ?? null);
      grid.updateNode(withoutDeadLinks(reverted, exists));
    });
    inverse.nodes = startNodes;
    inverse.after = entry.nodes.map((n) => /** @type {MapNode} */ (grid.getNode(n.id)));

    // The removed maps hide what stood in them, so their locations go the
    // way a node delete sends them. The recorded places then come back,
    // except one on a map that is gone.
    const left = locationsAfterDelete(
      {
        party: startedAt,
        characters: state.characters,
        creatures: state.creatures,
        handouts: state.handouts,
      },
      doomed,
      startedAt,
    );
    const onMap = (/** @type {{ nodeId: string } | null} */ at) => !at || exists(at.nodeId);
    state.characters = restorePlacements(
      left.characters,
      entry.recalled.filter((p) => onMap(p.location)),
    );
    state.creatures = restoreCreaturePlacements(
      left.creatures,
      entry.creatures.filter((p) => onMap(p.location)),
    );
    state.handouts = restoreBindings(
      left.handouts,
      entry.handouts.filter((b) => b.nodeId === null || exists(b.nodeId)),
    );
    inverse.questLinks = unlinkRemovedNodes(app, doomed);
    state.quests = restoreLinks(state.quests, entry.questLinks ?? []);
    app.views.questPanel.update();
    state.entryTiles = entry.entryTiles ?? forgetEntries(state.entryTiles, doomed);

    if (party) partyTracker.moveTo(party.nodeId, party.tileId);
    const endedAt = partyTracker.getPosition();
    if (!samePosition(startedAt, endedAt)) {
      inverse.party = startedAt;
      inverse.partyAfter = endedAt;
    }
    return inverse;
  }

  /**
   * The question a step asks first, or null when it can run at once. A step
   * asks when it removes maps, or when its edit is on a map out of view.
   * @param {'undo' | 'redo'} direction
   * @param {EditSnapshot} entry
   * @param {Set<string>} doomed
   */
  function question(direction, entry, doomed) {
    const parts = [];
    if (doomed.size) {
      const what = doomed.size === 1 ? 'map' : 'maps';
      parts.push(
        `This removes ${doomed.size} ${what}. A character on them rejoins the party, and a creature on them becomes unplaced.`,
      );
    }
    const target = entry.nodes[0].id;
    if (target !== navigator.currentNodeId) {
      parts.push(`The edit is on ${grid.getNode(target)?.name ?? target}, not on the map in view.`);
    }
    if (!parts.length) return null;
    const verb = direction === 'undo' ? 'Undo' : 'Redo';
    return { message: parts.join(' '), title: `${verb} the ${describe(entry)}?`, verb };
  }

  /**
   * Take back the newest edit of one ring, after a confirm when the step
   * removes maps or changes a map out of view. The inverse goes onto the
   * other ring.
   * @param {'undo' | 'redo'} direction
   */
  async function step(direction) {
    prune();
    const ring = () => (direction === 'undo' ? undoRing : redoRing);
    let entry = ring()[ring().length - 1];
    if (!entry) {
      toasts.show(`Nothing to ${direction}.`);
      return;
    }
    let steps = plan(entry);
    const ask = steps && question(direction, entry, steps.doomed);
    if (steps && ask) {
      const ok = await confirm(ask.message, {
        title: ask.title,
        confirmLabel: ask.verb,
        variant: steps.doomed.size ? 'danger' : 'primary',
      });
      if (!ok) return;
      // The map can change while the dialog is open (a save adopted from
      // another tab), so the step reads the ring and the plan again.
      prune();
      if (ring()[ring().length - 1] !== entry) return;
      steps = plan(entry);
    }
    if (!steps) {
      toasts.show(`Cannot ${direction} this edit while the party stands in a map it removes.`, {
        level: 'error',
      });
      return;
    }
    const popped = popEdit(ring());
    entry = /** @type {EditSnapshot} */ (popped.snapshot);
    const inverse = apply(entry, steps);
    if (direction === 'undo') {
      undoRing = popped.history;
      redoRing = pushEdit(redoRing, inverse);
    } else {
      redoRing = popped.history;
      undoRing = pushEdit(undoRing, inverse);
    }
    app.actions.syncCombatLocation();
    if (exists(navigator.currentNodeId)) {
      resyncMapViews(app, env, { reframe: true });
    } else {
      env.goToNode(entry.nodes[0].id);
    }
    refreshLocationPanels(app);
    app.actions.markDirty();
    toasts.show(`${direction === 'undo' ? 'Undid' : 'Redid'} the ${describe(entry)}.`);
    changed();
  }

  return {
    record,
    finish,
    addBindings,
    prune,
    status,
    undo: () => step('undo'),
    redo: () => step('redo'),
    /** Call `fn` with the new status after every change to a ring.
     * @param {(status: StrokeStatus) => void} fn */
    onChange(fn) {
      listener = fn;
      fn(status());
    },
  };
}
