/**
 * Pure helpers for the links from a quest to the places and creatures of the
 * campaign. A link is a reference by id. When a node edit or a creature
 * delete removes the target, the functions here take the link off the quest,
 * so the save keeps no link to something that is gone. The node edit that
 * has a stroke undo records the links it removed with `linksIn` and puts
 * them back with `restoreLinks`, the same way `handout/Handouts.js` records
 * and restores its node bindings.
 */

import { tileWithinBounds } from '../map/NodeEdits.js';

/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/quest.js').QuestLink} QuestLink */
/** @typedef {import('../types/quest.js').QuestLinkRef} QuestLinkRef */

/**
 * @param {string} nodeId
 * @param {string | null} [tileId] null links the whole map
 * @returns {QuestLink}
 */
export function placeLink(nodeId, tileId = null) {
  return { kind: 'place', nodeId, tileId };
}

/**
 * @param {string} creatureId
 * @returns {QuestLink}
 */
export function creatureLink(creatureId) {
  return { kind: 'creature', creatureId };
}

/**
 * One string per distinct link target. Two links with the same key point at
 * the same thing, so a quest keeps at most one of them.
 * @param {QuestLink} link
 * @returns {string}
 */
export function linkKey(link) {
  return link.kind === 'place'
    ? `place:${link.nodeId}:${link.tileId ?? ''}`
    : `creature:${link.creatureId}`;
}

/**
 * Append a link. A link to a target that the quest already links is skipped.
 * @param {Quest} quest
 * @param {QuestLink} link
 * @returns {Quest}
 */
export function addLink(quest, link) {
  const key = linkKey(link);
  if (quest.links.some((l) => linkKey(l) === key)) return quest;
  return { ...quest, links: [...quest.links, link] };
}

/**
 * @param {Quest} quest
 * @param {string} key the `linkKey` of the link to remove
 * @returns {Quest}
 */
export function removeLink(quest, key) {
  const links = quest.links.filter((l) => linkKey(l) !== key);
  return links.length === quest.links.length ? quest : { ...quest, links };
}

/**
 * The links whose target still exists. The panel draws only these. A cleanup
 * path that this module does not see, such as a stroke undo that removes a
 * generated node, can leave a link to nothing, and a chip for it would jump
 * nowhere.
 * @param {QuestLink[]} links
 * @param {(id: string) => boolean} hasNode
 * @param {(id: string) => boolean} hasCreature
 * @returns {QuestLink[]}
 */
export function liveLinks(links, hasNode, hasCreature) {
  return links.filter((l) => (l.kind === 'place' ? hasNode(l.nodeId) : hasCreature(l.creatureId)));
}

/**
 * Apply `keep` to every quest's links. A changed link that matches a link
 * the quest already keeps is dropped, so a quest never lists one target
 * twice. The array keeps its identity when no quest changes, so the panels
 * that compare by identity skip a redraw.
 * @param {Quest[]} quests
 * @param {(link: QuestLink) => QuestLink | null} keep the link to store, or
 *   null to drop it
 * @returns {Quest[]}
 */
function mapLinks(quests, keep) {
  let changed = false;
  const next = quests.map((quest) => {
    let questChanged = false;
    /** @type {QuestLink[]} */
    const links = [];
    const seen = new Set();
    for (const link of quest.links) {
      const kept = keep(link);
      if (kept !== link) questChanged = true;
      if (!kept || seen.has(linkKey(kept))) continue;
      seen.add(linkKey(kept));
      links.push(kept);
    }
    if (!questChanged) return quest;
    changed = true;
    return { ...quest, links };
  });
  return changed ? next : quests;
}

/**
 * Every place link to one of the given nodes, with its quest and its
 * position, so a caller that is about to remove the links can put them back
 * later.
 * @param {Quest[]} quests
 * @param {Set<string>} nodeIds
 * @returns {QuestLinkRef[]}
 */
export function linksIn(quests, nodeIds) {
  /** @type {QuestLinkRef[]} */
  const refs = [];
  for (const quest of quests) {
    quest.links.forEach((link, index) => {
      if (link.kind === 'place' && nodeIds.has(link.nodeId)) {
        refs.push({ questId: quest.id, index, link });
      }
    });
  }
  return refs;
}

/**
 * Remove every place link to one of the given nodes. A node edit that
 * removes nodes calls this.
 * @param {Quest[]} quests
 * @param {Set<string>} nodeIds
 * @returns {Quest[]}
 */
export function unlinkNodes(quests, nodeIds) {
  return mapLinks(quests, (l) => (l.kind === 'place' && nodeIds.has(l.nodeId) ? null : l));
}

/**
 * Put the recorded links back at their positions. This is the undo of
 * `unlinkNodes`. The links go back in ascending position order, so each one
 * lands where it was when the rest of the list is as the edit left it. A
 * position past the end appends. A link for a quest that is gone, or a link
 * that the quest has again, is skipped.
 * @param {Quest[]} quests
 * @param {QuestLinkRef[]} refs
 * @returns {Quest[]}
 */
export function restoreLinks(quests, refs) {
  if (refs.length === 0) return quests;
  return quests.map((quest) => {
    const mine = refs.filter((r) => r.questId === quest.id).sort((a, b) => a.index - b.index);
    let links = quest.links;
    for (const { index, link } of mine) {
      const key = linkKey(link);
      if (links.some((l) => linkKey(l) === key)) continue;
      links = [...links.slice(0, index), link, ...links.slice(index)];
    }
    return links === quest.links ? quest : { ...quest, links };
  });
}

/**
 * Remove every creature link whose creature is not in `creatureIds`. Every
 * creature delete path ends in one commit, which calls this with the ids of
 * the creatures that remain.
 * @param {Quest[]} quests
 * @param {Set<string>} creatureIds
 * @returns {Quest[]}
 */
export function unlinkMissingCreatures(quests, creatureIds) {
  return mapLinks(quests, (l) =>
    l.kind === 'creature' && !creatureIds.has(l.creatureId) ? null : l,
  );
}

/**
 * The links after the node `nodeId` shrinks to `width` by `height`. A link
 * to a tile outside the new bounds becomes a link to the whole map. It does
 * not move to the nearest tile, because a quest link names one spot, and a
 * spot the GM did not pick gives a false lead.
 * @param {Quest[]} quests
 * @param {string} nodeId
 * @param {number} width
 * @param {number} height
 * @returns {Quest[]}
 */
export function linksAfterShrink(quests, nodeId, width, height) {
  return mapLinks(quests, (l) =>
    l.kind === 'place' &&
    l.nodeId === nodeId &&
    l.tileId !== null &&
    tileWithinBounds(l.tileId, width, height) !== null
      ? placeLink(nodeId)
      : l,
  );
}
