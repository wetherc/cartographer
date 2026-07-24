import { addItem, removeItem, ABILITY_SCORES } from '../entities/Character.js';
import {
  EQUIPMENT_SLOTS,
  ITEM_TYPES,
  ARMOR_WEIGHTS,
  SHIELD_AC,
  itemType,
  itemSummary,
  equip,
  getEquipped,
  slotAccepts,
} from '../entities/Equipment.js';
import { wireDisclosure } from './Disclosure.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').ItemType} ItemType */
/** @typedef {import('../entities/InventoryLog.js').InventoryEvent} InventoryEvent */

/**
 * Derive a stable item id from its name so adding the same item twice stacks
 * quantity onto the existing row instead of creating a duplicate one.
 * @param {string} name
 * @returns {string}
 */
function idFromName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Equipment slot rows: a labeled select per slot, its options limited to the
 * inventory items whose type the slot accepts (a potion never appears in the
 * armor pickers), ordered by the slot's preference then name. An already-
 * equipped item that no longer passes the filter (a legacy save) still shows,
 * so it can be seen and unequipped.
 * @param {Character} character
 * @param {(next: Character) => void} commit
 * @param {boolean} playable false renders the pickers disabled (read-only view)
 * @returns {HTMLElement}
 */
function buildEquipment(character, commit, playable) {
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
      commit(equip(character, slot.key, select.value === '' ? null : select.value)),
    );

    row.append(label, select);
    section.appendChild(row);
  }
  return section;
}

