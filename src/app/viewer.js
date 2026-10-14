import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Who looks at this tab: the GM, or a Player tab with the id of the character
 * it is bound to (null when unbound). The combat cards, the loadout, the
 * reaction gate, and the search filter all read this pair.
 * partyWiring registers `getBoundCharacterId` and mounts after the combat
 * screen, so a reload with a fight running reads the tab as unbound until
 * the reader exists. The next refresh corrects it.
 * @param {AppContext} app
 * @returns {{ gm: boolean, boundCharacterId: string | null }}
 */
export function viewerOf(app) {
  return {
    gm: isGM(app.state.role),
    boundCharacterId: app.actions.getBoundCharacterId?.() ?? null,
  };
}
