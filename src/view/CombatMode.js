/**
 * What a following tab's mode must become when it adopts another tab's save.
 *
 * Mode is per-tab, and the app does not sync it on purpose. A display
 * pinned to the world map must not follow the GM into Build mode. A fight
 * starting or ending is the one exception. The combat screen has nothing to
 * show unless a fight runs. A tab left on the combat screen after the fight
 * ends sits empty. A tab on the map when a fight starts needs
 * someone to walk over and click Open combat. This module decides both
 * cases. The tab plumbing that acts on the answer lives elsewhere.
 */

/** @typedef {import('../types/app.js').AppMode} AppMode */

/**
 * The mode a tab must switch to after it adopts a save, or null to stay in
 * place. Only the Play and combat modes move. An authoring tab in Build or
 * Library stays as it is, because a fight starting is not a reason to
 * discard what the tab has open.
 * @param {AppMode} mode The mode this tab is in.
 * @param {{ hadFight: boolean, hasFight: boolean }} fight Whether a combat
 *   was running before the adopted save, and whether one is running in it.
 * @returns {AppMode | null}
 */
export function followerMode(mode, { hadFight, hasFight }) {
  if (mode === 'combat' && !hasFight) return 'play';
  if (mode === 'play' && hasFight && !hadFight) return 'combat';
  return null;
}
