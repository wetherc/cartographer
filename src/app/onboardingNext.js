import { el, mustGetElement } from '../ui/dom.js';
import { textButton } from '../ui/buttons.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * The second Welcome step, after "Generate a world" builds a world. It
 * names the next tasks: create the characters, and check where the party
 * starts. The card uses the same overlay and classes as the Welcome card,
 * and its heading takes focus, so a keyboard user lands inside it.
 * @param {AppContext} app
 * @param {boolean} partyStart whether the party moved to a start beside a
 *   town. It stays where it was when the GM picked another archetype, or
 *   when the new world has no town with open land beside it.
 */
export function showNextSteps(app, partyStart) {
  const viewport = mustGetElement('map-viewport');
  viewport.querySelector('.onboarding')?.remove();
  const heading = el('h2', 'card__title', 'Your world is ready');
  heading.tabIndex = -1;
  const card = el(
    'div',
    'onboarding__card card u-col u-g2',
    heading,
    el(
      'p',
      'onboarding__blurb u-muted',
      partyStart
        ? 'The party starts beside a town. Next, create the characters and check the party start.'
        : 'The party has not moved. Next, create the characters and move the party to its start.',
    ),
  );
  const overlay = el('div', 'onboarding', card);
  // Focus moves to the map before the overlay goes, so it does not drop to
  // the page body. The New character form then takes it from the map.
  const close = () => {
    mustGetElement('map-canvas').focus();
    overlay.remove();
  };

  /** @param {string} label @param {string} hint @param {() => void} action */
  const option = (label, hint, action) => {
    const button = textButton(
      label,
      () => {
        close();
        action();
      },
      { className: 'onboarding__option' },
    );
    card.appendChild(el('div', 'u-col u-g1', button, el('p', 'onboarding__hint u-muted', hint)));
  };

  option('Create a character', 'Switch to Play mode and open the New character form.', () => {
    app.actions.setMode('play');
    const add = mustGetElement('party-container').querySelector('.character-roster__add');
    if (add instanceof HTMLButtonElement) add.click();
  });
  option('Check the party start', 'Switch to Play mode and show the party on the map.', () =>
    app.actions.setMode('play'),
  );
  card.appendChild(textButton('Keep building', close, { className: 'onboarding__skip' }));

  viewport.appendChild(overlay);
  heading.focus();
}
