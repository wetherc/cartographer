import { addItem } from './CharacterInventory.js';
import { ITEM_TYPES } from './Equipment.js';
import { costCp, formatCost, formatPurse, purseOf, purseValueCp, spendCoins } from './Purse.js';
import { slugify } from '../util/text.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/library.js').EquipmentTemplate} EquipmentTemplate */

/**
 * The library entries that a character can buy: those with a price above
 * zero, by item type in `ITEM_TYPES` order and then by name. An entry with
 * no price stays out, because the GM has not said what it costs.
 * @param {readonly EquipmentTemplate[]} templates
 * @returns {EquipmentTemplate[]}
 */
export const buyableTemplates = (templates) =>
  templates
    .filter((t) => costCp(t.cost) > 0)
    .sort(
      (a, b) =>
        ITEM_TYPES.indexOf(a.type) - ITEM_TYPES.indexOf(b.type) || a.name.localeCompare(b.name),
    );

/**
 * A stack of a library entry for an inventory. The price stays on the
 * library entry and off the item. The id comes from the name, the same as
 * the add form, so a second buy stacks onto the first.
 * @param {EquipmentTemplate} template
 * @param {number} quantity
 * @returns {InventoryItem}
 */
export function itemFromTemplate(template, quantity) {
  const { cost: _cost, ...fields } = structuredClone(template);
  return { ...fields, id: slugify(template.name) || 'item', quantity };
}

/**
 * Buy a stack of a library entry: the price of the whole stack leaves the
 * purse and the stack joins the inventory. When the character already
 * carries a stack with the same name and type, the bought count joins that
 * stack, so a torch bought in town lands on the torches in the pack even
 * when their descriptions differ. A quantity below 1 counts as 1.
 * A character who cannot pay gets back an error text that names the price
 * and the purse, and nothing changes.
 * @param {Character} character
 * @param {EquipmentTemplate} template
 * @param {number} quantity
 * @returns {{ character: Character, price: string, count: number } | { error: string }}
 */
export function buyItem(character, template, quantity) {
  const count = Math.max(1, Math.floor(Number(quantity)) || 1);
  const totalCp = costCp(template.cost) * count;
  const price = formatCost(totalCp / 100);
  const purse = purseOf(character);
  const paid = spendCoins(purse, totalCp);
  if (!paid) {
    const have = purseValueCp(purse) > 0 ? formatPurse(purse) : 'no coins';
    return { error: `${template.name} x${count} costs ${price}. ${character.name} has ${have}.` };
  }
  const key = template.name.trim().toLowerCase();
  const held = character.inventory.find(
    (i) => i.name.trim().toLowerCase() === key && (i.type ?? 'gear') === template.type,
  );
  const stack = held ? { ...held, quantity: count } : itemFromTemplate(template, count);
  const bought = addItem({ ...character, purse: paid }, stack);
  return { character: bought, price, count };
}
