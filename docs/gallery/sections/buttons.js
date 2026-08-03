/**
 * Buttons, chips, badges, labels, empty states, and the icon set. These are
 * the primitives in `src/ui/buttons.js` and `src/ui/icons.js`, which every
 * feature panel composes instead of building a `<button>` of its own.
 */

import {
  badge,
  bareButton,
  chip,
  emptyState,
  iconButton,
  removableChip,
  sectionLabel,
  segSwitch,
  textButton,
} from '../../../src/ui/buttons.js';
import { el } from '../../../src/ui/dom.js';
import { icon } from '../../../src/ui/icons.js';
import { notify } from '../runtime.js';

/** Every icon name, in the order `icons.js` documents them. */
const ICON_NAMES = /** @type {import('../../../src/ui/icons.js').IconName[]} */ ([
  'plus',
  'minus',
  'heal',
  'remove',
  'edit',
  'save',
  'export',
  'import',
  'dice',
  'd20',
  'add',
  'check',
  'chevron',
  'map',
  'fit',
  'sword',
  'shield',
  'clock',
  'flag',
  'scroll',
  'sparkles',
  'eye',
  'eye-off',
  'lock',
  'give',
  'sun',
  'moon',
  'monitor',
  'warning',
]);

/** @type {import('../runtime.js').Section} */
export const buttonsSection = {
  id: 'buttons',
  title: 'Buttons and chips',
  blurb:
    'Three button builders, a segmented switch, and the small read-only markers. ' +
    'In the snippets below, notify stands in for whatever handler the caller passes.',
  stories: [
    {
      title: 'textButton, every variant',
      notes:
        'The variant maps straight to a btn--* modifier. A destructive control always passes danger, stays visible, and confirms before it acts.',
      classes: '.btn .btn--primary .btn--danger .btn--success',
      render: () => [
        textButton('Neutral', () => notify('Neutral')),
        textButton('Primary', () => notify('Primary'), { variant: 'primary' }),
        textButton('Delete', () => notify('Delete'), { variant: 'danger' }),
        textButton('Heal', () => notify('Heal'), { variant: 'success' }),
      ],
    },
    {
      title: 'textButton with a leading icon',
      notes: 'The visible label is already the accessible name, so no ariaLabel is needed.',
      classes: '.btn > .icon',
      render: () => [
        textButton('New quest', () => notify('New quest'), { icon: 'add' }),
        textButton('Export', () => notify('Export'), { icon: 'export' }),
        textButton('Start combat', () => notify('Start combat'), {
          icon: 'sword',
          variant: 'primary',
        }),
      ],
    },
    {
      title: 'iconButton',
      notes:
        'The ariaLabel is required, since the glyph is the whole control. It also becomes the hover title unless a shorter title is given.',
      classes: '.btn.btn--icon',
      render: () => [
        iconButton('edit', 'Edit Goblin', () => notify('Edit'), { title: 'Edit' }),
        iconButton('save', 'Save Goblin as a template', () => notify('Save'), { title: 'Save' }),
        iconButton('remove', 'Delete Goblin', () => notify('Delete'), {
          variant: 'danger',
          title: 'Delete',
        }),
      ],
    },
    {
      title: 'bareButton',
      notes:
        'A button for the keyboard and the screen reader that wears no button chrome. The look comes from the class the caller passes.',
      classes: '.btn-bare',
      render: () =>
        bareButton([icon('map'), 'Ironhold Vale'], () => notify('Crumb'), {
          className: 'breadcrumb__crumb',
        }),
    },
    {
      title: 'segSwitch',
      notes:
        'A role="group" over one value. The selected button carries the active class and aria-pressed together.',
      classes: '.seg-switch .seg-switch__btn .seg-switch__btn--active',
      render: () =>
        segSwitch({
          ariaLabel: 'View role',
          options: [
            { value: 'gm', label: 'GM' },
            { value: 'player', label: 'Player' },
          ],
          value: 'gm',
          onChange: (next) => notify(`Role: ${next}`),
        }).element,
    },
    {
      title: 'chip and removableChip',
      notes:
        'A chip with onClick is a real button, so a chip cannot look clickable without being clickable. removeLabel names the thing removed when the visible label is not it.',
      classes: '.chip .chip__remove .btn-bare.chip',
      render: () => [
        chip('Poisoned'),
        chip('STR 16', { onClick: () => notify('Open the STR breakdown'), title: 'Edit STR' }),
        removableChip('Poisoned (3)', () => notify('Removed'), { removeLabel: 'Poisoned' }),
      ],
    },
    {
      title: 'badge',
      notes:
        'The read-only marker on a list row. A reading outside the three shared ones passes its own className.',
      classes: '.badge .badge--success .badge--danger .badge--neutral',
      render: () => [
        badge('custom'),
        badge('friendly', { variant: 'success' }),
        badge('hostile', { variant: 'danger' }),
        badge('unknown', { variant: 'neutral' }),
      ],
    },
    {
      title: 'sectionLabel and emptyState',
      notes:
        'The in-panel sub-heading and the one "nothing here yet" paragraph. sectionLabel is a span unless tag makes it a heading a screen reader can reach.',
      classes: '.section-label .empty-state.u-muted',
      stack: true,
      render: () => [sectionLabel('Active quests', { tag: 'h3' }), emptyState('No quests yet.')],
    },
    {
      title: 'icon, all 29 names',
      notes:
        'Each icon is a 24x24 stroke path drawn in currentColor, so it takes the color of the control around it. Every icon is aria-hidden, and the control owns the accessible name.',
      classes: '.icon',
      render: () =>
        el(
          'div',
          'gx-icons',
          ...ICON_NAMES.map((name) => el('div', 'gx-icons__item', icon(name, { size: 22 }), name)),
        ),
    },
  ],
};
