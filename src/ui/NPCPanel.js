import { badge } from './buttons.js';
import { el } from './dom.js';
import { isGM } from '../view/ViewRole.js';
import { mountConditionsBar } from './ConditionsBar.js';
import { mountExhaustionBar } from './ExhaustionBar.js';
import { mountListPanel } from './listPanel.js';

/** @typedef {import('../types/creature.js').Creature} NPC */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * How a disposition reads: a friend is good news, a hostile is bad news, and
 * anyone else is neither.
 * @type {Record<NPC['disposition'], 'success' | 'danger' | 'neutral'>}
 */
const DISPOSITION_VARIANTS = { friendly: 'success', neutral: 'neutral', hostile: 'danger' };

/**
 * Mount the NPC panel: one row per NPC relevant to the party's location. Each
 * row shows name, role, a disposition badge, and notes, with edit and delete
 * controls plus a "New NPC" control. Like the encounter panel, this panel
 * owns no roster state. `getNPCs` supplies the visible rows, and every
 * mutation flows back through a callback. Modals live in main.js. When
 * `getRole` reports a player view, the roster is read-only: rows render
 * without edit or delete, and the panel omits the add control. With `pinAdd`
 * set, the add button leads the list and stays pinned while the list scrolls
 * (the Build rail), instead of trailing the list.
 *
 * With `onUpdate`, a GM row also carries the condition chips, so an NPC drawn
 * into a fight can be marked poisoned or stunned from the same list that
 * shows it. Without the callback the row has no chips, which is what the
 * authoring rail wants. `onSetExhaustion` adds the exhaustion pips beside them,
 * and it is a callback of its own because the sixth level kills the NPC, which
 * is more than a write of one field.
 * @param {HTMLElement} container
 * @param {{
 *   getNPCs: () => NPC[],
 *   onDelete: (id: string) => void,
 *   onUpdate?: (npc: NPC) => void,
 *   onSetExhaustion?: (npc: NPC, level: number) => void,
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
    classes: {
      body: 'npc-panel__body u-col',
      actions: 'npc-panel__controls',
      add: 'npc-panel__add',
    },
    buildBody: (npc) => {
      const getLocationLabel = callbacks.getLocationLabel;
      const head = el(
        'div',
        'u-row u-g2',
        el('span', 'npc-panel__name', npc.name),
        badge(npc.disposition, {
          variant: DISPOSITION_VARIANTS[npc.disposition],
          className: 'npc-panel__badge',
        }),
      );

      // Role, location, and notes are each optional. The cast is needed
      // because `filter(Boolean)` does not narrow the array's union type for
      // the typechecker.
      return /** @type {Node[]} */ (
        [
          head,
          npc.role && el('span', 'npc-panel__role', npc.role),
          getLocationLabel && el('span', 'npc-panel__location u-muted', getLocationLabel(npc)),
          npc.notes && el('span', 'npc-panel__notes', npc.notes),
        ].filter(Boolean)
      );
    },
    buildExtras: (npc, row, ctx) => {
      if (!ctx.gm) return;
      const onUpdate = callbacks.onUpdate;
      if (onUpdate) {
        mountConditionsBar(row, {
          getConditions: () => npc.conditions ?? [],
          onChange: (next) => onUpdate({ ...npc, conditions: next }),
        });
      }
      const onSetExhaustion = callbacks.onSetExhaustion;
      if (onSetExhaustion) {
        mountExhaustionBar(row, {
          getEntity: () => npc,
          onSet: (level) => onSetExhaustion(npc, level),
        });
      }
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
  });
}
