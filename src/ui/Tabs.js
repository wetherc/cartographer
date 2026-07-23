/**
 * Wire an accessible tab strip following the ARIA tabs pattern. The container
 * holds a `[role=tablist]` of `[role=tab]` buttons (each `aria-controls` its
 * panel) followed by the `[role=tabpanel]` elements; this only manages
 * selection state, so the caller owns the markup and the panels' content.
 *
 * Selecting a tab shows its panel and hides the rest, and moves the roving
 * `tabindex` so the arrow keys (Left/Right/Home/End) cycle tabs while only the
 * active tab is in the document tab order. The initially-selected tab is the
 * one already marked `aria-selected="true"` in the markup, defaulting to first.
 * @param {HTMLElement} tablist the `[role=tablist]` element
 * @returns {{ select: (tabId: string) => void }}
 */
export function wireTabs(tablist) {
  const tabs = /** @type {HTMLButtonElement[]} */ ([...tablist.querySelectorAll('[role=tab]')]);

  /** @param {HTMLButtonElement} tab @param {boolean} focus */
  function select(tab, focus) {
    for (const other of tabs) {
      const active = other === tab;
      other.setAttribute('aria-selected', String(active));
      other.tabIndex = active ? 0 : -1;
      const panelId = other.getAttribute('aria-controls');
      const panel = panelId && document.getElementById(panelId);
      if (panel) panel.hidden = !active;
    }
    if (focus) tab.focus();
  }

  tablist.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(/** @type {HTMLButtonElement} */ (event.target));
    if (index < 0) return;
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    select(tabs[next], true);
  });

  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab, false));
  }

  const initial = tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0];
  if (initial) select(initial, false);

  return {
    select: (tabId) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab) select(tab, false);
    },
  };
}
