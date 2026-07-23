import { icon } from './icons.js';

/** @typedef {import('../types/npc.js').NPC} NPC */

/**
 * Mount the NPC panel: one row per NPC relevant to the party's location, each
 * showing name, role, a disposition badge, and notes, with edit and delete
 * affordances plus a "New NPC" control. Like the encounter panel it owns no
 * roster state — `getNPCs` supplies the visible rows and every mutation flows
 * back through a callback; modals live in main.js.
 * @param {HTMLElement} container
 * @param {{
 *   getNPCs: () => NPC[],
 *   onDelete: (id: string) => void,
 *   onAdd?: () => Promise<NPC | null>,
 *   onEdit?: (npc: NPC) => Promise<boolean>,
 *   confirmDelete?: (npc: NPC) => Promise<boolean>,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountNPCPanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'npc-panel';
  container.appendChild(root);

  /** @param {NPC} npc */
  function buildRow(npc) {
    const row = document.createElement('div');
    row.className = 'npc-panel__row';

    const body = document.createElement('div');
    body.className = 'npc-panel__body';

    const head = document.createElement('div');
    head.className = 'npc-panel__head';
    const name = document.createElement('span');
    name.className = 'npc-panel__name';
    name.textContent = npc.name;
    const badge = document.createElement('span');
    badge.className = `npc-panel__badge npc-panel__badge--${npc.disposition}`;
    badge.textContent = npc.disposition;
    head.append(name, badge);
    body.appendChild(head);

    if (npc.role) {
      const role = document.createElement('span');
      role.className = 'npc-panel__role';
      role.textContent = npc.role;
      body.appendChild(role);
    }
    if (npc.notes) {
      const notes = document.createElement('span');
      notes.className = 'npc-panel__notes';
      notes.textContent = npc.notes;
      body.appendChild(notes);
    }

    const controls = document.createElement('div');
    controls.className = 'npc-panel__controls';

    if (callbacks.onEdit) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn btn--icon';
      edit.setAttribute('aria-label', `Edit ${npc.name}`);
      edit.appendChild(icon('edit'));
      edit.addEventListener('click', async () => {
        if (await callbacks.onEdit?.(npc)) render();
      });
      controls.appendChild(edit);
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn--icon';
    del.setAttribute('aria-label', `Delete ${npc.name}`);
    del.appendChild(icon('remove'));
    del.addEventListener('click', async () => {
      const ok = callbacks.confirmDelete ? await callbacks.confirmDelete(npc) : true;
      if (!ok) return;
      callbacks.onDelete(npc.id);
      render();
    });
    controls.appendChild(del);

    row.append(body, controls);
    return row;
  }

  function render() {
    root.innerHTML = '';
    const npcs = callbacks.getNPCs();
    if (npcs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No one of note here.';
      root.appendChild(empty);
    }
    for (const npc of npcs) root.appendChild(buildRow(npc));

    const onAdd = callbacks.onAdd;
    if (onAdd) {
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'btn npc-panel__add';
      addButton.append(icon('add'), document.createTextNode('New NPC'));
      addButton.addEventListener('click', async () => {
        if (await onAdd()) render();
      });
      root.appendChild(addButton);
    }
  }

  render();
  return { update: render };
}
