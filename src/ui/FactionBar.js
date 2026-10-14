import { el } from './dom.js';
import { textButton } from './buttons.js';
import { select, setOptions } from './formFields.js';
import { factionFilterOptions } from '../entities/Factions.js';

/** @typedef {import('../types/creature.js').Faction} Faction */

/**
 * The faction row above the NPC list: a filter select and a Factions button
 * that opens the faction list. The select shows only while the campaign has
 * factions, so a campaign without them shows the button alone. A filter for
 * a faction that no longer exists falls back to every faction. A Player tab
 * hides the row (session.css).
 * @param {{
 *   getFactions: () => readonly Faction[],
 *   getFilter: () => string,
 *   onFilter: (value: string) => void,
 *   onEdit: () => void,
 * }} callbacks
 * @returns {{ element: HTMLElement, update: () => void }}
 */
export function factionBar(callbacks) {
  const picker = select([], '', { className: 'npc-factions__filter', ariaLabel: 'Faction' });
  picker.addEventListener('change', () => callbacks.onFilter(picker.value));
  const element = el(
    'div',
    'npc-factions u-row u-g2',
    picker,
    textButton('Factions', callbacks.onEdit, { icon: 'flag', className: 'npc-factions__edit' }),
  );

  /** @type {readonly Faction[] | undefined} */
  let shown;
  function update() {
    const factions = callbacks.getFactions();
    picker.hidden = factions.length === 0;
    if (factions !== shown) {
      shown = factions;
      setOptions(picker, factionFilterOptions(factions), callbacks.getFilter());
    }
    picker.value = callbacks.getFilter();
  }

  update();
  return { element, update };
}
