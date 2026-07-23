import { icon } from './icons.js';

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
 * @param {{
 *   getCharacters: () => Character[],
 *   getSelectedId: () => string | null,
 *   onSelect: (id: string) => void,
 *   onAdd: () => void,
 *   onDelete: (id: string) => void,
 *   onAwardXP?: () => void,
 * }} options
 * @returns {{ update: () => void }}
 */
export function mountCharacterRoster(container, options) {
  const root = document.createElement('div');
  root.className = 'character-roster';
  container.appendChild(root);

  function render() {
    root.innerHTML = '';

    const characters = options.getCharacters();
    const selectedId = options.getSelectedId();

    if (characters.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No characters yet.';
      root.appendChild(empty);
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

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn btn--icon character-roster__delete';
      del.setAttribute('aria-label', `Delete ${character.name}`);
      del.appendChild(icon('remove'));
      del.addEventListener('click', () => options.onDelete(character.id));

      row.append(select, del);
      root.appendChild(row);
    }

    const actions = document.createElement('div');
    actions.className = 'panel-actions';

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn character-roster__add';
    add.append(icon('add'), document.createTextNode('New character'));
    add.addEventListener('click', () => options.onAdd());
    actions.appendChild(add);

    if (options.onAwardXP && characters.length > 0) {
      const award = document.createElement('button');
      award.type = 'button';
      award.className = 'btn character-roster__award';
      award.append(icon('sparkles'), document.createTextNode('Award XP'));
      award.addEventListener('click', () => options.onAwardXP?.());
      actions.appendChild(award);
    }

    root.appendChild(actions);
  }

  render();
  return { update: render };
}
