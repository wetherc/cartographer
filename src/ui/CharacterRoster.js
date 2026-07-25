import { iconButton, textButton, emptyState } from './buttons.js';

/** @typedef {import('../types/entities.js').Character} Character */

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
  const root = document.createElement('div');
  root.className = 'character-roster';
  container.appendChild(root);

  function render() {
    root.innerHTML = '';

    const characters = options.getCharacters();
    const selectedId = options.getSelectedId();

    if (characters.length === 0) {
      root.appendChild(emptyState('No characters yet.'));
    }

    for (const character of characters) {
      const row = document.createElement('div');
      row.className = 'character-roster__row';

      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'character-roster__select';
      if (character.id === selectedId) {
        select.classList.add('character-roster__select--current');
        select.setAttribute('aria-current', 'true');
      }
      select.textContent = `${character.name} (Lv ${character.level})`;
      select.addEventListener('click', () => options.onSelect(character.id));

      row.appendChild(select);
      if (canManage() && options.onPlace && (options.canPlace?.() ?? true)) {
        const place = iconButton(
          'map',
          `Place ${character.name} on the map`,
          () => options.onPlace?.(character.id),
          { className: 'character-roster__place', title: 'Place on map' },
        );
        row.appendChild(place);
      }
      if (canManage()) {
        const del = iconButton(
          'remove',
          `Delete ${character.name}`,
          () => options.onDelete(character.id),
          { variant: 'danger', className: 'character-roster__delete' },
        );
        row.appendChild(del);
      }
      root.appendChild(row);
    }

    if (!canManage()) return;

    const actions = document.createElement('div');
    actions.className = 'panel-actions';

    const add = textButton('New character', () => options.onAdd(), {
      icon: 'add',
      className: 'character-roster__add',
    });
    actions.appendChild(add);

    if (options.onAwardXP && characters.length > 0) {
      const award = textButton('Award XP', () => options.onAwardXP?.(), {
        icon: 'sparkles',
        className: 'character-roster__award',
      });
      actions.appendChild(award);
    }

    root.appendChild(actions);
  }

  render();
  return { update: render };
}
