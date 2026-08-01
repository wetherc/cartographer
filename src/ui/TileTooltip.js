import { append, el } from './dom.js';

/**
 * A cursor-following tooltip that shows a tile's metadata, POI type and
 * notes, while the map is hovered in Play mode. It is the read side of
 * the Build-mode tile inspector, which previously wrote data that nothing
 * displayed back during play. It uses fixed positioning, so no container
 * offset math is needed, and it shifts left when it spills past the
 * edge of the viewport.
 * @param {HTMLElement} container
 * @returns {{
 *   show: (content: { title: string, notes: string, npcs?: string }, clientX: number, clientY: number) => void,
 *   hide: () => void,
 * }}
 */
export function mountTileTooltip(container) {
  const tooltip = el('div', 'tile-tooltip');
  tooltip.hidden = true;
  container.appendChild(tooltip);

  return {
    show(content, clientX, clientY) {
      tooltip.innerHTML = '';
      append(tooltip, [
        !!content.title && el('div', 'tile-tooltip__title', content.title),
        !!content.npcs && el('div', 'tile-tooltip__npcs', content.npcs),
        !!content.notes && el('div', 'tile-tooltip__notes', content.notes),
      ]);
      tooltip.hidden = false;
      const margin = 12;
      const width = tooltip.offsetWidth;
      const left = Math.min(clientX + margin, window.innerWidth - width - margin);
      tooltip.style.left = `${Math.max(margin, left)}px`;
      tooltip.style.top = `${clientY + margin}px`;
    },
    hide() {
      tooltip.hidden = true;
    },
  };
}
