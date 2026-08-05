/**
 * The design tokens and the utility layer, both defined in one `:root`
 * block in `styles/base.css`. The swatches below draw straight from the
 * custom properties, so switching the theme at the top of the page repaints
 * them without a reload.
 */

import { el } from '../../../src/ui/dom.js';

const SURFACES = ['--bg', '--surface', '--surface-raised', '--surface-sunken'];
const LINES = ['--border', '--border-strong'];
const ACCENTS = ['--accent', '--accent-hover', '--danger', '--success', '--warning', '--mana'];
const OVERLAY = ['--overlay-bg', '--overlay-text', '--overlay-npc'];
const SPACES = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6'];
const RADII = ['--radius-sm', '--radius', '--radius-lg', '--radius-pill'];
const TYPE = ['--text-display', '--text-heading', '--text-body', '--text-label'];

/**
 * One color swatch: a filled box over the token that fills it.
 * @param {string} token
 * @returns {HTMLElement}
 */
function swatch(token) {
  const box = el('div', 'gx-swatch__chip');
  box.style.background = `var(${token})`;
  return el('div', 'gx-swatch', box, token);
}

/**
 * One spacing or radius sample, drawn at the size the token names.
 * @param {string} token
 * @param {'space' | 'radius'} kind
 * @returns {HTMLElement}
 */
function sizeSample(token, kind) {
  const box = el('div', 'gx-swatch__chip');
  box.style.background = 'var(--accent)';
  if (kind === 'space') box.style.width = `var(${token})`;
  else box.style.borderRadius = `var(${token})`;
  return el('div', 'gx-swatch', box, token);
}

/**
 * One line of body text at the size the token names.
 * @param {string} token
 * @returns {HTMLElement}
 */
function typeSample(token) {
  const line = el('div', '', `${token}: the quick brown fox`);
  line.style.fontSize = `var(${token})`;
  return line;
}

/** @type {import('../runtime.js').Section} */
export const tokensSection = {
  id: 'tokens',
  title: 'Tokens and utilities',
  blurb:
    'Every color, space, radius, and type size is a custom property in one :root block. Each color ' +
    'is a single light-dark() declaration, so there is one set of tokens rather than a light set and ' +
    'a dark one. Never write a fallback: a missing token renders as nothing, which is visible, while a ' +
    'fallback hides the typo.',
  stories: [
    {
      title: 'Surfaces and lines',
      notes:
        'The four page surfaces, from the page behind everything to the sunken well inside a panel.',
      render: () => el('div', 'gx-swatches', ...[...SURFACES, ...LINES].map(swatch)),
    },
    {
      title: 'Accents',
      notes:
        'Every accent has a matching *-contrast partner, and a filled element always declares its own foreground from it. Add new accents as a pair.',
      render: () => el('div', 'gx-swatches', ...ACCENTS.map(swatch)),
    },
    {
      title: 'Over-map chrome',
      notes:
        'Pinned dark in both themes. Map controls, toasts, tooltips, and the onboarding scrim float over map art rather than the page surface.',
      render: () => el('div', 'gx-swatches', ...OVERLAY.map(swatch)),
    },
    {
      title: 'Spacing',
      notes:
        'The --space scale runs 0.25rem to 2rem, and the u-g1 to u-g4 gap utilities read from it.',
      render: () => el('div', 'gx-swatches', ...SPACES.map((token) => sizeSample(token, 'space'))),
    },
    {
      title: 'Radius',
      render: () => el('div', 'gx-swatches', ...RADII.map((token) => sizeSample(token, 'radius'))),
    },
    {
      title: 'Type scale',
      stack: true,
      render: () => TYPE.map(typeSample),
    },
    {
      title: 'Utilities',
      notes:
        'u-muted is the small secondary text of captions and row metadata. u-row and u-col are the two flex layouts, neither setting a gap, so both pair with u-g1 through u-g4. These are written at the call site, not folded into builder options, because they style the space around an element rather than the element itself.',
      classes: '.u-muted .u-row .u-col .u-wrap .u-g1 .u-g2 .u-g3 .u-g4',
      stack: true,
      render: () => [
        el('div', 'u-row u-g2', el('span', '', 'u-row u-g2'), el('span', 'u-muted', 'and u-muted')),
        el('div', 'u-col u-g1', el('span', '', 'u-col u-g1'), el('span', 'u-muted', 'stacked')),
      ],
    },
  ],
};
