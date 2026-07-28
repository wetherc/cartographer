import { iconButton, textButton, emptyState } from './buttons.js';
import { classNames, el } from './dom.js';
import { getHP } from '../entities/Character.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * A compact HP bar for a roster row: a filled track whose width and color band
 * track current/max HP, with the numbers as an accessible label. Characters
 * without an HP pool (none authored yet) get an empty, unlabeled track.
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
 * Mount the party roster: one row per character (select + delete) and a
 * "new character" button. Pure DOM wiring — creation/deletion semantics
 * (modals, id generation, list updates) are supplied via callbacks so the
 * roster stays as thin as the other panels.
 * @param {HTMLElement} container
 * With `onAwardXP`, a non-empty roster also offers an "Award XP" action that
 * grants the same amount to every party member at once (the caller prompts for
 * the amount), so leveling after an encounter doesn't mean visiting each sheet.
 * With a `canManage` callback returning false the roster is browse-only:
 * rows still select (any viewer may look at a sheet) but the add/delete/award
 * controls disappear — roster membership is the GM's to manage.
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
 * With `onPlace`, each managed row also offers a "place on map" action so the
 * GM can move one character to any node/tile (or back to the party) without
 * touching the rest of the party; `canPlace` (checked per render, like
 * `canManage`) hides that action while splitting the party is disallowed.
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
        classNames(['row-select character-roster__select', current && 'row-select--current']),
        el('span', 'character-roster__label', `${character.name} (Lv ${character.level})`),
        hpMeter(character),
      );
      select.type = 'button';
      if (current) select.setAttribute('aria-current', 'true');
      select.addEventListener('click', () => options.onSelect(character.id));

      const row = el('div', 'character-roster__row', select);
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
