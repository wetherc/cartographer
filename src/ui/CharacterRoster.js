import { iconButton, textButton, emptyState } from './buttons.js';
import { classNames, el } from './dom.js';
import { getHP } from '../entities/Character.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * A compact HP bar for a roster row. A filled track shows current and max
 * HP through its width and color band, with the numbers as an accessible
 * label. A character with no HP pool authored yet gets an empty, unlabeled track.
 * @param {Character} character
 * @returns {HTMLElement}
 */
function hpMeter(character) {
  const hp = getHP(character);
  const meter = el('span', 'character-roster__hp');
  if (!hp || hp.max <= 0) return meter;
  const ratio = Math.max(0, Math.min(1, hp.current / hp.max));
  meter.dataset.band = ratio <= 0.25 ? 'low' : ratio <= 0.5 ? 'mid' : 'ok';
  meter.setAttribute('role', 'img');
  meter.setAttribute('aria-label', `HP ${hp.current}/${hp.max}`);
  meter.title = `HP ${hp.current}/${hp.max}`;
  const fill = el('span', 'character-roster__hp-fill');
  fill.style.width = `${ratio * 100}%`;
  meter.append(fill, el('span', 'character-roster__hp-text', `${hp.current}/${hp.max}`));
  return meter;
}

/**
 * Mount the party roster: one row per character, with select and delete,
 * and a New character button. This is pure DOM wiring. Callbacks supply
 * the creation and deletion logic, for example modals, id generation, and
 * list updates, so the roster stays as thin as the other panels.
 * @param {HTMLElement} container
 * If onAwardXP is set, a non-empty roster also offers an Award XP action.
 * This grants the same amount to every party member at once, with the
 * caller prompting for the amount, so leveling after an encounter does not
 * mean a visit to each sheet. If canManage returns false, the roster is
 * browse-only. Rows still select, since any viewer can look at a sheet,
 * but the add, delete, and award controls disappear. Roster membership
 * belongs to the GM to manage.
 * @param {{
 *   getCharacters: () => Character[],
 *   getSelectedId: () => string | null,
 *   onSelect: (id: string) => void,
 *   onAdd: () => void,
 *   onDelete: (id: string) => void,
 *   onAwardXP?: () => void,
 *   onPlace?: (id: string) => void,
 *   canManage?: () => boolean,
 *   canPlace?: () => boolean,
 * }} options
 * If onPlace is set, each managed row also offers a Place on map action.
 * This lets the GM move one character to any node or tile, or back to the
 * party, without changing the rest of the party. canPlace, checked per
 * render like canManage, hides that action while splitting the party is
 * not allowed.
 * @returns {{ update: () => void }}
 */
export function mountCharacterRoster(container, options) {
  const canManage = options.canManage ?? (() => true);
  const root = el('div', 'character-roster');
  container.appendChild(root);

  function render() {
    root.innerHTML = '';

    const characters = options.getCharacters();
    const selectedId = options.getSelectedId();

    if (characters.length === 0) {
      root.appendChild(emptyState('No characters yet.'));
    }

    for (const character of characters) {
      const current = character.id === selectedId;
      const select = el(
        'button',
        classNames([
          'row-select character-roster__select u-row u-g2',
          current && 'row-select--current',
        ]),
        el('span', 'character-roster__label', `${character.name} (Lv ${character.level})`),
        hpMeter(character),
      );
      select.type = 'button';
      if (current) select.setAttribute('aria-current', 'true');
      select.addEventListener('click', () => options.onSelect(character.id));

      const row = el('div', 'character-roster__row u-row u-g1', select);
      if (canManage() && options.onPlace && (options.canPlace?.() ?? true)) {
        row.appendChild(
          iconButton(
            'map',
            `Place ${character.name} on the map`,
            () => options.onPlace?.(character.id),
            { className: 'character-roster__place', title: 'Place on map' },
          ),
        );
      }
      if (canManage()) {
        row.appendChild(
          iconButton('remove', `Delete ${character.name}`, () => options.onDelete(character.id), {
            variant: 'danger',
            className: 'character-roster__delete',
          }),
        );
      }
      root.appendChild(row);
    }

    if (!canManage()) return;

    root.appendChild(
      el(
        'div',
        'panel-actions',
        textButton('New character', () => options.onAdd(), {
          icon: 'add',
          className: 'character-roster__add',
        }),
        options.onAwardXP &&
          characters.length > 0 &&
          textButton('Award XP', () => options.onAwardXP?.(), {
            icon: 'sparkles',
            className: 'character-roster__award',
          }),
      ),
    );
  }

  render();
  return { update: render };
}
