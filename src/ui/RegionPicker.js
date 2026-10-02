import { textButton } from './buttons.js';
import { el } from './dom.js';
import { labeled, select, setOptions } from './formFields.js';

/**
 * The picker value that paints no region: a stroke with it clears the link
 * of every cell it crosses.
 */
export const NO_REGION = '';

/**
 * @typedef {Object} RegionSource
 * @property {() => { id: string, name: string }[]} list the regions the node in view can link to: its children
 * @property {() => Promise<string | null>} create ask for a new child node, and return its id, or null when the GM cancels
 */

/**
 * Mount the Region brush's choice of region, shown under the palette tools
 * while the Region brush is active. A select names each child of the node in
 * view plus "No region", and a New button creates a child and picks it. The
 * select keeps the GM's pick across a refresh when that child still exists,
 * and otherwise picks the first child, so a stroke never paints a region
 * that is gone.
 * @param {RegionSource} source
 * @returns {{ root: HTMLElement, refresh: () => void, getTarget: () => string | null, hasRegions: () => boolean, pick: (id: string) => void }}
 */
export function mountRegionPicker(source) {
  const picker = select([], NO_REGION);
  const newBtn = textButton('New', () => void createAndPick(), {
    icon: 'plus',
    ariaLabel: 'New region',
  });
  const hint = el(
    'p',
    'palette__hint u-muted',
    'Paint cells to link them to this region. Paint over another region to move its cells here.',
  );
  const root = el(
    'div',
    'palette__region',
    el('div', 'palette__region-row', labeled('Paint region', picker), newBtn),
    hint,
  );
  root.hidden = true;

  let regions = /** @type {{ id: string, name: string }[]} */ ([]);

  function refresh() {
    regions = source.list();
    const keep = regions.some((r) => r.id === picker.value) ? picker.value : null;
    setOptions(
      picker,
      [
        ...regions.map((r) => ({ value: r.id, label: r.name })),
        { value: NO_REGION, label: 'No region (clear link)' },
      ],
      keep ?? regions[0]?.id ?? NO_REGION,
    );
  }

  /** @param {string} id */
  function pick(id) {
    refresh();
    if (regions.some((r) => r.id === id)) picker.value = id;
    // A pick from code fires the same event as a pick by the GM, so a
    // listener that names the region (the map tool chip) stays current.
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function createAndPick() {
    const id = await source.create();
    if (id) pick(id);
  }

  return {
    root,
    refresh,
    getTarget: () => picker.value || null,
    hasRegions: () => regions.length > 0,
    pick,
  };
}
