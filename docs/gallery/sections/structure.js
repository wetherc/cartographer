/**
 * The composite shapes: tab strips, disclosures, stat bars, and the list
 * panel that most feature rails are a configuration of.
 */

import { buildStatBar } from '../../../src/ui/CharacterBars.js';
import { buildDisclosure } from '../../../src/ui/Disclosure.js';
import { el } from '../../../src/ui/dom.js';
import { emptyState } from '../../../src/ui/buttons.js';
import { mountListPanel } from '../../../src/ui/listPanel.js';
import { buildTabs } from '../../../src/ui/Tabs.js';
import { notify } from '../runtime.js';

/**
 * Demo rows for the list panel. They are module-level constants because the
 * panel's repaint guard compares row objects by identity, the same as the
 * immutable entities the real panels draw.
 * @type {{ id: string, title: string, notes: string, status: string }[]}
 */
const QUESTS = [
  {
    id: 'q1',
    title: 'Find the missing caravan',
    notes: 'Last seen east of the ford.',
    status: 'active',
  },
  { id: 'q2', title: 'Bargain with the toll keeper', notes: '', status: 'active' },
  { id: 'q3', title: 'Deliver the sealed letter', notes: '', status: 'completed' },
];

/** @type {import('../runtime.js').Section} */
export const structureSection = {
  id: 'structure',
  title: 'Panels and structure',
  blurb:
    'A tab strip, a disclosure, and the list panel. These own state and ARIA, so a feature panel ' +
    'describes what its rows hold and nothing else.',
  stories: [
    {
      title: 'buildTabs',
      notes:
        'The full ARIA tabs pattern: aria-selected, a roving tabIndex, arrow keys that wrap, and Home and End. Selecting a tab only flips hidden, so panel contents survive a click.',
      classes: '.tabs .tabs__tab .tabs__panel',
      stack: true,
      render: () => {
        const active = el('div', 'tabs__panel', 'Two encounters are on the party tile.');
        const nearby = el('div', 'tabs__panel', 'Four encounters are within one region.');
        const tabs = buildTabs({
          ariaLabel: 'Active and nearby encounters',
          tabs: [
            { id: 'active', label: 'Active encounter', panel: active },
            { id: 'nearby', label: 'Nearby encounters', panel: nearby },
          ],
          onSelect: (id) => notify(`Tab: ${id}`),
        });
        return [tabs.tablist, active, nearby];
      },
    },
    {
      title: 'buildDisclosure',
      notes:
        'The header and the body come back as siblings, so a panel puts them in whatever box its layout needs. A label takes the shared section-label treatment. Pass the last known state back in as expanded, since a redrawing panel rebuilds its DOM.',
      classes: '.disclosure .disclosure__chevron .disclosure--open .section-label',
      stack: true,
      render: () => {
        const body = el(
          'div',
          'u-col u-g1',
          el('span', '', 'Longsword'),
          el('span', '', 'Chain shirt'),
          el('span', '', 'Healer kit'),
        );
        const disclosure = buildDisclosure({
          label: 'Carried',
          body,
          expanded: true,
          onToggle: (open) => notify(open ? 'Opened' : 'Closed'),
        });
        return [disclosure.head, disclosure.body];
      },
    },
    {
      title: 'buildStatBar',
      notes:
        'One wide line with a label, a fill track, and the numbers. band colors the fill by the fraction left, in three steps, for a bar read at a glance. update rewrites four properties rather than rebuilding the line.',
      classes: '.stat-bar .stat-bar__track .stat-bar__fill .stat-bar__text',
      stack: true,
      render: () => [
        buildStatBar({ current: 24, max: 32 }, { modifier: 'hp', label: 'Hit points', band: true })
          .element,
        buildStatBar({ current: 3, max: 9 }, { modifier: 'mana', label: 'Spell points' }).element,
      ],
    },
    {
      title: 'mountListPanel',
      notes:
        'The rail skeleton: the root, the gate, the row loop with its group headings, the empty state, and the add controls. Every handler is awaited, and the panel redraws unless the handler returns false or null.',
      classes: '.quest-panel .quest-panel__row .quest-panel__group .panel-actions',
      stack: true,
      render: () => {
        const host = el('div');
        mountListPanel(host, {
          className: 'quest-panel',
          getRows: () => QUESTS,
          groupOf: (quest) => (quest.status === 'completed' ? 'Completed' : 'Active'),
          emptyMessage: 'No quests yet.',
          classes: {
            group: 'quest-panel__group',
            groupHeading: 'quest-panel__group-title',
            rowModifiers: (quest) => [
              quest.status === 'completed' && 'quest-panel__row--completed',
            ],
            add: 'quest-panel__add',
          },
          buildBody: (quest) =>
            el(
              'div',
              'quest-panel__body u-col u-g1',
              el('span', 'quest-panel__title', quest.title),
              quest.notes ? el('span', 'u-muted', quest.notes) : null,
            ),
          actions: (quest) => [
            { icon: 'edit', label: `Edit ${quest.title}`, onClick: () => notify('Edit') },
            {
              icon: 'remove',
              label: `Delete ${quest.title}`,
              variant: 'danger',
              onClick: () => notify('Delete'),
            },
          ],
          addButtons: () => [{ label: 'New quest', icon: 'add', onClick: () => notify('New') }],
        });
        return host;
      },
    },
    {
      title: 'The player view of the same panel',
      notes:
        'A false gate is the read-only view. The panel builds no action buttons and no add controls at all, rather than hiding them with CSS.',
      classes: '.quest-panel__row',
      stack: true,
      render: () => {
        const host = el('div');
        mountListPanel(host, {
          className: 'quest-panel',
          gate: () => false,
          getRows: () => QUESTS,
          emptyMessage: 'No quests yet.',
          buildBody: (quest) => el('span', 'quest-panel__title', quest.title),
          actions: () => [],
          addButtons: () => [{ label: 'New quest', icon: 'add', onClick: () => notify('New') }],
        });
        return host;
      },
    },
    {
      title: 'card and empty-state',
      notes:
        'A bordered box with an uppercase heading, holding the one paragraph every empty list shows.',
      classes: '.card .card__title .empty-state',
      stack: true,
      render: () =>
        el('div', 'card', el('h3', 'card__title', 'Handouts'), emptyState('Nothing to show yet.')),
    },
  ],
};
