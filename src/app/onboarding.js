import { el, mustGetElement } from '../ui/dom.js';
import { textButton } from '../ui/buttons.js';
import { isBlankCampaign } from '../campaign/Campaigns.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

const ONBOARDED_KEY = 'campaign-builder:onboarded';

/**
 * First-run onboarding. A blank campaign in Play mode shows a fogged, empty
 * map with no hint that Build mode, generation, or the example campaign
 * exist. This function overlays three ways forward on the map until the GM
 * picks one or dismisses the overlay. After that, the overlay never shows
 * again on this browser. Each way forward is a button with its explanation
 * as visible text under it, and the card heading takes focus on mount, so a
 * keyboard or screen reader user starts inside the card.
 * @param {AppContext} app
 */
export function maybeShowOnboarding(app) {
  const blank = isBlankCampaign(app.grid, app.navigator.getCurrentNode(), app.state.characters);
  if (!blank || localStorage.getItem(ONBOARDED_KEY)) return;

  const heading = el('h2', 'card__title', 'Welcome, GM');
  heading.tabIndex = -1;
  const card = el(
    'div',
    'onboarding__card card u-col u-g2',
    heading,
    el('p', 'onboarding__blurb u-muted', 'Your world is empty. Three ways to start:'),
  );
  const overlay = el('div', 'onboarding', card);

  const dismiss = () => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    overlay.remove();
  };

  /** @param {string} label @param {string} hint @param {() => void} action */
  const option = (label, hint, action) => {
    const button = textButton(
      label,
      () => {
        dismiss();
        action();
      },
      { className: 'onboarding__option' },
    );
    card.appendChild(el('div', 'u-col u-g1', button, el('p', 'onboarding__hint u-muted', hint)));
  };

  option('Build it by hand', 'Switch to Build mode and paint tiles.', () =>
    app.actions.setMode('build'),
  );
  option('Generate a world', 'Switch to Build mode and auto-generate a map.', () => {
    app.actions.setMode('build');
    mustGetElement('generate-btn').click();
  });
  option('Load the example campaign', 'See a small filled-in world first.', () =>
    mustGetElement('example-btn').click(),
  );

  card.appendChild(textButton('Dismiss', dismiss, { className: 'onboarding__skip' }));

  mustGetElement('map-viewport').appendChild(overlay);
  heading.focus();
}
