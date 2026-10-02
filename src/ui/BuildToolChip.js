import { el } from './dom.js';

/**
 * Mount the Build-mode tool chip on the map toolbar. It names what a click
 * on the map does, such as "Painting: Grass" or "Inspect", because the
 * palette that shows the active brush is often out of view. CSS hides the
 * chip outside Build mode. The chip is a status region, so a screen reader
 * hears the new tool when the brush or the open rail tab changes.
 * @param {HTMLElement} container the map toolbar
 * @param {() => string} getLabel
 * @returns {{ sync: () => void, element: HTMLElement }}
 */
export function mountBuildToolChip(container, getLabel) {
  const chip = el('span', 'map-controls__tool');
  chip.setAttribute('role', 'status');
  container.appendChild(chip);
  const sync = () => {
    const label = getLabel();
    if (chip.textContent !== label) chip.textContent = label;
  };
  sync();
  return { sync, element: chip };
}
