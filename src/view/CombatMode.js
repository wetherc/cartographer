/**
 * What a following tab's mode should become when it adopts another tab's save.
 *
 * Mode is per-tab and deliberately not synced: a display pinned to the world
 * map must not follow the GM into Build mode. A fight starting or ending is the
 * exception. The combat screen only has anything to show while a fight runs, so
 * a tab left on it after the fight ends would sit empty, and a tab on the map
 * when a fight starts would need someone to walk over and click Open combat.
 * Both are decided here, apart from the tab plumbing that acts on the answer.
 */

/** @typedef {import('../types/app.js').AppMode} AppMode */

/**
 * The mode a tab should switch to after adopting a save, or null to stay put.
 * Only the Play and combat modes move: an authoring tab in Build or Library is
 * left alone, since a fight starting is not a reason to throw away what it has
 * open.
 * @param {AppMode} mode the mode this tab is in
 * @param {{ hadFight: boolean, hasFight: boolean }} fight whether a combat was
 *   running before the adopted save, and whether one is running in it
 * @returns {AppMode | null}
 */
export function followerMode(mode, { hadFight, hasFight }) {
  if (mode === 'combat' && !hasFight) return 'play';
  if (mode === 'play' && hasFight && !hadFight) return 'combat';
  return null;
}
