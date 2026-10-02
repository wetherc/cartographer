/**
 * The check that every move into a map runs first. A locked map stops the
 * move. A Player tab shows a toast. The GM tab asks, and unlocking sets the
 * lock open, logs it, and lets the move go on. The dialog can be injected,
 * so tests can run the logic with no DOM.
 */

import { confirmModal } from '../ui/Modal.js';
import { isGM } from '../view/ViewRole.js';
import { isLocked, keyHolder, lockMessage, unlockNode } from '../map/NodeLock.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/map.js').MapNode} MapNode */

/**
 * Resolve to true when the party can enter the node: it has no lock, the
 * lock is open, or the GM unlocks it now.
 * @param {AppContext} app
 * @param {MapNode} node
 * @param {{ confirm?: typeof confirmModal }} [options]
 * @returns {Promise<boolean>}
 */
export async function passLock(app, node, { confirm = confirmModal } = {}) {
  if (!isLocked(node) || !node.lock) return true;
  if (!isGM(app.state.role)) {
    app.toasts.show(`The way into ${node.name} is locked.`);
    return false;
  }
  const holder = keyHolder(app.state.characters, node.lock);
  const ok = await confirm(lockMessage(node.lock, holder), {
    title: node.name,
    confirmLabel: holder ? 'Unlock' : 'Unlock anyway',
    cancelLabel: 'Stay out',
  });
  if (!ok) return false;
  const current = app.grid.getNode(node.id) ?? node;
  app.grid.updateNode(unlockNode(current));
  app.actions.logEvent(
    'travel',
    holder
      ? `${holder.name} unlocks the way into ${node.name}.`
      : `The way into ${node.name} opens.`,
  );
  return true;
}
