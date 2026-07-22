import { setStat, addXP, XP_PER_LEVEL } from '../entities/Character.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Mount an editable character sheet: name/level/xp header, an XP-add
 * control, and one number input per stat.
 * Renders an empty state when no character is selected (`null`).
 * @param {HTMLElement} container
 * @param {Character | null} character
 * @param {(character: Character) => void} [onChange]
 * @returns {{ getCharacter: () => Character | null, setCharacter: (character: Character | null) => void }}
 */
export function mountCharacterSheet(container, character, onChange = () => {}) {
  let current = character;

  const root = document.createElement('div');
  root.className = 'character-sheet';
  container.appendChild(root);

  /** @param {Character} next */
  function commit(next) {
    current = next;
    onChange(next);
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

    const header = document.createElement('div');
    header.className = 'character-sheet__header';
    header.textContent = `${character.name} — Level ${character.level}`;
    root.appendChild(header);

    const xpRow = document.createElement('div');
    xpRow.className = 'character-sheet__xp';

    const xpLabel = document.createElement('span');
    xpLabel.textContent = `XP: ${character.xp} / ${character.level * XP_PER_LEVEL}`;

    const xpInput = document.createElement('input');
    xpInput.type = 'number';
    xpInput.className = 'field character-sheet__xp-input';
    xpInput.value = '0';
    xpInput.min = '0';
    xpInput.setAttribute('aria-label', 'XP to add');

    const xpButton = document.createElement('button');
    xpButton.type = 'button';
    xpButton.className = 'btn';
    xpButton.append(icon('add'), document.createTextNode('XP'));
    xpButton.addEventListener('click', () => {
      const amount = Number(xpInput.value);
      if (amount > 0) commit(addXP(character, amount));
    });

    xpRow.append(xpLabel, xpInput, xpButton);
    root.appendChild(xpRow);

    const statsList = document.createElement('div');
    statsList.className = 'character-sheet__stats';
    for (const [key, value] of Object.entries(character.stats)) {
      const row = document.createElement('div');
      row.className = 'character-sheet__stat-row';

      const label = document.createElement('label');
      label.className = 'character-sheet__stat-label';
      label.textContent = key;

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'field character-sheet__stat-input';
      input.value = String(value);
      input.addEventListener('change', () => {
        commit(setStat(character, key, Number(input.value)));
      });

      label.appendChild(input);
      row.appendChild(label);
      statsList.appendChild(row);
    }
    root.appendChild(statsList);
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
