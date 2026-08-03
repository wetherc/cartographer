import { CONDITIONS, addCondition, removeCondition } from '../entities/Conditions.js';
import { chipRider, riderSummary } from '../entities/Riders.js';
import { promptModal } from './Modal.js';
import { chip, iconButton, removableChip, textButton } from './buttons.js';
import { clampInt } from '../util/num.js';
import { el } from './dom.js';

/** @typedef {import('../types/entities.js').Condition} Condition */

/**
 * A row of status-condition chips with an add control, shared by the
 * character sheet and the encounter panel. This bar is self-contained: it
 * reads the current list through `getConditions`, opens its own add dialog,
 * and reports the whole new list through `onChange`. The owner only has to
 * persist that list.
 * When `canEdit` returns false, the bar renders read-only: chips with no
 * remove button and no add control. This is the spectator's view.
 * @param {HTMLElement} container
 * @param {{ getConditions: () => Condition[], onChange: (next: Condition[]) => void, canEdit?: () => boolean }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountConditionsBar(container, callbacks) {
  const canEdit = callbacks.canEdit ?? (() => true);
  const root = el('div', 'conditions-bar u-row u-wrap u-g1');
  container.appendChild(root);

  /** @param {Condition} condition */
  function buildChip(condition) {
    const label =
      condition.rounds === null ? condition.name : `${condition.name} (${condition.rounds})`;
    // A rider goes in the tooltip, not the label. Chips already carry a round
    // counter and sit in a narrow row.
    const rider = chipRider(condition);
    const title = rider ? riderSummary(rider) : '';
    const element = !canEdit()
      ? chip(label)
      : removableChip(
          label,
          () => {
            callbacks.onChange(removeCondition(callbacks.getConditions(), condition.name));
            render();
          },
          { removeLabel: condition.name },
        );
    if (title) element.title = title;
    return element;
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
    const rounds = values.rounds === '' ? null : clampInt(values.rounds, 1);
    callbacks.onChange(addCondition(callbacks.getConditions(), values.name, rounds));
    render();
  }

  function render() {
    root.innerHTML = '';
    const conditions = callbacks.getConditions();
    for (const condition of conditions) root.appendChild(buildChip(condition));
    if (!canEdit()) return;
    // With no chips for context, a plain icon button is unclear. Use a
    // labeled button instead.
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
