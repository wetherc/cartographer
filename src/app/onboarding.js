import { el, mustGetElement } from '../ui/dom.js';
import { textButton } from '../ui/buttons.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

const ONBOARDED_KEY = 'campaign-builder:onboarded';

/**
 * First-run onboarding: a blank campaign in Play mode is a fogged empty map
 * with no hint that Build mode, generation, or the example exist. Overlay the
 * three ways forward on the map until the GM picks one (or dismisses), then
 * never show it again on this browser.
 * @param {AppContext} app
 */
export function maybeShowOnboarding(app) {
  const blank =
    app.grid.nodes.size === 1 &&
    app.navigator.getCurrentNode().tiles.length === 0 &&
    app.state.characters.length === 0;
  if (!blank || localStorage.getItem(ONBOARDED_KEY)) return;

  const card = el(
    'div',
    'onboarding__card card',
    el('h2', 'card__title', 'Welcome, GM'),
    el('p', 'onboarding__blurb u-muted', 'Your world is empty. Three ways to start:'),
  );
  const overlay = el('div', 'onboarding', card);

  const dismiss = () => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    overlay.remove();
  };

  /** @param {string} label @param {string} hint @param {() => void} action */
  const option = (label, hint, action) => {
    card.appendChild(
      textButton(
        label,
        () => {
          dismiss();
          action();
        },
        { className: 'onboarding__option', title: hint },
      ),
    );
  };

  option('Build it by hand', 'Switch to Build mode and paint tiles', () =>
    app.actions.setMode('build'),
  );
  option('Generate a world', 'Switch to Build mode and auto-generate a map', () => {
    app.actions.setMode('build');
    mustGetElement('generate-btn').click();
  });
  option('Load the example campaign', 'See a small filled-in world first', () =>
    mustGetElement('example-btn').click(),
  );

  card.appendChild(textButton('Dismiss', dismiss, { className: 'onboarding__skip' }));

  mustGetElement('map-viewport').appendChild(overlay);
}
