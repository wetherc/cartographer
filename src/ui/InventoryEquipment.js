import {
  EQUIPMENT_SLOTS,
  itemType,
  itemSummary,
  equip,
  getEquipped,
  slotAccepts,
} from '../entities/Equipment.js';

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
  const section = document.createElement('div');
  section.className = 'inventory-panel__equipment';
  for (const slot of EQUIPMENT_SLOTS) {
    const row = document.createElement('label');
    row.className = 'inventory-panel__slot';

    const label = document.createElement('span');
    label.className = 'inventory-panel__slot-label';
    label.textContent = slot.label;

    const select = document.createElement('select');
    select.className = 'field';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '—';
    select.appendChild(empty);
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
    for (const item of eligible) {
      const option = document.createElement('option');
      option.value = item.id;
      const summary = itemSummary(item);
      option.textContent = summary ? `${item.name} (${summary})` : item.name;
      select.appendChild(option);
    }
    select.value = equippedId;
    select.disabled = !playable;
    select.addEventListener('change', () =>
      commit(equip(getCharacter(), slot.key, select.value === '' ? null : select.value)),
    );

    row.append(label, select);
    section.appendChild(row);
  }
  return section;
}
