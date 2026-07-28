import {
  EQUIPMENT_SLOTS,
  itemType,
  itemSummary,
  equip,
  getEquipped,
  slotAccepts,
} from '../entities/Equipment.js';
import { el } from './dom.js';
import { select } from './formFields.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The Equipment tab of the inventory panel: slot pickers for what's worn and
 * wielded, split out of InventoryPanel.js, which keeps the mount, tabs, and
 * disclosure shell; the item rows live in InventoryRows.js.
 */

/**
 * Equipment slot rows: a labeled select per slot, its options limited to the
 * inventory items whose type the slot accepts (a potion never appears in the
 * armor pickers), ordered by the slot's preference then name. An already-
 * equipped item that no longer passes the filter (a legacy save) still shows,
 * so it can be seen and unequipped.
 *
 * The character arrives as a getter because these rows outlive changes made
 * elsewhere on the sheet: a slot's options only depend on the inventory, so the
 * panel leaves the rows standing when a sibling panel commits an unrelated
 * change, and the equip below has to write against that newer character.
 * @param {() => Character} getCharacter
 * @param {(next: Character) => void} commit
 * @param {boolean} playable false renders the pickers disabled (read-only view)
 * @returns {HTMLElement}
 */
export function buildEquipment(getCharacter, commit, playable) {
  const character = getCharacter();
  const section = el('div', 'inventory-panel__equipment');
  for (const slot of EQUIPMENT_SLOTS) {
    const equippedId = getEquipped(character, slot.key)?.id ?? '';
    const eligible = character.inventory
      .filter((i) => slotAccepts(slot.key, i) || i.id === equippedId)
      .sort((a, b) => {
        const rank = (/** @type {typeof a} */ i) => {
          const at = slot.accepts.indexOf(itemType(i));
          return at === -1 ? slot.accepts.length : at;
        };
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
    const picker = select(
      [
        { value: '', label: '—' },
        ...eligible.map((item) => {
          const summary = itemSummary(item);
          return { value: item.id, label: summary ? `${item.name} (${summary})` : item.name };
        }),
      ],
      equippedId,
    );
    picker.disabled = !playable;
    picker.addEventListener('change', () =>
      commit(equip(getCharacter(), slot.key, picker.value === '' ? null : picker.value)),
    );

    section.append(
      el(
        'label',
        'inventory-panel__slot',
        el('span', 'inventory-panel__slot-label', slot.label),
        picker,
      ),
    );
  }
  return section;
}
