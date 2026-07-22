import { applyDamage, heal, isDefeated } from '../entities/Encounter.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Encounter} Encounter */

/**
 * Mount an encounter panel: one row per encounter with an HP readout and a
 * damage/heal amount applied via two buttons. Defeated encounters (currentHP
 * <= 0) render with a distinguishing class instead of being removed, so a
 * GM can still see what died.
 *
 * The panel owns no roster state: `getEncounters` supplies the rows to show
 * (typically pre-filtered to the party's location) and every mutation flows
 * back through a callback, so the caller keeps the master list — including
 * encounters filtered out of the current view. Modals live in main.js, so
 * this stays a thin DOM wrapper like the other panels.
 * @param {HTMLElement} container
 * @param {{
 *   getEncounters: () => Encounter[],
 *   onUpdate: (encounter: Encounter) => void,
 *   onDelete: (id: string) => void,
 *   onAdd?: () => Promise<Encounter | null>,
 *   confirmDelete?: (encounter: Encounter) => Promise<boolean>,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountEncounterPanel(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'encounter-panel';
  container.appendChild(root);

  /** @param {Encounter} encounter @param {(encounter: Encounter) => Encounter} fn */
  function updateOne(encounter, fn) {
    callbacks.onUpdate(fn(encounter));
    render();
  }

  function render() {
    root.innerHTML = '';
    const encounters = callbacks.getEncounters();

    if (encounters.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No encounters here.';
      root.appendChild(empty);
    }

    for (const encounter of encounters) {
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
        updateOne(encounter, (e) => applyDamage(e, Number(amountInput.value)));
      });

      const healButton = document.createElement('button');
      healButton.type = 'button';
      healButton.className = 'btn btn--icon btn--success';
      healButton.setAttribute('aria-label', `Heal ${encounter.name}`);
      healButton.appendChild(icon('heal'));
      healButton.addEventListener('click', () => {
        updateOne(encounter, (e) => heal(e, Number(amountInput.value)));
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn btn--icon';
      deleteButton.setAttribute('aria-label', `Delete ${encounter.name}`);
      deleteButton.appendChild(icon('remove'));
      deleteButton.addEventListener('click', async () => {
        const ok = callbacks.confirmDelete ? await callbacks.confirmDelete(encounter) : true;
        if (!ok) return;
        callbacks.onDelete(encounter.id);
        render();
      });

      row.append(label, amountInput, damageButton, healButton, deleteButton);
      root.appendChild(row);
    }

    const onAdd = callbacks.onAdd;
    if (onAdd) {
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'btn encounter-panel__add';
      addButton.append(icon('add'), document.createTextNode('New encounter'));
      addButton.addEventListener('click', async () => {
        // The caller creates and stores the encounter; a non-null return just
        // signals that the visible list may have changed.
        if (await onAdd()) render();
      });
      root.appendChild(addButton);
    }
  }

  render();
  return { update: render };
}
