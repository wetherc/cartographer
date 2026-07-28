import { mountStatBlockBar } from './StatBlockBar.js';
import { el } from './dom.js';
import { formatDamage } from '../entities/Equipment.js';
import { mountListPanel } from './listPanel.js';

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
 *   onAddFromTemplate?: () => Promise<unknown>,
 *   onEdit: (encounter: Encounter) => Promise<unknown>,
 *   onDelete: (encounter: Encounter) => Promise<unknown>,
 *   onUpdate: (encounter: Encounter) => void,
 *   onFocus: (encounter: Encounter) => void,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountBuildEncounterPanel(container, callbacks) {
  return mountListPanel(container, {
    className: 'build-encounters',
    getRows: () => callbacks.getEncounters(),
    emptyMessage: 'No encounters on this map.',
    headClass: 'build-encounters__head',
    buildBody: (encounter) => {
      const where = encounter.location ? `@ (${encounter.location.tileId})` : 'unplaced';
      const text = `${encounter.name} (${encounter.currentHP}/${encounter.maxHP}) ${where}`;

      // A placed encounter's name is a button that brings its tile into view;
      // an unplaced one has nowhere to focus, so it stays plain text.
      /** @type {HTMLElement} */
      let label;
      if (encounter.location) {
        label = el('button', 'build-encounters__label build-encounters__label--link', text);
        label.setAttribute('type', 'button');
        label.title = 'Show on map';
        label.addEventListener('click', () => callbacks.onFocus(encounter));
      } else {
        label = el('span', 'build-encounters__label', text);
      }
      return label;
    },
    actions: (encounter) => [
      {
        icon: 'edit',
        label: `Edit ${encounter.name}`,
        title: 'Edit',
        onClick: () => callbacks.onEdit(encounter),
      },
      {
        icon: 'remove',
        label: `Delete ${encounter.name}`,
        title: 'Delete',
        variant: 'danger',
        onClick: () => callbacks.onDelete(encounter),
      },
    ],
    buildExtras: (encounter, row, ctx) => {
      // The enemy's gear at a glance; both pieces are edited through the same
      // form the edit button opens.
      if (encounter.weapon || encounter.armor) {
        const parts = [];
        if (encounter.weapon)
          parts.push(`${encounter.weapon.name} ${formatDamage(encounter.weapon.damage)}`);
        if (encounter.armor) parts.push(`${encounter.armor.name} +${encounter.armor.acBonus} AC`);
        row.appendChild(el('div', 'build-encounters__gear', parts.join(' | ')));
      }

      // Base stat authoring lives here: every stat (the six abilities + AC)
      // is a chip that sets its value; edits write back through onUpdate.
      mountStatBlockBar(row, {
        mode: 'base',
        getStatBlock: () => encounter.statBlock ?? {},
        onSetStat: (stat, value) => {
          callbacks.onUpdate({
            ...encounter,
            statBlock: { ...encounter.statBlock, [stat]: value },
          });
          ctx.render();
        },
      });
    },
    // Spawning from a saved template (the campaign bestiary + the library)
    // sits beside New encounter — authoring belongs to the Build rail.
    addButtons: () => [
      { label: 'New encounter', icon: 'add', onClick: callbacks.onAdd },
      callbacks.onAddFromTemplate
        ? { label: 'From bestiary', icon: 'scroll', onClick: callbacks.onAddFromTemplate }
        : null,
    ],
    // "New encounter" leads the panel and stays pinned while the list
    // scrolls, so staging another enemy never means scrolling past the roster.
    addPlacement: 'leading',
  });
}
