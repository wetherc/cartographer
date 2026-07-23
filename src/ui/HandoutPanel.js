import { icon } from './icons.js';
import { isGM } from '../view/ViewRole.js';

/** @typedef {import('../types/handout.js').Handout} Handout */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the handouts panel: the GM's lore/read-aloud snippets for the party's
 * current location. Each row shows a title, an eye toggle that reveals or
 * hides the handout to players, and edit/delete affordances; a revealed
 * handout shows its read-aloud body (a hidden one keeps the body collapsed so
 * the GM can reveal it on demand at the table). The panel owns no state —
 * `getHandouts` supplies the visible rows and every mutation flows back through
 * a callback, matching the other panels; modals live in main.js.
 *
 * The reveal flag is the seam a future player-facing view (lifecycle gap #1)
 * renders against; today one GM-facing tab drives it manually.
 * @param {HTMLElement} container
 * @param {{
 *   getHandouts: () => Handout[],
 *   onToggle: (handout: Handout) => void,
 *   onEdit: (handout: Handout) => Promise<boolean> | boolean,
 *   onDelete: (id: string) => Promise<boolean> | boolean,
 *   onAdd: () => Promise<Handout | null>,
 *   getRole?: () => ViewRole,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountHandoutPanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'handout-panel';
  container.appendChild(root);

  /** @param {Handout} handout */
  function buildRow(handout) {
    const row = document.createElement('div');
    row.className = 'handout-panel__row';
    if (handout.revealed) row.classList.add('handout-panel__row--revealed');

    const head = document.createElement('div');
    head.className = 'handout-panel__head';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn--icon';
    toggle.setAttribute('aria-label', handout.revealed ? `Hide ${handout.title} from players` : `Reveal ${handout.title} to players`);
    toggle.setAttribute('aria-pressed', String(handout.revealed));
    toggle.appendChild(icon(handout.revealed ? 'eye' : 'eye-off'));
    toggle.addEventListener('click', () => {
      callbacks.onToggle(handout);
      render();
    });

    const title = document.createElement('span');
    title.className = 'handout-panel__title';
    title.textContent = handout.title;

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn btn--icon';
    editButton.setAttribute('aria-label', `Edit ${handout.title}`);
    editButton.appendChild(icon('edit'));
    editButton.addEventListener('click', async () => {
      if (await callbacks.onEdit(handout)) render();
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn--icon';
    deleteButton.setAttribute('aria-label', `Delete ${handout.title}`);
    deleteButton.appendChild(icon('remove'));
    deleteButton.addEventListener('click', async () => {
      if (await callbacks.onDelete(handout.id)) render();
    });

    head.append(toggle, title, editButton, deleteButton);
    row.appendChild(head);

    // The read-aloud body shows only while revealed, so the panel doubles as
    // the GM's "read this now" surface once they flip a handout on.
    if (handout.revealed && handout.body) {
      const body = document.createElement('p');
      body.className = 'handout-panel__body';
      body.textContent = handout.body;
      row.appendChild(body);
    }
    return row;
  }

  /** A player sees only revealed handouts, read-only: title + read-aloud body. */
  function buildPlayerRow(handout) {
    const row = document.createElement('div');
    row.className = 'handout-panel__row handout-panel__row--revealed';
    const title = document.createElement('div');
    title.className = 'handout-panel__title';
    title.textContent = handout.title;
    row.appendChild(title);
    if (handout.body) {
      const body = document.createElement('p');
      body.className = 'handout-panel__body';
      body.textContent = handout.body;
      row.appendChild(body);
    }
    return row;
  }

  function render() {
    root.innerHTML = '';
    const gm = !callbacks.getRole || isGM(callbacks.getRole());

    if (!gm) {
      const shown = callbacks.getHandouts().filter((h) => h.revealed);
      if (shown.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'Nothing to show yet.';
        root.appendChild(empty);
        return;
      }
      for (const handout of shown) root.appendChild(buildPlayerRow(handout));
      return;
    }

    const handouts = callbacks.getHandouts();
    if (handouts.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No handouts here.';
      root.appendChild(empty);
    }
    for (const handout of handouts) root.appendChild(buildRow(handout));

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn handout-panel__add';
    addButton.append(icon('add'), document.createTextNode('New handout'));
    addButton.addEventListener('click', async () => {
      if (await callbacks.onAdd()) render();
    });
    root.appendChild(addButton);
  }

  render();
  return { update: render };
}
