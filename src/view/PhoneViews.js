/**
 * The views of the bottom bar that Play mode shows at phone width. Each
 * view shows one area of the Play screen. A view with a `tab` shows the
 * sidebar with that tab open, and the Map view shows the Session tab under
 * the map, so the clock and the nearby encounters stay one scroll away.
 * The Party view shows the party roster and the dice tray.
 * @typedef {{ id: string, label: string, tab: string | null }} PhoneView
 */

/** @type {readonly PhoneView[]} */
export const PHONE_VIEWS = Object.freeze([
  Object.freeze({ id: 'map', label: 'Map', tab: 'tab-session' }),
  Object.freeze({ id: 'party', label: 'Party', tab: null }),
  Object.freeze({ id: 'sheet', label: 'Sheet', tab: 'tab-character' }),
  Object.freeze({ id: 'story', label: 'Story', tab: 'tab-story' }),
  Object.freeze({ id: 'log', label: 'Log', tab: 'tab-log' }),
]);

/**
 * The view that shows a sidebar tab. A tab that no view names opens the
 * Map view, because that view shows the sidebar too.
 * @param {string} tabId the id of the selected sidebar tab
 * @returns {string} the id of the view
 */
export function phoneViewForTab(tabId) {
  return PHONE_VIEWS.find((view) => view.tab === tabId)?.id ?? 'map';
}

/**
 * The sidebar tab that a view opens.
 * @param {string} viewId the id of the view
 * @returns {string | null} the tab id, or null for a view without the sidebar
 */
export function tabForPhoneView(viewId) {
  return PHONE_VIEWS.find((view) => view.id === viewId)?.tab ?? null;
}
