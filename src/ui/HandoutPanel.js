import { el } from './dom.js';
import { isGM } from '../view/ViewRole.js';
import { mountListPanel } from './listPanel.js';

/** @typedef {import('../types/handout.js').Handout} Handout */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Append a handout's read-aloud body and any attached image. This shows
 * only while the handout is revealed, so the panel doubles as the GM's
 * "read this now" surface once flipped on.
 * @param {HTMLElement} row
 * @param {Handout} handout
 */
function appendRevealedContent(row, handout) {
  if (handout.image) {
    const img = el('img', 'handout-panel__image');
    img.src = handout.image;
    img.alt = handout.title;
    row.appendChild(img);
  }
  if (handout.body) row.appendChild(el('p', 'handout-panel__body', handout.body));
}

/**
 * Mount the handouts panel: the GM's lore and read-aloud snippets for the
 * party's current location. Each row shows a title, an eye toggle that
 * reveals or hides the handout from players, and edit and delete
 * controls. A revealed handout shows its read-aloud body. A hidden one
 * keeps the body collapsed, so the GM can reveal it on demand at the
 * table. A player sees only revealed handouts, read-only. The panel owns
 * no state. getHandouts supplies the visible rows, and every mutation
 * flows back through a callback, matching the other panels. Modals live
 * in main.js.
 *
 * The reveal flag is what a future player-facing view renders
 * against. Today one GM-facing tab drives it manually.
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
  return mountListPanel(container, {
    className: 'handout-panel',
    gate: () => !callbacks.getRole || isGM(callbacks.getRole()),
    getRows: (gm) => {
      const handouts = callbacks.getHandouts();
      return gm ? handouts : handouts.filter((h) => h.revealed);
    },
    emptyMessage: (gm) => (gm ? 'No handouts here.' : 'Nothing to show yet.'),
    classes: {
      rowModifiers: (handout, gm) => [(!gm || handout.revealed) && 'handout-panel__row--revealed'],
      // A player's row is title then content with no controls, so it needs
      // no head row to line the buttons up against.
      head: (_handout, gm) => (gm ? 'u-row u-g1' : null),
      add: 'handout-panel__add',
    },
    buildBody: (handout, ctx) => {
      if (!ctx.gm) return el('div', 'handout-panel__title', handout.title);

      const toggle = ctx.action(
        {
          icon: handout.revealed ? 'eye' : 'eye-off',
          label: handout.revealed
            ? `Hide ${handout.title} from players`
            : `Reveal ${handout.title} to players`,
          pressed: handout.revealed,
          onClick: () => callbacks.onToggle(handout),
        },
        handout,
      );

      return [toggle, el('span', 'handout-panel__title', handout.title)];
    },
    actions: (handout, ctx) =>
      ctx.gm
        ? [
            {
              icon: 'edit',
              label: `Edit ${handout.title}`,
              onClick: () => callbacks.onEdit(handout),
            },
            {
              icon: 'remove',
              label: `Delete ${handout.title}`,
              variant: 'danger',
              onClick: () => callbacks.onDelete(handout.id),
            },
          ]
        : [],
    buildExtras: (handout, row, ctx) => {
      if (!ctx.gm || handout.revealed) appendRevealedContent(row, handout);
    },
    addButtons: () => [{ label: 'New handout', icon: 'add', onClick: callbacks.onAdd }],
  });
}
