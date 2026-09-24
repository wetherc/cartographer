import {
  EQUIPMENT_SLOTS,
  itemType,
  itemSummary,
  equip,
  equipBlocker,
  getEquipped,
} from '../entities/Equipment.js';
import { hasWeaponProperty } from '../entities/Weapons.js';
import { el } from './dom.js';
import { select } from './formFields.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * This is the Equipment tab of the inventory panel: slot pickers for what a
 * character wears and wields. It is split out of InventoryPanel.js, which
 * keeps the mount, tabs, and disclosure shell. The item rows live in
 * InventoryRows.js.
 */

/**
 * Equipment slot rows. Each row shows a labeled select for one slot. Its
 * options are limited to inventory items that `equipBlocker` allows, so a
 * potion never appears in the armor pickers, a single ring is not offered
 * for the second ring slot, and the off hand offers nothing while a
 * two-handed weapon fills the main hand. Options sort by the slot's
 * preference, then by name. An already-equipped item that no longer passes
 * the filter, for example in a legacy save, still shows, so a GM can see
 * it and unequip it.
 *
 * The character arrives as a getter because these rows outlive changes
 * made elsewhere on the sheet. A slot's options depend only on the
 * inventory and the other slots, so the panel leaves the rows standing when
 * a sibling panel commits an unrelated change. The equip call below must write against
 * that newer character.
 * @param {() => Character} getCharacter
 * @param {(next: Character) => void} commit
 * @param {boolean} playable false renders the pickers disabled, for a read-only view
 * @returns {HTMLElement}
 */
export function buildEquipment(getCharacter, commit, playable) {
  const character = getCharacter();
  const section = el('div', 'inventory-panel__equipment');
  for (const slot of EQUIPMENT_SLOTS) {
    const equippedId = getEquipped(character, slot.key)?.id ?? '';
    const eligible = character.inventory
      .filter((i) => !equipBlocker(character, slot.key, i) || i.id === equippedId)
      .sort((a, b) => {
        const rank = (/** @type {typeof a} */ i) => {
          const at = slot.accepts.indexOf(itemType(i));
          return at === -1 ? slot.accepts.length : at;
        };
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
    // A two-handed weapon fills both hands, so the empty off hand names it.
    const main = getEquipped(character, 'mainHand');
    const bothHands =
      slot.key === 'offHand' && !equippedId && !!main && hasWeaponProperty(main, 'two-handed');
    const picker = select(
      [
        { value: '', label: bothHands ? `Both hands on ${main.name}` : '—' },
        ...eligible.map((item) => {
          const summary = itemSummary(item);
          return { value: item.id, label: summary ? `${item.name} (${summary})` : item.name };
        }),
      ],
      equippedId,
    );
    picker.disabled = !playable || bothHands;
    picker.addEventListener('change', () =>
      commit(equip(getCharacter(), slot.key, picker.value === '' ? null : picker.value)),
    );

    section.append(el('label', 'inventory-panel__slot', el('span', 'u-muted', slot.label), picker));
  }
  return section;
}
