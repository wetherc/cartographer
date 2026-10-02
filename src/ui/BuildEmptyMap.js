import { textButton } from './buttons.js';
import { el } from './dom.js';

/**
 * Mount the empty state over the map canvas. It shows while the map in view
 * has no tile art. In Build mode the card offers the two ways to fill the
 * map. In Play mode a plainer card names the map, and the GM gets a button
 * that opens Build mode. CSS picks the card for the mode and role, and hides
 * both in Library mode. Call sync() after each draw; it touches the DOM only
 * when the state changes.
 * @param {HTMLElement} viewport the element that wraps the map canvas
 * @param {{ isBlank: () => boolean, getName: () => string, onPaint: () => void, onGenerate: () => void, onBuild: () => void }} opts
 * @returns {{ sync: () => void }}
 */
export function mountBuildEmptyMap(viewport, opts) {
  const title = el('p', 'map-empty__title');
  const card = el(
    'div',
    'map-empty__card map-empty__card--build u-col u-g2',
    title,
    el('p', 'map-empty__hint', 'Paint tiles by hand, or generate a layout and edit it.'),
    el(
      'div',
      'u-row u-g2 u-wrap',
      textButton('Paint tiles', opts.onPaint),
      textButton('Generate map', opts.onGenerate, { variant: 'primary' }),
    ),
  );
  const playTitle = el('p', 'map-empty__title');
  const buildBtn = textButton('Open Build mode', opts.onBuild);
  buildBtn.classList.add('map-empty__gm');
  const playCard = el(
    'div',
    'map-empty__card map-empty__card--play u-col u-g2',
    playTitle,
    el('p', 'map-empty__hint map-empty__gm', 'Paint or generate it in Build mode.'),
    buildBtn,
  );
  const root = el('div', 'map-empty', card, playCard);
  root.hidden = true;
  viewport.appendChild(root);

  /** @type {string | null} the name shown, or null while hidden */
  let shown = null;
  const sync = () => {
    const name = opts.isBlank() ? opts.getName() : null;
    if (name === shown) return;
    shown = name;
    root.hidden = name === null;
    if (name === null) return;
    title.textContent = `"${name}" has no tiles yet.`;
    playTitle.textContent = `"${name}" has no map yet.`;
  };
  return { sync };
}
