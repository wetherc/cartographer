import { mountCampaignSearch } from '../ui/CampaignSearch.js';
import { mustGetElement } from '../ui/dom.js';
import { searchCampaign } from '../view/CampaignSearch.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../view/CampaignSearch.js').SearchTarget} SearchTarget */

/** The sidebar tab and the card of each panel a result can open. */
const PANELS = {
  quest: { tab: 'tab-story', card: 'quest-container' },
  npc: { tab: 'tab-story', card: 'npc-container' },
  handout: { tab: 'tab-story', card: 'handout-container' },
  log: { tab: 'tab-log', card: 'travelog-container' },
};

/** How long a found row keeps its highlight, in milliseconds. */
const FLASH_MS = 1600;

/**
 * Mount the header search box and turn a chosen match into a jump. The
 * search reads `app.state` and the grid on every keystroke, so it always
 * matches the campaign as it is, including a save adopted from another tab.
 * The viewer role decides what a match may show (see
 * `view/CampaignSearch.js`).
 *
 * A tile match opens its map in Play or Build mode and centers the tile. A
 * GM tab also selects the tile, which opens it in the Build rail's Tile tab.
 * A record match switches to Play mode, opens the sidebar tab of its list,
 * and scrolls its row into view with a short highlight. A row that the list
 * does not draw, such as a quest in a folded group, falls back to the card.
 * @param {AppContext} app
 * @returns {{ focus: () => void }}
 */
export function wireSearch(app) {
  const { state } = app;
  const search = mountCampaignSearch(mustGetElement('campaign-search-container'), {
    search: (query) =>
      searchCampaign(
        {
          quests: state.quests,
          creatures: state.creatures,
          handouts: state.handouts,
          travelog: state.travelog,
          nodes: [...app.grid.nodes.values()],
        },
        query,
        { gm: isGM(state.role), boundCharacterId: app.actions.getBoundCharacterId() },
      ),
    onChoose: (result) => jump(result.target),
  });

  /** @param {SearchTarget} target */
  function jump(target) {
    if (target.type === 'tile') {
      if (state.mode === 'library') app.actions.setMode('play');
      const location = { nodeId: target.nodeId, tileId: target.tileId };
      if (isGM(state.role)) app.actions.focusLocation(location);
      else app.actions.centerOnLocation(location);
      document.body.dataset.phoneView = 'map';
      mustGetElement('map-canvas').focus();
      return;
    }
    if (state.mode !== 'play') app.actions.setMode('play');
    const panel = PANELS[target.panel];
    mustGetElement(panel.tab).click();
    const card = mustGetElement(panel.card);
    const row = card.querySelector(
      `[data-entry-id="${CSS.escape(target.id)}"], [data-log-id="${CSS.escape(target.id)}"]`,
    );
    const found = /** @type {HTMLElement} */ (row ?? card);
    if (!found.hasAttribute('tabindex')) found.tabIndex = -1;
    found.scrollIntoView({ block: 'center' });
    found.focus({ preventScroll: true });
    found.classList.add('search-flash');
    setTimeout(() => found.classList.remove('search-flash'), FLASH_MS);
  }

  return search;
}
