/**
 * The add/edit/delete callbacks a title-keyed campaign list wants. Quests and
 * handouts differ only in which state list they live on, what their dialog
 * asks for, and how a submitted record becomes an entry. Everything around
 * that is identical: prompt, reject an empty title, derive a unique id from the
 * title, append or replace, mark the campaign dirty, and confirm a delete by
 * name. That shared part lives here once, so a further list (a feat catalog,
 * say) supplies only its own three pieces.
 *
 * The dialog functions are injectable so the logic can be exercised without a
 * DOM; callers in the app leave them at their defaults.
 */

import { promptModal, confirmDelete } from '../ui/Modal.js';
import { slugId, replaceById, removeById } from '../entities/Roster.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/app.js').EntityListKey} EntityListKey */

/**
 * @template {EntityListKey} K
 * @typedef {import('../types/app.js').EntityListEntry<K>} Entry
 */

/**
 * Build the panel callbacks for one campaign list.
 *
 * `fields` is asked for the dialog's fields twice: with the entry being edited,
 * and with null when adding. `create` receives the id already slugged against
 * the list's existing ids; `patch` receives the entry to fold the edits into.
 * Both receive the trimmed title separately from the raw submitted record,
 * since the guard has already trimmed it.
 * @template {EntityListKey} K
 * @param {AppContext} app
 * @param {import('../types/app.js').EntityListSpec<K>} spec
 * @returns {{
 *   onAdd: () => Promise<Entry<K> | null>,
 *   onEdit: (entity: Entry<K>) => Promise<boolean>,
 *   onDelete: (id: string) => Promise<boolean>,
 * }}
 */
export function wireEntityList(app, spec) {
  const {
    key,
    noun,
    fields,
    create,
    patch,
    titleKey = 'title',
    editOptions,
    prompt = promptModal,
    confirm = confirmDelete,
  } = spec;

  const read = () => /** @type {Entry<K>[]} */ (app.state[key]);
  /** @param {Entry<K>[]} next */
  const write = (next) => {
    /** @type {any} */ (app.state)[key] = next;
    app.actions.markDirty();
  };
  /**
   * The submitted title, trimmed, or null if the dialog was dismissed or the
   * title left blank — the one thing every list requires.
   * @param {Record<string, string> | null} values
   */
  const readTitle = (values) => {
    const title = values?.[titleKey]?.trim();
    return values && title ? title : null;
  };

  return {
    onAdd: async () => {
      const values = await prompt(`New ${noun}`, fields(null));
      const title = readTitle(values);
      if (!values || !title) return null;
      const list = read();
      const created = create(
        slugId(
          title,
          list.map((entry) => entry.id),
        ),
        title,
        values,
      );
      write([...list, created]);
      return created;
    },
    onEdit: async (entity) => {
      const values = await prompt(`Edit ${noun}`, fields(entity), editOptions);
      const title = readTitle(values);
      if (!values || !title) return false;
      write(replaceById(read(), patch(entity, title, values)));
      return true;
    },
    onDelete: async (id) => {
      const entity = read().find((entry) => entry.id === id);
      if (!entity) return false;
      const ok = await confirm(/** @type {any} */ (entity)[titleKey]);
      if (ok) write(removeById(read(), id));
      return ok;
    },
  };
}
