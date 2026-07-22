import { setStat, addXP, XP_PER_LEVEL } from '../entities/Character.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Mount an editable character sheet: name/level/xp header, an XP-add
 * control, and one number input per stat.
 * @param {HTMLElement} container
 * @param {Character} character
 * @param {(character: Character) => void} [onChange]
 * @returns {{ getCharacter: () => Character }}
 */
export function mountCharacterSheet(container, character, onChange = () => {}) {
  let current = character;

  const root = document.createElement('div');
  root.className = 'character-sheet';
  container.appendChild(root);

  function commit(next) {
    current = next;
    onChange(current);
    render();
  }

  function render() {
    root.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'character-sheet__header';
    header.textContent = `${current.name} — Level ${current.level}`;
    root.appendChild(header);

    const xpRow = document.createElement('div');
    xpRow.className = 'character-sheet__xp';

    const xpLabel = document.createElement('span');
    xpLabel.textContent = `XP: ${current.xp} / ${current.level * XP_PER_LEVEL}`;

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
      if (amount > 0) commit(addXP(current, amount));
    });

    xpRow.append(xpLabel, xpInput, xpButton);
    root.appendChild(xpRow);

    const statsList = document.createElement('div');
    statsList.className = 'character-sheet__stats';
    for (const [key, value] of Object.entries(current.stats)) {
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
        commit(setStat(current, key, Number(input.value)));
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
