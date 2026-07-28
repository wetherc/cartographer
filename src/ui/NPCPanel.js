import { isGM } from '../view/ViewRole.js';
import { mountListPanel } from './listPanel.js';

/** @typedef {import('../types/npc.js').NPC} NPC */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Mount the NPC panel: one row per NPC relevant to the party's location, each
 * showing name, role, a disposition badge, and notes, with edit and delete
 * affordances plus a "New NPC" control. Like the encounter panel it owns no
 * roster state — `getNPCs` supplies the visible rows and every mutation flows
 * back through a callback; modals live in main.js. When `getRole` reports a
 * player view, the roster is read-only: rows render without edit/delete and
 * the add control is omitted. With `pinAdd` the add button leads the list and
 * stays pinned while it scrolls (the Build rail), instead of trailing it.
 * @param {HTMLElement} container
 * @param {{
 *   getNPCs: () => NPC[],
 *   onDelete: (id: string) => void,
 *   onAdd?: () => Promise<unknown>,
 *   onEdit?: (npc: NPC) => Promise<unknown>,
 *   confirmDelete?: (npc: NPC) => Promise<boolean>,
 *   getLocationLabel?: (npc: NPC) => string,
 *   getRole?: () => ViewRole,
 *   pinAdd?: boolean,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountNPCPanel(container, callbacks) {
  return mountListPanel(container, {
    className: 'npc-panel',
    gate: () => !callbacks.getRole || isGM(callbacks.getRole()),
    getRows: () => callbacks.getNPCs(),
    emptyMessage: 'No one of note here.',
    bodyClass: 'npc-panel__body',
    actionsClass: 'npc-panel__controls',
    buildBody: (npc) => {
      const parts = [];

      const head = document.createElement('div');
      head.className = 'npc-panel__head';
      const name = document.createElement('span');
      name.className = 'npc-panel__name';
      name.textContent = npc.name;
      const badge = document.createElement('span');
      badge.className = `badge npc-panel__badge npc-panel__badge--${npc.disposition}`;
      badge.textContent = npc.disposition;
      head.append(name, badge);
      parts.push(head);

      if (npc.role) {
        const role = document.createElement('span');
        role.className = 'npc-panel__role';
        role.textContent = npc.role;
        parts.push(role);
      }
      if (callbacks.getLocationLabel) {
        const location = document.createElement('span');
        location.className = 'npc-panel__location';
        location.textContent = callbacks.getLocationLabel(npc);
        parts.push(location);
      }
      if (npc.notes) {
        const notes = document.createElement('span');
        notes.className = 'npc-panel__notes';
        notes.textContent = npc.notes;
        parts.push(notes);
      }

      return parts;
    },
    actions: (npc, ctx) => {
      if (!ctx.gm) return [];
      const onEdit = callbacks.onEdit;
      return [
        onEdit ? { icon: 'edit', label: `Edit ${npc.name}`, onClick: () => onEdit(npc) } : null,
        {
          icon: 'remove',
          label: `Delete ${npc.name}`,
          variant: 'danger',
          onClick: async () => {
            if (callbacks.confirmDelete && !(await callbacks.confirmDelete(npc))) return false;
            callbacks.onDelete(npc.id);
          },
        },
      ];
    },
    addButtons: () => {
      const onAdd = callbacks.onAdd;
      return onAdd ? [{ label: 'New NPC', icon: 'add', onClick: onAdd }] : [];
    },
    addPlacement: callbacks.pinAdd ? 'leading' : 'inline',
    addClass: 'npc-panel__add',
  });
}
