/**
 * A cursor-following tooltip surfacing a tile's metadata (POI type, notes)
 * while hovering the map in Play mode — the read side of the Build-mode tile
 * inspector, which previously wrote data nothing displayed back during play.
 * Positioned fixed so no container offset math is needed, and nudged left
 * when it would spill past the viewport edge.
 * @param {HTMLElement} container
 * @returns {{
 *   show: (content: { title: string, notes: string }, clientX: number, clientY: number) => void,
 *   hide: () => void,
 * }}
 */
export function mountTileTooltip(container) {
  const el = document.createElement('div');
  el.className = 'tile-tooltip';
  el.hidden = true;
  container.appendChild(el);

  return {
    show(content, clientX, clientY) {
      el.innerHTML = '';
      if (content.title) {
        const title = document.createElement('div');
        title.className = 'tile-tooltip__title';
        title.textContent = content.title;
        el.appendChild(title);
      }
      if (content.notes) {
        const notes = document.createElement('div');
        notes.className = 'tile-tooltip__notes';
        notes.textContent = content.notes;
        el.appendChild(notes);
      }
      el.hidden = false;
      const margin = 12;
      const width = el.offsetWidth;
      const left = Math.min(clientX + margin, window.innerWidth - width - margin);
      el.style.left = `${Math.max(margin, left)}px`;
      el.style.top = `${clientY + margin}px`;
    },
    hide() {
      el.hidden = true;
    },
  };
}
