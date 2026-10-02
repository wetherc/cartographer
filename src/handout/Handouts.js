/**
 * Pure helpers for lore and read-aloud handouts. List-level operations
 * (unique id derivation, replace or remove by id) come from the rosters
 * through entities/Roster.js. This module owns only the per-handout fields,
 * the filters that decide who sees which handout where, the reveal toggle,
 * and what a map edit does to a binding. This keeps the module free of app
 * state, so tests can run against it directly.
 */

/** @typedef {import('../types/handout.js').Handout} Handout */
/** @typedef {import('../types/handout.js').HandoutBinding} HandoutBinding */
/** @typedef {import('../types/handout.js').HandoutViewer} HandoutViewer */

/**
 * @param {string} id
 * @param {string} title
 * @param {string} [body]
 * @param {string | null} [nodeId] Node the handout attaches to. Null means campaign-wide.
 * @param {boolean} [revealed]
 * @param {string | null} [image] Data URL of an attached image. Null means no image.
 * @param {{ tileId?: string | null, audience?: string[] | null }} [extra]
 *   The one tile of the node, and the characters who see it. Both default to null.
 * @returns {Handout}
 */
export function createHandout(
  id,
  title,
  body = '',
  nodeId = null,
  revealed = false,
  image = null,
  { tileId = null, audience = null } = {},
) {
  return {
    id,
    title,
    body,
    nodeId,
    tileId: nodeId === null ? null : tileId,
    revealed,
    image,
    audience: cleanAudience(audience),
  };
}

/**
 * An audience list as the handout keeps it: unique string ids, or null for
 * every player. An empty list also becomes null. A form with no box checked
 * then means every player, and a save cannot keep a handout that no player
 * tab can ever show.
 * @param {unknown} value
 * @returns {string[] | null}
 */
export function cleanAudience(value) {
  if (!Array.isArray(value)) return null;
  const ids = [...new Set(value.filter((id) => typeof id === 'string' && id !== ''))];
  return ids.length > 0 ? ids : null;
}

/**
 * Backfill fields a loaded handout can predate. A handout from an older
 * save has no tile and shows to every player.
 * @param {Handout} handout
 * @returns {Handout}
 */
export function withDefaults(handout) {
  const nodeId = handout.nodeId ?? null;
  return {
    ...handout,
    body: handout.body ?? '',
    nodeId,
    tileId: nodeId !== null && typeof handout.tileId === 'string' ? handout.tileId : null,
    revealed: handout.revealed ?? false,
    image: handout.image ?? null,
    audience: cleanAudience(handout.audience),
  };
}

/**
 * @param {Handout} handout
 * @returns {Handout}
 */
export function toggleRevealed(handout) {
  return { ...handout, revealed: !handout.revealed };
}

/**
 * The travelogue line for a handout the GM just revealed or hid, with its
 * log options. A handout for every player is news for every viewer. A hidden
 * handout, or one for only some characters, is GM-only, so the other Player
 * tabs do not learn its title.
 * @param {Handout} handout the handout after the change
 * @returns {[string, import('../types/log.js').LogOptions | undefined]}
 */
export function handoutRevealLine(handout) {
  if (!handout.revealed)
    return [`The handout ${handout.title} is hidden from players.`, { gm: true }];
  const line = `The party receives the handout ${handout.title}.`;
  return [line, handout.audience?.length ? { gm: true } : undefined];
}

/**
 * Handouts that belong to a node: those bound to the node or to one of its
 * tiles, plus campaign-wide handouts (nodeId null). Keeps the input order.
 * The GM's list is this one, so the GM can prepare a tile's handout before
 * the party gets there.
 * @param {Handout[]} handouts
 * @param {string} nodeId
 * @returns {Handout[]}
 */
export function handoutsAt(handouts, nodeId) {
  return handouts.filter((h) => h.nodeId === null || h.nodeId === nodeId);
}

/**
 * Whether a player tab bound to `boundId` is in the handout's audience. A
 * handout with no audience list shows to every tab. A chosen audience
 * excludes a spectator tab (`boundId` null).
 * @param {Handout} handout
 * @param {string | null} boundId
 * @returns {boolean}
 */
export function inAudience(handout, boundId) {
  return handout.audience === null || (boundId !== null && handout.audience.includes(boundId));
}

/**
 * The handouts one viewer gets while the party stands at `position`. The
 * GM gets every handout of the node (see `handoutsAt`). A player tab gets
 * only the revealed handouts that are campaign-wide, bound to the party's
 * node, or bound to the tile the party stands on. Of those, it gets only
 * the ones whose audience includes the tab's character. The player panel
 * adds the other revealed handouts of the same audience (see `revealedFor`),
 * so the body and image of a hidden handout never reach that tab's DOM.
 * @param {Handout[]} handouts
 * @param {{ nodeId: string, tileId: string }} position
 * @param {HandoutViewer} viewer
 * @returns {Handout[]}
 */
export function handoutsFor(handouts, position, viewer) {
  const here = handoutsAt(handouts, position.nodeId);
  if (viewer.gm) return here;
  return here.filter(
    (h) =>
      h.revealed &&
      (h.tileId === null || h.tileId === position.tileId) &&
      inAudience(h, viewer.boundCharacterId),
  );
}

