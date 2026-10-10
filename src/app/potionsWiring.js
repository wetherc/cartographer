import { promptModal } from '../ui/Modal.js';
import { removeItem } from '../entities/CharacterInventory.js';
import { getHP } from '../entities/Character.js';
import { potionBlocked, potionHeals, potionSelection } from '../entities/Potions.js';
import { applyToTarget } from './combatantWrites.js';
import { logName } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */

/**
 * Drink a healing potion, or give it to another party character. The dialog
 * asks who drinks it, and lists the drinker first. A dead recipient keeps the
 * potion on the stack. On the drinker's own turn in a fight, the potion
 * costs the action. The heal rolls through the dice tray with no target, and
 * `applyToTarget` writes it, so a heal above 0 HP ends the dying state.
 *
 * The item leaves the stack through `store` before the heal lands, so the
 * inventory panel shows the smaller stack, and the heal then reaches every
 * panel through the character write. The result line goes to the log and to
 * a toast, because the full sheet hides the dice tray.
 * @param {AppContext} app
 * @param {Character} drinker the character whose inventory holds the potion
 * @param {InventoryItem} item
 * @param {(next: Character) => void} store writes the drinker back to every panel
 * @param {{ prompt?: typeof promptModal }} [opts]
 * @returns {Promise<boolean>} whether the potion was used
 */
export async function drinkPotion(app, drinker, item, store, { prompt = promptModal } = {}) {
  const heals = potionHeals(item);
  if (!heals) return false;
  const others = app.state.characters.filter((c) => c.id !== drinker.id);
  let recipientId = drinker.id;
  if (others.length > 0) {
    const values = await prompt(
      `Use one ${item.name}`,
      [
        {
          name: 'recipient',
          label: 'Who drinks it',
          type: 'select',
          value: drinker.id,
          options: [drinker, ...others].map((c) => ({ value: c.id, label: c.name })),
        },
      ],
      { submitLabel: 'Drink', message: 'A character can pour a potion into a downed ally.' },
    );
    if (!values) return false;
    recipientId = String(values.recipient);
  }
  // A cross-tab save or a player patch can change the drinker while the
  // dialog is open, so the write below starts from the stored copy. A
  // drinker or a potion that is gone ends the use.
  const holder = app.state.characters.find((c) => c.id === drinker.id);
  if (!holder?.inventory.some((i) => i.id === item.id)) return false;
  const recipient = app.state.characters.find((c) => c.id === recipientId);
  if (!recipient) return false;
  const blocked = potionBlocked(recipient);
  if (blocked) {
    app.toasts.show(blocked);
    return false;
  }
  const combat = app.state.combat;
  const onTurn = combat?.order[combat.index]?.id === drinker.id;
  if (onTurn && app.actions.spendBudget && !app.actions.spendBudget(drinker.id, 'action')) {
    app.toasts.show(`${logName(app, drinker)} has no action left this turn.`);
    return false;
  }
  const { result } = app.actions.rollDice(potionSelection(heals), null);
  store(removeItem(holder, item.id, 1));
  applyToTarget(app, recipient.id, result.total, true);
  const line = potionLine(app, drinker, recipient, item, result.total);
  app.actions.logEvent('combat', line);
  app.toasts.show(line);
  app.actions.markDirty();
  return true;
}

/**
 * The result line of a potion, such as "Ser Aldric drinks a Potion of
 * Healing: +5 HP (now 29/36)." It reads the recipient after the heal.
 * @param {AppContext} app
 * @param {Character} drinker
 * @param {Character} recipient
 * @param {InventoryItem} item
 * @param {number} healed
 * @returns {string}
 */
function potionLine(app, drinker, recipient, item, healed) {
  const name = logName(app, drinker);
  const action =
    recipient.id === drinker.id
      ? `${name} drinks a ${item.name}`
      : `${name} gives a ${item.name} to ${logName(app, recipient)}`;
  const live = app.state.characters.find((c) => c.id === recipient.id) ?? recipient;
  const hp = getHP(live);
  return hp
    ? `${action}: +${healed} HP (now ${hp.current}/${hp.max}).`
    : `${action}: +${healed} HP.`;
}
