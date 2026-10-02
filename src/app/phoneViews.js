import { segSwitch } from '../ui/buttons.js';
import { el, mustGetElement } from '../ui/dom.js';
import { PHONE_VIEWS, phoneViewForTab, tabForPhoneView } from '../view/PhoneViews.js';

/**
 * Mounts the bottom bar of Play mode at phone width. The stylesheet shows
 * the bar only there, and it shows one area of the Play screen for the view
 * in `body[data-phone-view]`. A view with a sidebar tab opens that tab
 * through the tab's own click handler. A tab that opens some other way, such
 * as the Sheet tab after a click on a party row, moves the bar to its view.
 * Code outside the bar can set `body[data-phone-view]` too, as a map pick
 * does to show the map. The bar watches the attribute and marks the view
 * that it names, so the selected button always matches the area on screen.
 */
export function wirePhoneViews() {
  const tablist = mustGetElement('sidebar-tabs');
  const selectedTab = () => tablist.querySelector('[role=tab][aria-selected=true]')?.id ?? '';

  /** @param {string} viewId */
  function show(viewId) {
    document.body.dataset.phoneView = viewId;
    bar.sync(viewId);
  }

  const bar = segSwitch({
    ariaLabel: 'Play view',
    className: 'phone-views__switch',
    options: PHONE_VIEWS.map((view) => ({ value: view.id, label: view.label })),
    value: phoneViewForTab(selectedTab()),
    onChange: (viewId) => {
      const tabId = tabForPhoneView(viewId);
      if (tabId) document.getElementById(tabId)?.click();
      show(viewId);
      window.scrollTo(0, 0);
    },
  });

  // The strip's own handlers run first, because they sit on the tabs.
  const follow = () => show(phoneViewForTab(selectedTab()));
  tablist.addEventListener('click', follow);
  tablist.addEventListener('keydown', follow);

  const nav = el('nav', 'phone-views', bar.element);
  nav.setAttribute('aria-label', 'Play views');
  document.body.append(nav);
  show(bar.getValue());
  new MutationObserver(() => {
    const viewId = document.body.dataset.phoneView;
    if (viewId) bar.sync(viewId);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-phone-view'] });
}
