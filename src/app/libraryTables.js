import { mustGetElement } from '../ui/dom.js';
import { mountLibraryPanel } from '../ui/LibraryPanel.js';
import { buildTableForm } from '../ui/TableForm.js';
import {
  activeTableEntries,
  nameKey,
  removeEntry,
  renameConflict,
  upsertEntry,
} from '../library/Library.js';
import { tableSummary } from '../dice/RandomTable.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/library.js').CustomLibrary} CustomLibrary */

/**
 * Mount the Tables list of Library mode. A table has no id, because nothing
 * in a campaign points at one, so an edit stores under the name key alone.
 * A rename removes the old custom entry, and a rename onto the name of
 * another table is refused with a toast, because the store would replace
 * that table.
 * @param {AppContext} app
 * @param {{
 *   updateCustom: (edit: (base: CustomLibrary) => CustomLibrary) => void,
 *   makeRemoveHandler: (noun: string, apply: (key: string) => void) => (key: string, source: string) => Promise<boolean>,
 * }} deps
 * @returns {{ update: () => void }}
 */
export function mountTablePanel(app, { updateCustom, makeRemoveHandler }) {
  return mountLibraryPanel(mustGetElement('library-tables-container'), {
    addLabel: 'New table',
    getEntries: () =>
      activeTableEntries().map(({ entry, source }) => ({
        key: nameKey(entry),
        name: entry.name,
        summary: tableSummary(entry),
        source,
      })),
    buildEditor: (key, close) => {
      const found = key ? activeTableEntries().find(({ entry }) => nameKey(entry) === key) : null;
      return buildTableForm({
        table: found?.entry ?? null,
        submitLabel: found ? 'Save' : 'Add',
        onCancel: close,
        onSubmit: (table) => {
          const newKey = nameKey(table);
          const renamed = key !== newKey;
          const target = activeTableEntries().find(({ entry }) => nameKey(entry) === newKey);
          if (renameConflict({ found, target, renamed })) {
            app.toasts.show(
              `Another table is already named "${table.name}". Choose a different name.`,
              { level: 'error' },
            );
            return;
          }
          updateCustom((base) => {
            const held = key && renamed ? removeEntry(base.tables, key, nameKey) : base.tables;
            return { ...base, tables: upsertEntry(held, table, nameKey) };
          });
          close();
        },
      });
    },
    onRemove: makeRemoveHandler('table', (key) =>
      updateCustom((base) => ({ ...base, tables: removeEntry(base.tables, key, nameKey) })),
    ),
  });
}
