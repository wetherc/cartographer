/**
 * The quest-link writes that follow a node edit or a creature delete. A link
 * to a node or a creature that is gone draws no chip, but it stays in the
 * save, so each removal path calls one of these to take the link off. The
 * pure rules live in `quest/QuestLinks.js`. Each function refreshes the
 * quest log when a quest changed. The caller marks the campaign dirty as
 * part of its own edit.
 */

import {
  linksAfterShrink,
  linksIn,
  unlinkMissingCreatures,
  unlinkNodes,
} from '../quest/QuestLinks.js';
import { dropMissingUnlocks } from '../quest/QuestUnlocks.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/quest.js').QuestLinkRef} QuestLinkRef */

/**
 * @param {AppContext} app
 * @param {Quest[]} next
 */
function store(app, next) {
  if (next === app.state.quests) return;
  app.state.quests = next;
  app.views.questPanel.update();
}

/**
 * Remove the links to creatures that are no longer in `state.creatures`.
 * `commitCreatures` calls this after every creature write, so every delete
 * path is covered. Most writes are HP changes in a fight, so the function
 * returns at once when no quest links a creature.
 * @param {AppContext} app
 */
export function pruneCreatureLinks(app) {
  const { quests, creatures } = app.state;
  if (!quests.some((q) => q.links.some((l) => l.kind === 'creature'))) return;
  store(app, unlinkMissingCreatures(quests, new Set(creatures.map((c) => c.id))));
}

/**
 * Remove the links to the given nodes, and return them so a stroke undo can
 * put them back with `restoreLinks`.
 * @param {AppContext} app
 * @param {Set<string>} nodeIds
 * @returns {QuestLinkRef[]}
 */
export function unlinkRemovedNodes(app, nodeIds) {
  const removed = linksIn(app.state.quests, nodeIds);
  if (removed.length > 0) store(app, unlinkNodes(app.state.quests, nodeIds));
  return removed;
}

/**
 * Turn the links to tiles outside a shrunk node into links to the whole node.
 * @param {AppContext} app
 * @param {string} nodeId
 * @param {number} width
 * @param {number} height
 */
export function shrinkNodeLinks(app, nodeId, width, height) {
  store(app, linksAfterShrink(app.state.quests, nodeId, width, height));
}

/**
 * Remove the ids of deleted quests from every unlock list. The quest delete
 * calls this, so no quest offers to reveal a quest that is gone.
 * @param {AppContext} app
 */
export function pruneUnlocks(app) {
  store(app, dropMissingUnlocks(app.state.quests));
}
