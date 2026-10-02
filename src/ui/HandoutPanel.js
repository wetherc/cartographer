import { badge } from './buttons.js';
import { el } from './dom.js';
import { isSafeImageRef } from '../storage/ImageRefs.js';
import { isGM } from '../view/ViewRole.js';
import { mountListPanel } from './listPanel.js';
import { HANDOUT_FOLD_LENGTH, foldsText } from '../view/TextFold.js';
import { foldText } from './FoldText.js';

/** @typedef {import('../types/handout.js').Handout} Handout */
/** @typedef {import('../types/view.js').ViewRole} ViewRole */

/**
 * Append a handout's read-aloud body and any attached image. This shows
 * only while the handout is revealed, so the panel doubles as the GM's
 * "read this now" surface once flipped on.
 * On a GM row, a long body folds to three lines behind a More button. A
 * player row shows the whole body.
 * @param {HTMLElement} row
 * @param {Handout} handout
 * @param {{ gm: boolean, open: Set<string>, render: () => void }} fold
 */
function appendRevealedContent(row, handout, fold) {
  // The load path already blanks a ref that is not an inline image or a
  // shipped file. The check repeats here so a handout built in memory,
  // before any save, holds to the same rule.
  if (handout.image && isSafeImageRef(handout.image)) {
    const img = el('img', 'handout-panel__image');
    img.src = handout.image;
    img.alt = handout.title;
    row.appendChild(img);
  }
  if (!handout.body) return;
  const open = fold.open.has(handout.id);
  row.append(
    ...foldText('p', 'handout-panel__body', handout.body, {
      fold: fold.gm && foldsText(handout.body, HANDOUT_FOLD_LENGTH),
      open,
      subject: `the text of ${handout.title}`,
      focusKey: `handout-text:${handout.id}`,
      onToggle: () => {
        if (open) fold.open.delete(handout.id);
        else fold.open.add(handout.id);
        fold.render();
      },
    }),
  );
}

/**
 * Mount the handouts panel: the GM's lore and read-aloud snippets for the
 * party's current location. Each row shows a title, an eye toggle that
 * reveals or hides the handout from players, and edit and delete
 * controls. A revealed handout shows its read-aloud body. A hidden one
 * keeps the body collapsed, so the GM can reveal it on demand at the
 * table. A player sees only revealed handouts, read-only. The panel owns
 * no state. getHandouts supplies the visible rows, already cut to what this
 * tab may see, and every mutation flows back through a callback, matching
 * the other panels. `groupOf` names the group of a Player row, such as "Revealed earlier".
 * `describe` gives the GM a short note under a row, for
 * example the tile the handout waits on. `dependsOn` names what that note
 * reads besides the row. Modals live in main.js.
 * @param {HTMLElement} container
 * @param {{
 *   getHandouts: () => Handout[],
 *   onToggle: (handout: Handout) => void,
 *   onEdit: (handout: Handout) => Promise<boolean> | boolean,
 *   onDelete: (id: string) => Promise<boolean> | boolean,
 *   onAdd: () => Promise<Handout | null>,
 *   getRole?: () => ViewRole,
 *   describe?: (handout: Handout) => string,
 *   dependsOn?: () => unknown,
 *   groupOf?: (handout: Handout) => string | null,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountHandoutPanel(container, callbacks) {
  /** The ids of the handouts whose long text the GM opened. @type {Set<string>} */
  const open = new Set();
  return mountListPanel(container, {
    className: 'handout-panel',
    gate: () => !callbacks.getRole || isGM(callbacks.getRole()),
    getRows: (gm) => {
      const handouts = callbacks.getHandouts();
      return gm ? handouts : handouts.filter((h) => h.revealed);
    },
    emptyMessage: (gm) => (gm ? 'No handouts here.' : 'Nothing to show yet.'),
    // A Player tab lists the handouts it read at other spots under a heading
    // of their own, after the ones at the party's spot.
    groupOf: (handout, gm) => (gm ? null : (callbacks.groupOf?.(handout) ?? null)),
    classes: {
      rowModifiers: (handout, gm) => [(!gm || handout.revealed) && 'handout-panel__row--revealed'],
      // A player's row is title then content with no controls, so it needs
      // no head row to line the buttons up against.
      head: (_handout, gm) => (gm ? 'u-row u-g1' : null),
      add: 'handout-panel__add',
      group: 'handout-panel__group',
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
          focusKey: `reveal:${handout.id}`,
          onClick: () => callbacks.onToggle(handout),
        },
        handout,
      );

      // The eye shows the state, and the badge says it in words, so the GM
      // does not have to guess whether the icon names the state or the action.
      return [
        toggle,
        el('span', 'handout-panel__title', handout.title),
        handout.revealed
          ? badge('Shown', { variant: 'success' })
          : badge('Hidden', { variant: 'neutral' }),
      ];
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
    dependsOn: callbacks.dependsOn,
    buildExtras: (handout, row, ctx) => {
      const note = ctx.gm ? callbacks.describe?.(handout) : '';
      if (note) row.appendChild(el('p', 'handout-panel__note u-muted', note));
      if (!ctx.gm || handout.revealed)
        appendRevealedContent(row, handout, { gm: ctx.gm, open, render: ctx.render });
    },
    addButtons: () => [{ label: 'New handout', icon: 'add', onClick: callbacks.onAdd }],
  });
}
