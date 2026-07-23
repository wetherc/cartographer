import { mustGetElement } from '../ui/dom.js';

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

  const overlay = document.createElement('div');
  overlay.className = 'onboarding';
  const card = document.createElement('div');
  card.className = 'onboarding__card card';
  const heading = document.createElement('h2');
  heading.className = 'card__title';
  heading.textContent = 'Welcome, GM';
  const blurb = document.createElement('p');
  blurb.className = 'onboarding__blurb';
  blurb.textContent = 'Your world is empty. Three ways to start:';
  card.append(heading, blurb);

  const dismiss = () => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    overlay.remove();
  };

  /** @param {string} label @param {string} hint @param {() => void} action */
  const option = (label, hint, action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn onboarding__option';
    btn.textContent = label;
    btn.title = hint;
    btn.addEventListener('click', () => {
      dismiss();
      action();
    });
    card.appendChild(btn);
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

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'btn onboarding__skip';
  skip.textContent = 'Dismiss';
  skip.addEventListener('click', dismiss);
  card.appendChild(skip);

  overlay.appendChild(card);
  mustGetElement('map-viewport').appendChild(overlay);
}
