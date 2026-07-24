import { icon } from './icons.js';
import { mountStatBlockBar } from './StatBlockBar.js';
import { formatDamage } from '../entities/Equipment.js';

/** @typedef {import('../types/entities.js').Encounter} Encounter */

/**
 * Mount the Build-rail encounter authoring list: one row per encounter staged
 * in the node being viewed (plus unplaced ones), each with edit and delete
 * actions, its full stat block (every stat editable in place — this is where
 * base stats are tuned), and a "New encounter" button. Selecting a placed
 * encounter's name focuses the map on its tile. Unlike the Play-mode
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
 *   onUpdate: (encounter: Encounter) => void,
 *   onFocus: (encounter: Encounter) => void,
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

      const where = encounter.location ? `@ (${encounter.location.tileId})` : 'unplaced';
      const text = `${encounter.name} (${encounter.currentHP}/${encounter.maxHP}) ${where}`;

      // A placed encounter's name is a button that brings its tile into view;
      // an unplaced one has nowhere to focus, so it stays plain text.
      /** @type {HTMLElement} */
      let label;
      if (encounter.location) {
        label = document.createElement('button');
        label.setAttribute('type', 'button');
        label.className = 'build-encounters__label build-encounters__label--link';
        label.title = 'Show on map';
        label.addEventListener('click', () => callbacks.onFocus(encounter));
      } else {
        label = document.createElement('span');
        label.className = 'build-encounters__label';
      }
      label.textContent = text;

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

      const head = document.createElement('div');
      head.className = 'build-encounters__head';
      head.append(label, editButton, deleteButton);
      row.appendChild(head);

      // The enemy's gear at a glance; both pieces are edited through the same
      // form the edit button opens.
      if (encounter.weapon || encounter.armor) {
        const gear = document.createElement('div');
        gear.className = 'build-encounters__gear';
        const parts = [];
        if (encounter.weapon) parts.push(`${encounter.weapon.name} ${formatDamage(encounter.weapon.damage)}`);
        if (encounter.armor) parts.push(`${encounter.armor.name} +${encounter.armor.acBonus} AC`);
        gear.textContent = parts.join(' | ');
        row.appendChild(gear);
      }

      // Base stat authoring lives here: every stat (the six abilities + AC)
      // is a chip that sets its value; edits write back through onUpdate.
      mountStatBlockBar(row, {
        mode: 'base',
        getStatBlock: () => encounter.statBlock ?? {},
        onSetStat: (stat, value) => {
          callbacks.onUpdate({ ...encounter, statBlock: { ...encounter.statBlock, [stat]: value } });
          render();
        },
      });

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
