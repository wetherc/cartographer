import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Encounter} Encounter */

/**
 * Mount the Build-rail encounter authoring list: one compact row per encounter
 * staged in the node being viewed (plus unplaced ones), each with edit and
 * delete actions, and a "New encounter" button. Unlike the Play-mode
 * EncounterPanel this carries no combat machinery — it exists so a GM
 * authoring a map can stage, move, and re-tune its encounters in place,
 * without walking the party there first.
 *
 * Owns no roster state: `getEncounters` supplies the rows (pre-scoped by the
 * caller to the viewed node) and every mutation flows back through a callback.
 * @param {HTMLElement} container
 * @param {{
 *   getEncounters: () => Encounter[],
 *   onAdd: () => Promise<unknown>,
 *   onEdit: (encounter: Encounter) => Promise<unknown>,
 *   onDelete: (encounter: Encounter) => Promise<unknown>,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountBuildEncounterPanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'build-encounters';
  container.appendChild(root);

  function render() {
    root.innerHTML = '';
    const encounters = callbacks.getEncounters();

    if (encounters.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No encounters on this map.';
      root.appendChild(empty);
    }

    for (const encounter of encounters) {
      const row = document.createElement('div');
      row.className = 'build-encounters__row';

      const label = document.createElement('span');
      label.className = 'build-encounters__label';
      const where = encounter.location ? `@ (${encounter.location.tileId})` : 'unplaced';
      label.textContent = `${encounter.name} (${encounter.currentHP}/${encounter.maxHP}) ${where}`;

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'btn btn--icon';
      editButton.setAttribute('aria-label', `Edit ${encounter.name}`);
      editButton.title = 'Edit';
      editButton.appendChild(icon('edit'));
      editButton.addEventListener('click', async () => {
        if (await callbacks.onEdit(encounter)) render();
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn btn--icon';
      deleteButton.setAttribute('aria-label', `Delete ${encounter.name}`);
      deleteButton.title = 'Delete';
      deleteButton.appendChild(icon('remove'));
      deleteButton.addEventListener('click', async () => {
        if (await callbacks.onDelete(encounter)) render();
      });

      row.append(label, editButton, deleteButton);
      root.appendChild(row);
    }

    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn';
    addButton.append(icon('add'), document.createTextNode('New encounter'));
    addButton.addEventListener('click', async () => {
      if (await callbacks.onAdd()) render();
    });
    actions.appendChild(addButton);
    root.appendChild(actions);
  }

  render();
  return { update: render };
}
