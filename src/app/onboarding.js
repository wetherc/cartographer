import { el, mustGetElement } from '../ui/dom.js';
import { textButton } from '../ui/buttons.js';
import { isBlankCampaign } from '../campaign/Campaigns.js';
import { writeStored } from '../storage/Footprint.js';
import { showNextSteps } from './onboardingNext.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

const ONBOARDED_KEY = 'campaign-builder:onboarded';

/**
 * First-run onboarding. A blank campaign in Play mode shows a fogged, empty
 * map with no hint that Build mode, generation, or the example campaign
 * exist. This function overlays three ways forward on the map until the GM
 * picks one or dismisses the overlay. After that, the overlay does not open
 * by itself again on this browser. The header's Welcome button opens it at
 * any time.
 * @param {AppContext} app
 */
export function maybeShowOnboarding(app) {
  mustGetElement('welcome-btn').addEventListener('click', () => showOnboarding(app));
  const blank = isBlankCampaign(app.grid, app.navigator.getCurrentNode(), app.state.characters);
  if (!blank || localStorage.getItem(ONBOARDED_KEY)) return;
  showOnboarding(app);
}

/**
 * Overlay the Welcome card on the map. Each way forward is a button with its
 * explanation as visible text under it, and the card heading takes focus on
 * mount, so a keyboard or screen reader user starts inside the card. A
 * second call while the card is open only moves focus back to it.
 * @param {AppContext} app
 */
function showOnboarding(app) {
  const viewport = mustGetElement('map-viewport');
  const open = /** @type {HTMLElement | null} */ (viewport.querySelector('.onboarding h2'));
  if (open) {
    open.focus();
    return;
  }
  const blank = isBlankCampaign(app.grid, app.navigator.getCurrentNode(), app.state.characters);
  const heading = el('h2', 'card__title', 'Welcome, GM');
  heading.tabIndex = -1;
  const card = el(
    'div',
    'onboarding__card card u-col u-g2',
    heading,
    el(
      'p',
      'onboarding__blurb u-muted',
      blank ? 'Your world is empty. Three ways to start:' : 'Three ways to build a campaign:',
    ),
  );
  const overlay = el('div', 'onboarding', card);

  // The overlay contains the focus, so focus moves to the map before the
  // overlay goes, where it would otherwise drop to the page body. An option
  // that opens a dialog then moves focus on from the map.
  const dismiss = () => {
    writeStored(ONBOARDED_KEY, '1');
    mustGetElement('map-canvas').focus();
    overlay.remove();
  };

  /** @param {string} label @param {string} hint @param {() => void} action @param {boolean} [primary] */
  const option = (label, hint, action, primary = false) => {
    const button = textButton(
      label,
      () => {
        dismiss();
        action();
      },
      { className: 'onboarding__option', variant: primary ? 'primary' : undefined },
    );
    card.appendChild(el('div', 'u-col u-g1', button, el('p', 'onboarding__hint u-muted', hint)));
  };

  option('Build it by hand', 'Switch to Build mode and paint tiles.', () =>
    app.actions.setMode('build'),
  );
  option(
    'Generate a world',
    'Switch to Build mode and generate a world with its regions and towns.',
    async () => {
      app.actions.setMode('build');
      const result = await app.actions.generateWorld();
      if (result) showNextSteps(app, result.partyStart);
    },
  );
  // The example is the quickest way for a new GM to see every panel in use,
  // so it is the primary choice.
  option(
    'Load the example campaign',
    'See a filled-in world first.',
    () => mustGetElement('example-btn').click(),
    true,
  );

  card.appendChild(textButton('Dismiss', dismiss, { className: 'onboarding__skip' }));

  viewport.appendChild(overlay);
  heading.focus();
}