/**
 * Every handout a Player tab bound to `boundId` may read: the revealed
 * handouts in its audience, wherever they are bound. The handouts of the
 * party's spot (see `handoutsFor`) come first, and the rest follow in list
 * order. A Player tab opened late, or on a new device, gets the same list
 * as a tab that was open when the GM revealed each handout.
 * @param {Handout[]} handouts
 * @param {{ nodeId: string, tileId: string }} position
 * @param {string | null} boundId
 * @returns {{ here: Handout[], earlier: Handout[] }}
 */
export function revealedFor(handouts, position, boundId) {
  const here = handoutsFor(handouts, position, { gm: false, boundCharacterId: boundId });
  const ids = new Set(here.map((h) => h.id));
  const earlier = handouts.filter((h) => h.revealed && !ids.has(h.id) && inAudience(h, boundId));
  return { here, earlier };
}

/**
 * Make the handouts bound to any of the given nodes campaign-wide. A node
 * edit that removes nodes calls this, so no handout stays bound to a node
 * that is gone, which would hide it from every panel. The tile binding goes
 * with the node. Handouts bound elsewhere keep their node, and the array
 * keeps its identity when nothing changes.
 * @param {Handout[]} handouts
 * @param {Set<string>} nodeIds
 * @returns {Handout[]}
 */
export function unbindFrom(handouts, nodeIds) {
  let changed = false;
  const next = handouts.map((h) => {
    if (h.nodeId === null || !nodeIds.has(h.nodeId)) return h;
    changed = true;
    return { ...h, nodeId: null, tileId: null };
  });
  return changed ? next : handouts;
}

/**
 * Where each handout bound to any of the given nodes was, so a caller that
 * is about to unbind them can bind them back later. A campaign-wide
 * handout, and a handout bound elsewhere, are not in the result.
 * @param {Handout[]} handouts
 * @param {Set<string>} nodeIds
 * @returns {HandoutBinding[]}
 */
export function bindingsIn(handouts, nodeIds) {
  return handouts
    .filter((h) => h.nodeId !== null && nodeIds.has(h.nodeId))
    .map((h) => ({ handoutId: h.id, nodeId: h.nodeId, tileId: h.tileId }));
}

/**
 * Where each handout bound to a tile of `nodeId` was, for every tile that
 * `keep` rejects. A map edit that erases, cuts off, or regenerates tiles
 * calls this before `unbindTiles`, so undo can bind them back.
 * @param {Handout[]} handouts
 * @param {string} nodeId
 * @param {(tileId: string) => boolean} keep false for a tile the edit removes
 * @returns {HandoutBinding[]}
 */
export function tileBindingsLost(handouts, nodeId, keep) {
  /** @type {HandoutBinding[]} */
  const lost = [];
  for (const h of handouts) {
    if (h.nodeId === nodeId && typeof h.tileId === 'string' && !keep(h.tileId)) {
      lost.push({ handoutId: h.id, nodeId, tileId: h.tileId });
    }
  }
  return lost;
}

/**
 * Bind each recorded handout to its whole node instead of its tile. The
 * array keeps its identity when there is nothing to unbind.
 * @param {Handout[]} handouts
 * @param {HandoutBinding[]} bindings from `tileBindingsLost`
 * @returns {Handout[]}
 */
export function unbindTiles(handouts, bindings) {
  if (bindings.length === 0) return handouts;
  const ids = new Set(bindings.map((b) => b.handoutId));
  return handouts.map((h) => (ids.has(h.id) ? { ...h, tileId: null } : h));
}

/**
 * Bind the recorded handouts back to their nodes and tiles. This is the
 * undo of `unbindFrom` and `unbindTiles`. Only the `nodeId` and `tileId`
 * fields change, so any other edit made to a handout since stays. A
 * binding for a handout that is gone is skipped.
 * @param {Handout[]} handouts
 * @param {HandoutBinding[]} bindings
 * @returns {Handout[]}
 */
export function restoreBindings(handouts, bindings) {
  if (bindings.length === 0) return handouts;
  const byId = new Map(bindings.map((b) => [b.handoutId, b]));
  return handouts.map((h) => {
    const b = byId.get(h.id);
    return b ? { ...h, nodeId: b.nodeId, tileId: b.nodeId === null ? null : b.tileId } : h;
  });
}

/**
 * The hidden handouts bound to the tile where the party stands. The GM tab
 * cues each one after a move, so the GM does not have to remember a handout
 * that waits on a tile. A campaign-wide or node-wide handout has no tile to
 * stand on, so it never cues.
 * @param {Handout[]} handouts
 * @param {{ nodeId: string, tileId: string }} position
 * @returns {Handout[]}
 */
export function handoutsCued(handouts, position) {
  return handouts.filter(
    (h) => !h.revealed && h.nodeId === position.nodeId && h.tileId === position.tileId,
  );
}

/**
 * The tiles of one node that have a hidden handout, for the GM's map badge.
 * @param {Handout[]} handouts
 * @param {string} nodeId
 * @returns {string[]}
 */
export function hiddenHandoutTiles(handouts, nodeId) {
  const tiles = new Set();
  for (const h of handouts) {
    if (!h.revealed && h.nodeId === nodeId && h.tileId !== null) tiles.add(h.tileId);
  }
  return [...tiles];
}
