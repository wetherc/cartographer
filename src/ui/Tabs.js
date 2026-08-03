import { bareButton } from './buttons.js';
import { classNames, el } from './dom.js';

/**
 * Wire an accessible tab strip that follows the ARIA tabs pattern. The
 * container holds a `[role=tablist]` of `[role=tab]` buttons, each with
 * `aria-controls` for its panel, followed by the `[role=tabpanel]`
 * elements. This function manages only the selection state. The caller
 * owns the markup and the content of the panels.
 *
 * A selection of a tab shows its panel and hides the rest, and moves the
 * roving `tabindex`, so the arrow keys, Left, Right, Home, and End, cycle
 * tabs while only the active tab sits in the document tab order. The
 * initially selected tab is the one already marked `aria-selected="true"`
 * in the markup, or the first tab by default.
 * @param {HTMLElement} tablist the `[role=tablist]` element
 * @param {{
 *   resolvePanel?: (panelId: string) => HTMLElement | null,
 *   onSelect?: (tabId: string) => void,
 * }} [options] `resolvePanel` finds a panel that is not yet in the
 *   document, which is how `buildTabs` wires a strip it has just built.
 *   `onSelect` fires for every selection, including the initial one.
 * @returns {{ select: (tabId: string) => void }}
 */
export function wireTabs(tablist, options = {}) {
  const tabs = /** @type {HTMLButtonElement[]} */ ([...tablist.querySelectorAll('[role=tab]')]);

  /** @param {HTMLButtonElement} tab @param {boolean} focus */
  function select(tab, focus) {
    for (const other of tabs) {
      const active = other === tab;
      other.setAttribute('aria-selected', String(active));
      other.tabIndex = active ? 0 : -1;
      const panelId = other.getAttribute('aria-controls');
      const panel =
        panelId && (options.resolvePanel?.(panelId) ?? document.getElementById(panelId));
      if (panel) panel.hidden = !active;
    }
    if (focus) tab.focus();
    options.onSelect?.(tab.id);
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

/** This keeps the generated ids of one strip separate from another's. */
let stripCount = 0;

/**
 * Build a tab strip and pair it with panels the caller has already
 * created. Most strips are written out in `index.html` and need only
 * `wireTabs`. The encounter and library panels decide their tabs at
 * runtime instead, and both used to hand-roll the buttons, the ARIA
 * attributes, and the arrow keys. The tab and panel ids are generated
 * here, since `aria-controls` needs a pairing the caller has no reason to invent.
 *
 * A selection only flips `hidden` on the panels, so a tab click costs
 * nothing. The contents of the panels outlive the click and refresh on
 * their own schedule.
 * @param {{
 *   ariaLabel: string,
 *   className?: string,
 *   tabs: { id: string, label: string, panel: HTMLElement }[],
 *   selected?: string,
 *   onSelect?: (id: string) => void,
 * }} options
 * @returns {{ tablist: HTMLElement, select: (id: string) => void }}
 */
export function buildTabs(options) {
  stripCount += 1;
  const prefix = `tabs${stripCount}`;
  /** @param {string} id */
  const tabId = (id) => `${prefix}-tab-${id}`;

  const tablist = el('div', classNames(['tabs', options.className]));
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', options.ariaLabel);

  /** @type {Map<string, HTMLElement>} */
  const panels = new Map();
  const selected = options.selected ?? options.tabs[0]?.id;

  for (const spec of options.tabs) {
    const panelId = `${prefix}-panel-${spec.id}`;
    spec.panel.id = panelId;
    spec.panel.setAttribute('role', 'tabpanel');
    spec.panel.setAttribute('aria-labelledby', tabId(spec.id));
    panels.set(panelId, spec.panel);

    const tab = bareButton([spec.label], undefined, { className: 'tabs__tab' });
    tab.id = tabId(spec.id);
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panelId);
    tab.setAttribute('aria-selected', String(spec.id === selected));
    tablist.appendChild(tab);
  }

  const { select } = wireTabs(tablist, {
    resolvePanel: (panelId) => panels.get(panelId) ?? null,
    onSelect: (id) => options.onSelect?.(id.slice(`${prefix}-tab-`.length)),
  });

  return { tablist, select: (id) => select(tabId(id)) };
}
