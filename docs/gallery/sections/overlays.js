/**
 * The surfaces that come and go: dialogs, context menus, and toasts. Each
 * one is opened by a button here, because there is nothing to show until it
 * is open. Which of them to use for a given question is a policy decision,
 * covered in `docs/architecture/conventions.md`.
 */

import { textButton } from '../../../src/ui/buttons.js';
import { openContextMenu } from '../../../src/ui/ContextMenu.js';
import { alertModal, confirmDelete, confirmModal, promptModal } from '../../../src/ui/Modal.js';
import { notify } from '../runtime.js';

/** @type {import('../runtime.js').Section} */
export const overlaysSection = {
  id: 'overlays',
  title: 'Dialogs, menus, and toasts',
  blurb:
    'Every dialog in the app shares one lifecycle: capture the opener, show the native dialog element, ' +
    'and on close remove it and give focus back before the promise resolves. Escape always dismisses.',
  stories: [
    {
      title: 'promptModal',
      notes:
        'One form, one answer. It resolves to a record of field name to string, or null when the GM dismisses it. With wide, the fields lay out two per row.',
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
        'A confirm is for a question with two real answers. An alert is for a notification that has to block. Anything that does not have to block is a toast instead.',
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
        'The one wording for deleting a named entity. It owns the question and the danger button, so no call site restates them.',
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
        'The right-click counterpart to a dialog, for a choice that needs no form. Focus moves to the first item, arrows cycle, Escape dismisses. The items act through their own callbacks.',
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
      title: 'mountToasts',
      notes:
        'One stack lives on document.body and is injected app-wide as app.toasts. It is role="status" aria-live="polite", so a message is announced without stealing focus. Every button on this page reports through it.',
      classes: '.toast-stack .toast',
      render: () =>
        textButton('Show a toast', () => {
          notify('Campaign saved.');
        }),
    },
  ],
};
