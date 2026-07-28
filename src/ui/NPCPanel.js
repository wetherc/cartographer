import { el } from './dom.js';
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
      const getLocationLabel = callbacks.getLocationLabel;
      const head = el(
        'div',
        'npc-panel__head',
        el('span', 'npc-panel__name', npc.name),
        el('span', `badge npc-panel__badge npc-panel__badge--${npc.disposition}`, npc.disposition),
      );

      // Role, location, and notes are each optional; the cast is needed because
      // `filter(Boolean)` does not narrow the array's union for the typechecker.
      return /** @type {Node[]} */ (
        [
          head,
          npc.role && el('span', 'npc-panel__role', npc.role),
          getLocationLabel && el('span', 'npc-panel__location', getLocationLabel(npc)),
          npc.notes && el('span', 'npc-panel__notes', npc.notes),
        ].filter(Boolean)
      );
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
