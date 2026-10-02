import { EQUIPMENT_SLOTS } from '../entities/Equipment.js';
import { armorClass } from '../entities/Armor.js';
import { withEquipped } from '../entities/Progression.js';
import { slotChoices, slotStat, pickerDetail } from '../view/EquipSlots.js';
import { el } from './dom.js';
import { openDialog } from './Modal.js';
import { textButton } from './buttons.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {(typeof EQUIPMENT_SLOTS)[number]} EquipmentSlot */

/**
 * This is the Equipment tab of the inventory panel: a paperdoll of slot
 * cards around a plate with the character's name and AC. A slot card shows
 * the item's name and one short stat line. A click opens a picker that
 * lists every item the slot can take with its full details, so long item
 * text wraps inside the dialog instead of overflowing a select. The text
 * comes from the pure view/EquipSlots.js. InventoryPanel.js keeps the mount
 * and the tabs, and InventoryRows.js keeps the item rows.
 */

/**
 * The paperdoll. The character arrives as a getter because the panel keeps
 * these cards standing when a sibling panel commits an unrelated change, and
 * an equip must write against that newer character.
 * @param {() => Character} getCharacter
 * @param {(next: Character) => void} commit
 * @param {boolean} playable false renders the cards disabled, for a read-only view
 * @returns {HTMLElement}
 */
export function buildEquipment(getCharacter, commit, playable) {
  const character = getCharacter();
  const grid = el('div', 'paperdoll__grid');
  grid.appendChild(
    el(
      'div',
      'paperdoll__plate',
      el('span', 'paperdoll__name', character.name),
      el('span', 'paperdoll__ac', `AC ${armorClass(character)}`),
    ),
  );
  for (const slot of EQUIPMENT_SLOTS)
    grid.appendChild(slotCard(getCharacter, commit, playable, slot));
  return el('div', 'inventory-panel__equipment paperdoll', grid);
}

/**
 * One framed slot card. It is a button that opens the picker, and it is
 * disabled in a read-only view and while a two-handed weapon fills the off
 * hand.
 * @param {() => Character} getCharacter
 * @param {(next: Character) => void} commit
 * @param {boolean} playable
 * @param {EquipmentSlot} slot
 */
function slotCard(getCharacter, commit, playable, slot) {
  const { equipped, bothHands } = slotChoices(getCharacter(), slot);
  const name = equipped?.name ?? (bothHands ? `Both hands on ${bothHands}` : 'Empty');
  const stat = equipped ? slotStat(equipped) : '';
  const card = el(
    'button',
    `paperdoll__slot${equipped ? '' : ' paperdoll__slot--empty'}`,
    el('span', 'paperdoll__slot-label', slot.label),
    el('span', 'paperdoll__slot-item', name),
    ...(stat ? [el('span', 'paperdoll__slot-stat', stat)] : []),
  );
  card.type = 'button';
  card.dataset.slot = slot.key;
  card.disabled = !playable || !!bothHands;
  card.setAttribute(
    'aria-label',
    `${slot.label}: ${name}${stat ? `, ${stat}` : ''}${card.disabled ? '' : '. Change'}`,
  );
  card.addEventListener('click', async () => {
    const picked = await pickItem(getCharacter(), slot, card);
    if (picked === undefined) return;
    // The commit rebuilds the cards, so focus moves to the new card of this slot.
    const host = card.closest('.paperdoll')?.parentElement;
    commit(withEquipped(getCharacter(), slot.key, picked));
    /** @type {HTMLElement | null | undefined} */ (
      host?.querySelector(`.paperdoll__slot[data-slot="${slot.key}"]`)
    )?.focus();
  });
  return card;
}

/**
 * Ask which item goes into one slot. The result is the item id, null for
 * an empty slot, or undefined when the GM cancels or keeps the same item.
 * @param {Character} character
 * @param {EquipmentSlot} slot
 * @param {HTMLElement} opener
 * @returns {Promise<string | null | undefined>}
 */
function pickItem(character, slot, opener) {
  const { equipped, items } = slotChoices(character, slot);
  const current = equipped?.id ?? '';
  const list = el('div', 'equip-picker__list');
  list.setAttribute('role', 'radiogroup');
  list.setAttribute('aria-label', slot.label);
  /** @type {HTMLInputElement[]} */
  const radios = [];
  /**
   * @param {string} value
   * @param {string} name
   * @param {string} detail
   */
  const option = (value, name, detail) => {
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'equip-picker';
    radio.value = value;
    radio.checked = value === current;
    radios.push(radio);
    const text = el('span', 'equip-picker__text', el('span', 'equip-picker__name', name));
    if (detail) text.appendChild(el('span', 'equip-picker__detail', detail));
    list.appendChild(el('label', 'equip-picker__option', radio, text));
  };
  option('', 'Empty', `Nothing in the ${slot.label.toLowerCase()} slot`);
  for (const item of items) option(item.id, item.name, pickerDetail(item));
  const hint = el('p', 'modal__message', `Nothing in the inventory fits this slot.`);
  return openDialog({
    className: 'equip-picker',
    title: slot.label,
    form: true,
    returnFocus: opener,
    build: (close) => ({
      body: items.length ? [list] : [hint, list],
      actions: [
        textButton('Cancel', () => close('cancel')),
        // A submit button, so Enter on a radio equips the checked item.
        textButton('Equip', undefined, { variant: 'primary', type: 'submit', value: 'equip' }),
      ],
      initialFocus: radios.find((r) => r.checked) ?? radios[0],
    }),
    result: (value) => {
      if (value !== 'equip') return undefined;
      const chosen = radios.find((r) => r.checked)?.value ?? current;
      return chosen === current ? undefined : chosen || null;
    },
  });
}
