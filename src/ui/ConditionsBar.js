import { CONDITIONS, addCondition, removeCondition } from '../entities/Conditions.js';
import { promptModal } from './Modal.js';
import { iconButton, textButton } from './buttons.js';

/** @typedef {import('../types/entities.js').Condition} Condition */

/**
 * A row of status-condition chips with an add control, shared by the character
 * sheet and the encounter panel. Self-contained: it reads the current list via
 * `getConditions`, opens its own add dialog, and reports the whole new list
 * through `onChange`, so the owner only has to persist it.
 * With a `canEdit` callback returning false the bar renders read-only: chips
 * without remove buttons and no add control (a spectator's view).
 * @param {HTMLElement} container
 * @param {{ getConditions: () => Condition[], onChange: (next: Condition[]) => void, canEdit?: () => boolean }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountConditionsBar(container, callbacks) {
  const canEdit = callbacks.canEdit ?? (() => true);
  const root = document.createElement('div');
  root.className = 'conditions-bar';
  container.appendChild(root);

  /** @param {Condition} condition */
  function buildChip(condition) {
    const chip = document.createElement('span');
    chip.className = 'conditions-bar__chip';
    const label =
      condition.rounds === null ? condition.name : `${condition.name} (${condition.rounds})`;
    const text = document.createElement('span');
    text.textContent = label;
    chip.appendChild(text);
    if (!canEdit()) return chip;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'conditions-bar__remove';
    remove.setAttribute('aria-label', `Remove ${condition.name}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      callbacks.onChange(removeCondition(callbacks.getConditions(), condition.name));
      render();
    });
    chip.appendChild(remove);
    return chip;
  }

  async function add() {
    const values = await promptModal(
      'Add condition',
      [
        {
          name: 'name',
          label: 'Condition',
          type: 'select',
          options: CONDITIONS.map((c) => ({ value: c, label: c })),
        },
        { name: 'rounds', label: 'Rounds (blank = until removed)', type: 'number', min: 1 },
      ],
      { submitLabel: 'Add' },
    );
    if (!values || !values.name) return;
    const rounds = values.rounds === '' ? null : Math.max(1, Number(values.rounds) || 1);
    callbacks.onChange(addCondition(callbacks.getConditions(), values.name, rounds));
    render();
  }

  function render() {
    root.innerHTML = '';
    const conditions = callbacks.getConditions();
    for (const condition of conditions) root.appendChild(buildChip(condition));
    if (!canEdit()) return;
    // With no chips to give it context, a bare "+" is cryptic — spell it out.
    const addButton = conditions.length
      ? iconButton('add', 'Add condition', add, { className: 'conditions-bar__add' })
      : textButton('Condition', add, {
          icon: 'add',
          className: 'conditions-bar__add conditions-bar__add--labeled',
          ariaLabel: 'Add condition',
        });
    root.appendChild(addButton);
  }

  render();
  return { update: render };
}
