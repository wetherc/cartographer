import { mountStatBlockBar } from './StatBlockBar.js';
import { bareButton } from './buttons.js';
import { el } from './dom.js';
import { crLabel } from '../data/challenge.js';
import { proficiencySummary } from '../entities/CreatureChecks.js';
import { formatDamage } from '../entities/Equipment.js';
import { mountListPanel } from './listPanel.js';

/** @typedef {import('../types/creature.js').Creature} Encounter */

/**
 * Mount the Build-rail encounter authoring list. Each row shows one
 * encounter staged in the viewed node, or an unplaced one, with edit and
 * delete actions, its full stat block, and a New encounter button. A GM can
 * edit every stat in place here. A click on a placed encounter's name
 * focuses the map on its tile. Unlike the Play-mode EncounterPanel, this
 * panel has no combat logic. It lets a GM who builds a map stage, move, and
 * retune encounters in place, before the party reaches the node.
 *
 * This panel owns no roster state. getEncounters supplies the rows, already
 * scoped by the caller to the viewed node. Every change flows back through a
 * callback.
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
    classes: { row: 'build-encounters__row u-col u-g1', head: 'u-row u-g2' },
    buildBody: (encounter) => {
      const where = encounter.location ? `@ (${encounter.location.tileId})` : 'unplaced';
      const text = `${encounter.name} (${encounter.currentHP}/${encounter.maxHP}) ${where}`;

      // A placed encounter's name is a button that brings its tile into view.
      // An unplaced encounter has no tile to focus, so its name stays plain text.
      /** @type {HTMLElement} */
      let label;
      if (encounter.location) {
        label = bareButton([text], () => callbacks.onFocus(encounter), {
          className: 'build-encounters__label build-encounters__label--link',
          title: 'Show on map',
        });
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
      // This shows the enemy's challenge rating and gear at a glance. The edit
      // button opens the same form for the rating and both pieces of gear.
      const parts = [];
      if (encounter.cr !== undefined) parts.push(`CR ${crLabel(encounter.cr)}`);
      if (encounter.weapon)
        parts.push(`${encounter.weapon.name} ${formatDamage(encounter.weapon.damage)}`);
      if (encounter.armor) parts.push(`${encounter.armor.name} +${encounter.armor.acBonus} AC`);
      if (parts.length) row.appendChild(el('div', 'u-muted', parts.join(' | ')));

      // What the creature is trained in, with the bonus it rolls in each. The
      // bonus is derived, so it follows an edit of the rating or the stats.
      const trained = proficiencySummary(encounter);
      if (trained) row.appendChild(el('div', 'u-muted', trained));

      // Base stats are set here. Each stat, the six abilities and AC, is a
      // chip that sets its value. An edit writes back through onUpdate.
      mountStatBlockBar(row, {
        mode: 'base',
        getEntity: () => encounter,
        onSetStat: (stat, value) => {
          callbacks.onUpdate({
            ...encounter,
            stats: { ...encounter.stats, [stat]: value },
          });
          ctx.render();
        },
      });
    },
    // The button to spawn from a saved template, from the campaign bestiary
    // or the library, sits beside New encounter. Authoring belongs to the Build rail.
    addButtons: () => [
      { label: 'New encounter', icon: 'add', onClick: callbacks.onAdd },
      callbacks.onAddFromTemplate
        ? { label: 'From bestiary', icon: 'scroll', onClick: callbacks.onAddFromTemplate }
        : null,
    ],
    // New encounter leads the panel and stays fixed while the list scrolls.
    // A GM can stage another enemy without scrolling past the roster.
    addPlacement: 'leading',
  });
}
