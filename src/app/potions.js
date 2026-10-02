import { promptModal } from '../ui/Modal.js';
import { removeItem } from '../entities/CharacterInventory.js';
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
 * panel through the character write.
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
  store(removeItem(drinker, item.id, 1));
  const name = logName(app, drinker);
  app.actions.logEvent(
    'combat',
    recipient.id === drinker.id
      ? `${name} drinks a ${item.name} (${result.total} HP).`
      : `${name} gives a ${item.name} to ${logName(app, recipient)} (${result.total} HP).`,
  );
  applyToTarget(app, recipient.id, result.total, true);
  app.actions.markDirty();
  return true;
}
