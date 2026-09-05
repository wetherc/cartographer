/**
 * The surfaces that come and go: dialogs, context menus, and toasts. Each
 * one is opened by a button here, because there is nothing to show until it
 * is open. Which of them to use for a given question is a policy decision,
 * covered in `docs/architecture/conventions.md`.
 */

import { textButton } from '../../../src/ui/buttons.js';
import { openContextMenu } from '../../../src/ui/ContextMenu.js';
import { alertModal, confirmDelete, confirmModal, promptModal } from '../../../src/ui/Modal.js';
import { setTip } from '../../../src/ui/Tooltip.js';
import { notify } from '../runtime.js';

/** @type {import('../runtime.js').Section} */
export const overlaysSection = {
  id: 'overlays',
  title: 'Dialogs, menus, and toasts',
  blurb:
    'Every dialog in the app shares one lifecycle. It captures the opener, shows the native dialog ' +
    'element, and on close removes it and gives focus back before the promise resolves. Escape ' +
    'always dismisses a dialog.',
  stories: [
    {
      title: 'promptModal',
      notes:
        'The form asks one question and returns one answer. It resolves to a record of field name to string, or null when the GM dismisses it. With the wide option, the fields lay out two per row.',
      classes: '.modal .modal__title .modal__actions',
      render: () =>
        textButton('Open promptModal', async () => {
          const result = await promptModal(
            'New encounter',
            [
              { name: 'name', label: 'Name', value: 'Goblin' },
              { name: 'hp', label: 'Hit points', type: 'number', value: '7', min: 1 },
              {
                name: 'tier',
                label: 'Tier',
                type: 'select',
                value: 'minion',
                options: [
                  { value: 'minion', label: 'Minion' },
                  { value: 'elite', label: 'Elite' },
                  { value: 'boss', label: 'Boss' },
                ],
              },
              { name: 'notes', label: 'Notes', type: 'textarea', full: true, value: '' },
            ],
            { wide: true, submitLabel: 'Create' },
          );
          notify(result ? `Created ${result.name}` : 'Dismissed');
        }),
    },
    {
      title: 'confirmModal and alertModal',
      notes:
        'A confirm is for a question with two real answers, an alert is for a notification that has to block, and anything that does not have to block is a toast instead.',
      classes: '.modal .btn--primary',
      render: () => [
        textButton('Open confirmModal', async () => {
          const ok = await confirmModal(
            'Load the example campaign? The current campaign is replaced.',
            {
              confirmLabel: 'Load example',
            },
          );
          notify(ok ? 'Confirmed' : 'Cancelled');
        }),
        textButton('Open alertModal', async () => {
          await alertModal('The save file is from a newer version and cannot be read.');
          notify('Acknowledged');
        }),
      ],
    },
    {
      title: 'confirmDelete',
      notes:
        'confirmDelete is the one wording for deleting a named entity. It defines the question and the danger button, so no call site restates them.',
      classes: '.modal .btn--danger',
      render: () =>
        textButton(
          'Open confirmDelete',
          async () => {
            const ok = await confirmDelete(
              'Goblin',
              'This also clears it from the initiative order.',
            );
            notify(ok ? 'Deleted' : 'Kept');
          },
          { variant: 'danger' },
        ),
    },
    {
      title: 'openContextMenu',
      notes:
        'The context menu is the right-click counterpart to a dialog, for a choice that needs no form. Focus moves to the first item, the arrow keys cycle through the items, and Escape dismisses the menu. Each item acts through its own callback.',
      classes: '.context-menu .context-menu__item',
      render: () =>
        textButton('Open a context menu', (event) => {
          openContextMenu(
            [
              { label: 'Move party here', onSelect: () => notify('Moved') },
              { label: 'Reveal this tile', onSelect: () => notify('Revealed') },
              { label: 'Clear the tile', onSelect: () => notify('Cleared') },
            ],
            { clientX: event.clientX, clientY: event.clientY },
          );
        }),
    },
    {
      title: 'setTip',
      notes:
        'The app has one tooltip element and one set of delegated listeners, mounted in main.js. A widget opts in with setTip, which writes a data-tip attribute and clears any native title. Hover either control below for a second, or Tab to it for the hint at once. The box is a popover, so it also draws over a modal dialog.',
      classes: '.tooltip',
      render: () => [
        setTip(
          textButton('Hover me', () => notify('Clicked')),
          'What this button does',
        ),
        setTip(
          textButton('Two lines', () => notify('Clicked')),
          'The first line names the thing.\nThe second line explains it.',
        ),
      ],
    },
    {
      title: 'mountToasts',
      notes:
        'The app mounts one stack on document.body and injects it app-wide as app.toasts. The stack has role="status" and aria-live="polite", so it announces a message without stealing focus. Every button on this page reports through it.',
      classes: '.toast-stack .toast',
      render: () =>
        textButton('Show a toast', () => {
          notify('Campaign saved.');
        }),
    },
  ],
};