/**
 * Mount an inventory panel for the currently selected character, collapsed by
 * default to a one-line item count behind an accessible disclosure button.
 * Expanded, it lists items with a consume-one control (stacks of 2+) and a
 * remove-whole-stack button, plus a small form to add new items (or add
 * quantity to an existing one, keyed by name).
 * Renders an empty state when no character is selected (`null`).
 * Item interactions (add, consume, discard) are reported through `onEvent`
 * with the acting character, so the caller can log them; equipment changes
 * commit silently.
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * With a `canPlay` callback returning false the panel renders read-only: no
 * equipment changes, no consume/remove controls, no add form (a spectator's
 * or another player's view of this character).
 * @param {(character: Character) => void} [onChange]
 * @param {(event: InventoryEvent, character: Character) => void} [onEvent]
 * @param {() => boolean} [canPlay]
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountInventoryPanel(
  container,
  initial,
  onChange = () => {},
  onEvent = () => {},
  canPlay = () => true,
) {
  let current = initial;
  // Survives re-renders (every edit re-renders) but stays per-mount, so the
  // panel doesn't snap shut after each item change.
  let expanded = false;

  const root = document.createElement('div');
  root.className = 'inventory-panel';
  container.appendChild(root);

  /**
   * @param {Character} next
   * @param {InventoryEvent} [event] the interaction that produced `next`, when loggable
   */
  function commit(next, event) {
    current = next;
    onChange(next);
    if (event) onEvent(event, next);
    render();
  }

  function render() {
    root.innerHTML = '';

    // Captured non-null so listeners created below keep the narrowing.
    const character = current;
    if (!character) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No character selected.';
      root.appendChild(empty);
      return;
    }

    const itemCount = character.inventory.reduce((sum, item) => sum + item.quantity, 0);
    const summary = document.createElement('button');
    summary.type = 'button';
    summary.className = 'disclosure inventory-panel__summary';
    const summaryLabel = document.createElement('span');
    summaryLabel.textContent = itemCount === 1 ? '1 item' : `${itemCount} items`;
    summary.append(summaryLabel, icon('chevron', { className: 'disclosure__chevron' }));

    const body = document.createElement('div');
    body.className = 'inventory-panel__body';

    const playable = canPlay();
    body.appendChild(buildEquipment(character, commit, playable));

    const list = document.createElement('div');
    list.className = 'inventory-panel__list';
    for (const item of character.inventory) {
      const row = document.createElement('div');
      row.className = 'inventory-panel__row';

      const label = document.createElement('span');
      label.className = 'inventory-panel__label';
      label.textContent = `${item.name} x${item.quantity}`;

      const type = document.createElement('span');
      type.className = 'inventory-panel__type';
      const effects = itemSummary(item);
      type.textContent = effects ? `${itemType(item)} — ${effects}` : itemType(item);

      row.append(label, type);

      if (!playable) {
        list.appendChild(row);
        continue;
      }

      // Present even on 1-stacks: consuming the last of an item and discarding
      // it are the same state change but different travelogue lines.
      const consumeButton = document.createElement('button');
      consumeButton.type = 'button';
      consumeButton.className = 'btn btn--icon';
      consumeButton.setAttribute('aria-label', `Consume one ${item.name}`);
      consumeButton.appendChild(icon('minus'));
      consumeButton.addEventListener('click', () =>
        commit(removeItem(character, item.id, 1), { verb: 'use', itemName: item.name, count: 1 }),
      );
      row.appendChild(consumeButton);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn--icon btn--danger';
      removeButton.setAttribute('aria-label', `Remove all ${item.name}`);
      removeButton.appendChild(icon('remove'));
      removeButton.addEventListener('click', () =>
        commit(removeItem(character, item.id, item.quantity), {
          verb: 'discard',
          itemName: item.name,
          count: item.quantity,
        }),
      );

      row.appendChild(removeButton);
      list.appendChild(row);
    }
    body.appendChild(list);

    if (!playable) {
      wireDisclosure(summary, body, { expanded, onToggle: (next) => { expanded = next; } });
      root.append(summary, body);
      return;
    }

    const form = document.createElement('div');
    form.className = 'inventory-panel__form';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Item name';
    nameInput.className = 'field inventory-panel__name-input';

    /**
     * A small captioned wrapper so each control in the add form names itself.
     * @param {string} caption
     * @param {HTMLElement} control
     * @returns {HTMLLabelElement}
     */
    function labeled(caption, control) {
      const label = document.createElement('label');
      label.className = 'inventory-panel__field-label';
      const text = document.createElement('span');
      text.textContent = caption;
      label.append(text, control);
      return label;
    }

    const quantityInput = document.createElement('input');
    quantityInput.type = 'number';
    quantityInput.value = '1';
    quantityInput.min = '1';
    quantityInput.className = 'field inventory-panel__quantity-input';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'field inventory-panel__type-select';
    for (const t of ITEM_TYPES) {
      const option = document.createElement('option');
      option.value = t;
      // "gear" is the catch-all for miscellaneous, non-equippable items
      // (rope, rations, trinkets); say so where the GM picks it.
      option.textContent = t === 'gear' ? 'gear (misc.)' : t;
      typeSelect.appendChild(option);
    }

    // Body armor: its 5e weight class (which alone fixes the DEX scaling —
    // never the GM's input) and a configurable base AC defaulting to a
    // representative value for the chosen weight.
    const weightSelect = document.createElement('select');
    weightSelect.className = 'field';
    for (const w of ARMOR_WEIGHTS) {
      const option = document.createElement('option');
      option.value = w.key;
      option.textContent =
        w.dexCap === 0 ? `${w.label} (no DEX)`
        : w.dexCap === Infinity ? `${w.label} (+ DEX)`
        : `${w.label} (+ DEX, max ${w.dexCap})`;
      weightSelect.appendChild(option);
    }
    const baseACInput = document.createElement('input');
    baseACInput.type = 'number';
    baseACInput.value = String(ARMOR_WEIGHTS[0].defaultBaseAC);
    baseACInput.min = '1';
    baseACInput.className = 'field inventory-panel__ac-input';
    weightSelect.addEventListener('change', () => {
      const weight = ARMOR_WEIGHTS.find((w) => w.key === weightSelect.value);
      if (weight) baseACInput.value = String(weight.defaultBaseAC);
    });
    const weightField = labeled('Weight', weightSelect);
    const baseACField = labeled('Base AC', baseACInput);

    // Shields are always +2 AC (5e), so no input — just say so.
    const shieldNote = document.createElement('span');
    shieldNote.className = 'inventory-panel__note';
    shieldNote.textContent = `+${SHIELD_AC} AC`;
    const shieldField = labeled('Shield', shieldNote);

    // Non-armor equippables (helmets, rings, bows...) may carry a flat AC
    // bonus while equipped.
    const FLAT_AC_TYPES = ['weapon', 'helmet', 'gloves', 'greaves', 'bow', 'ring'];
    const acInput = document.createElement('input');
    acInput.type = 'number';
    acInput.value = '0';
    acInput.min = '0';
    acInput.className = 'field inventory-panel__ac-input';
    acInput.title = 'Flat AC bonus while equipped';
    const acField = labeled('AC bonus', acInput);

    // Any equippable may buff an ability score while worn (e.g. +2 STR).
    const EQUIPPABLE_TYPES = ['weapon', 'armor', 'helmet', 'gloves', 'greaves', 'shield', 'bow', 'ring'];
    const buffStatSelect = document.createElement('select');
    buffStatSelect.className = 'field';
    const noBuff = document.createElement('option');
    noBuff.value = '';
    noBuff.textContent = '—';
    buffStatSelect.appendChild(noBuff);
    for (const stat of ABILITY_SCORES) {
      const option = document.createElement('option');
      option.value = stat;
      option.textContent = stat;
      buffStatSelect.appendChild(option);
    }
    const buffAmountInput = document.createElement('input');
    buffAmountInput.type = 'number';
    buffAmountInput.value = '1';
    buffAmountInput.className = 'field inventory-panel__ac-input';
    const buffStatField = labeled('Buff', buffStatSelect);
    const buffAmountField = labeled('Amount', buffAmountInput);

    const syncTypeFields = () => {
      const type = typeSelect.value;
      weightField.hidden = baseACField.hidden = type !== 'armor';
      shieldField.hidden = type !== 'shield';
      acField.hidden = !FLAT_AC_TYPES.includes(type);
      buffStatField.hidden = !EQUIPPABLE_TYPES.includes(type);
      buffAmountField.hidden = buffStatField.hidden || buffStatSelect.value === '';
    };
    typeSelect.addEventListener('change', syncTypeFields);
    buffStatSelect.addEventListener('change', syncTypeFields);
    syncTypeFields();

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'btn btn--primary';
    addButton.setAttribute('aria-label', 'Add item');
    addButton.appendChild(icon('add'));
    addButton.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const quantity = Number(quantityInput.value);
      if (!name || quantity <= 0) return;
      const type = /** @type {ItemType} */ (typeSelect.value);
      const acBonus = FLAT_AC_TYPES.includes(type) ? Math.max(0, Number(acInput.value) || 0) : 0;
      const buffStat = EQUIPPABLE_TYPES.includes(type) ? buffStatSelect.value : '';
      const buffAmount = Number(buffAmountInput.value) || 0;
      commit(
        addItem(character, {
          id: idFromName(name),
          name,
          quantity,
          notes: '',
          type,
          ...(type === 'armor'
            ? {
                armorWeight: /** @type {import('../types/entities.js').ArmorWeight} */ (weightSelect.value),
                baseAC: Math.max(1, Number(baseACInput.value) || 10),
              }
            : {}),
          ...(acBonus > 0 ? { acBonus } : {}),
          ...(buffStat && buffAmount !== 0 ? { statBonuses: { [buffStat]: buffAmount } } : {}),
        }),
        { verb: 'pickup', itemName: name, count: quantity },
      );
      nameInput.value = '';
      quantityInput.value = '1';
    });

    form.append(
      nameInput,
      labeled('Type', typeSelect),
      weightField,
      baseACField,
      shieldField,
      acField,
      buffStatField,
      buffAmountField,
      labeled('Qty', quantityInput),
      addButton,
    );
    body.appendChild(form);

    wireDisclosure(summary, body, { expanded, onToggle: (next) => { expanded = next; } });
    root.append(summary, body);
  }

  render();
  return {
    getCharacter: () => current,
    /** Sync in an externally-updated character (e.g. from a sibling panel) and re-render. */
    setCharacter: (next) => {
      current = next;
      render();
    },
  };
}
