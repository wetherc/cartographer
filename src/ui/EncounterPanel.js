import { applyDamage, heal, isDefeated } from '../entities/Encounter.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Encounter} Encounter */

/**
 * Mount an encounter panel: one row per encounter with an HP readout and a
 * damage/heal amount applied via two buttons. Defeated encounters (currentHP
 * <= 0) render with a distinguishing class instead of being removed, so a
 * GM can still see what died.
 * @param {HTMLElement} container
 * @param {Encounter[]} encounters
 * @param {(encounters: Encounter[]) => void} [onChange]
 * @returns {{ getEncounters: () => Encounter[] }}
 */
export function mountEncounterPanel(container, encounters, onChange = () => {}) {
  let current = encounters;

  const root = document.createElement('div');
  root.className = 'encounter-panel';
  container.appendChild(root);

  function commit(next) {
    current = next;
    onChange(current);
    render();
  }

  function updateOne(id, fn) {
    commit(current.map((e) => (e.id === id ? fn(e) : e)));
  }

  function render() {
    root.innerHTML = '';

    for (const encounter of current) {
      const row = document.createElement('div');
      row.className = 'encounter-panel__row';
      if (isDefeated(encounter)) row.classList.add('encounter-panel__row--defeated');

      const label = document.createElement('span');
      label.className = 'encounter-panel__label';
      label.textContent = `${encounter.name} (${encounter.currentHP}/${encounter.maxHP})`;

      const amountInput = document.createElement('input');
      amountInput.type = 'number';
      amountInput.value = '1';
      amountInput.min = '0';
      amountInput.className = 'field encounter-panel__amount';
      amountInput.setAttribute('aria-label', `Damage/heal amount for ${encounter.name}`);

      const damageButton = document.createElement('button');
      damageButton.type = 'button';
      damageButton.className = 'btn btn--icon btn--danger';
      damageButton.setAttribute('aria-label', `Damage ${encounter.name}`);
      damageButton.appendChild(icon('damage'));
      damageButton.addEventListener('click', () => {
        updateOne(encounter.id, (e) => applyDamage(e, Number(amountInput.value)));
      });

      const healButton = document.createElement('button');
      healButton.type = 'button';
      healButton.className = 'btn btn--icon btn--success';
      healButton.setAttribute('aria-label', `Heal ${encounter.name}`);
      healButton.appendChild(icon('heal'));
      healButton.addEventListener('click', () => {
        updateOne(encounter.id, (e) => heal(e, Number(amountInput.value)));
      });

      row.append(label, amountInput, damageButton, healButton);
      root.appendChild(row);
    }
  }

  render();
  return { getEncounters: () => current };
}
