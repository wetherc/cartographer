/**
 * This file holds the four composite fields a form dialog can hold: the
 * checkbox group, the tag entry, the assignment pill grid, and the
 * distribution grid. Each field owns its own working state and its own
 * rendering. These fields formed the bulk of `Modal.js`'s field switch before
 * this split. Each field follows the same `{ element, get, set }` contract as
 * the item form's list editors. This lets `Modal.js` treat a composite field
 * as one value, and lets the pickers work outside a dialog too.
 *
 * Every builder reports edits by letting an `input` event reach `element`.
 * A dialog's `onChange` listens on that event.
 */

import { emptyState, removableChip } from './buttons.js';
import { classNames, el } from './dom.js';
import { splitList, splitTrimmedList } from '../util/text.js';

/** @typedef {import('../types/modal.js').FieldOption} FieldOption */
/** @typedef {import('../types/modal.js').CompositeField} CompositeField */

/**
 * A scrollable checkbox group whose value is the comma-joined checked values.
 * `max` caps the picks: it disables the unchecked boxes once the cap is
 * reached. `fixedHeight` pins the box's height, so a refilter does not reflow
 * the dialog, and `emptyText` fills the box while there are no options.
 * `className` is appended to the box's own classes, so a caller that mounts it
 * outside a dialog still gets the scroll box.
 * @param {{
 *   options?: FieldOption[],
 *   value?: string,
 *   max?: number,
 *   emptyText?: string,
 *   fixedHeight?: boolean,
 *   className?: string,
 * }} spec
 * @returns {CompositeField & { setOptions: (options: FieldOption[], max?: number) => void }}
 */
export function buildMultiselect(spec) {
  const element = el(
    'div',
    classNames([
      'field modal__multiselect',
      spec.fixedHeight && 'modal__multiselect--fixed',
      spec.className,
    ]),
  );

  /** @type {HTMLInputElement[]} */
  let checks = [];
  /** The option set now on screen. `set` uses this to write a new selection
   * over it without the caller restating the options. */
  let current = spec.options ?? [];
  let max = spec.max ?? Infinity;

  const enforceMax = () => {
    const full = checks.filter((c) => c.checked).length >= max;
    for (const check of checks) check.disabled = full && !check.checked;
  };

  // Rebuild the checkbox rows for a fresh option set, and check the options in
  // `selected`. The initial render and every refilter reuse this function.
  const render = (/** @type {FieldOption[]} */ options, /** @type {Set<string>} */ selected) => {
    element.textContent = '';
    current = options;
    if (!options.length && spec.emptyText) element.appendChild(emptyState(spec.emptyText));
    checks = options.map((option) => {
      const check = el('input');
      check.type = 'checkbox';
      check.value = option.value;
      check.checked = selected.has(option.value);
      element.appendChild(
        el('label', 'modal__multiselect-option u-row u-g2', check, el('span', '', option.label)),
      );
      return check;
    });
    enforceMax();
  };

  render(current, new Set(splitList(spec.value)));
  element.addEventListener('input', enforceMax);

  return {
    element,
    get: () =>
      checks
        .filter((c) => c.checked)
        .map((c) => c.value)
        .join(','),
    set: (value) => render(current, new Set(splitList(value))),
    // A refilter keeps whatever is now checked, even when a checked option
    // drops out of the new option set. This keeps a valid pick from being
    // lost mid-edit.
    setOptions: (options, newMax) => {
      if (newMax !== undefined) max = newMax;
      render(options, new Set(checks.filter((c) => c.checked).map((c) => c.value)));
    },
  };
}

/**
 * A pill list with an inline text entry. Enter finalizes the typed text as a
 * pill. The x removes one pill. Backspace in an empty entry removes the last
 * pill. The value is the comma-joined pills plus any un-finalized text, so
 * submit loses nothing typed.
 * @param {{ value?: string }} spec
 * @returns {CompositeField}
 */
export function buildTagsField(spec) {
  const element = el('div', 'field modal__tags u-row u-wrap u-g1');

  /** @type {string[]} */
  let tags = splitTrimmedList(spec.value);
  const entry = el('input', 'modal__tags-input');
  entry.type = 'text';

  const render = () => {
    element.textContent = '';
    for (const tag of tags) {
      element.appendChild(
        removableChip(tag, () => {
          tags = tags.filter((t) => t !== tag);
          render();
          entry.focus();
        }),
      );
    }
    element.appendChild(entry);
  };

  entry.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault(); // Finalize the pill. Do not submit the dialog.
      const text = entry.value.trim();
      if (text && !tags.includes(text)) tags.push(text);
      entry.value = '';
      render();
      entry.focus();
    } else if (event.key === 'Backspace' && !entry.value && tags.length) {
      tags.pop();
      render();
      entry.focus();
    }
  });
  element.addEventListener('click', () => entry.focus());
  render();

  return {
    element,
    get: () => [...tags, entry.value.trim()].filter(Boolean).join(','),
    set: (value) => {
      tags = splitTrimmedList(value);
      render();
    },
  };
}

/**
 * An assignment grid. Each row, for example an ability, holds at most one of
 * the option values, for example an entry from the standard array. Every
 * value belongs to at most one row. A click assigns a value. A click on the
 * held pill un-assigns it. A click on a pill another row holds moves that
 * pill to this row. The value is the comma-joined `row:value` pairs of the
 * assigned rows.
 * @param {{ options?: FieldOption[], rows?: { value: string, label: string }[], value?: string }} spec
 * @returns {CompositeField}
 */
export function buildPillGrid(spec) {
  const element = el('div', 'modal__pillgrid u-col u-g2');

  let assigned = parseAssignments(spec.value ?? '');

  const render = () => {
    element.textContent = '';
    for (const row of spec.rows ?? []) {
      const rowEl = el('div', 'u-row u-g2', el('span', 'modal__pillgrid-label', row.label));
      for (const option of spec.options ?? []) {
        const held = assigned[row.value] === option.value;
        const pill = el(
          'button',
          classNames(['modal__pill', held && 'modal__pill--selected']),
          option.label,
        );
        pill.type = 'button';
        pill.setAttribute('aria-pressed', String(held));
        pill.addEventListener('click', () => {
          assigned = assignPill(assigned, row.value, option.value);
          render();
          element.dispatchEvent(new Event('input'));
        });
        rowEl.appendChild(pill);
      }
      element.appendChild(rowEl);
    }
  };
  render();

  return {
    element,
    get: () => formatAssignments(assigned),
    set: (value) => {
      assigned = parseAssignments(value);
      render();
    },
  };
}

/**
 * A distribution grid: one number input per row, and a live line that states
 * how many of `total` are still unassigned. The form will not submit until
 * the rows sum to exactly `total`. The first input's own validity enforces
 * this, so the browser reports the error the way it reports any other
 * invalid field. The value is the comma-joined `row:count` pairs, with
 * zeroed rows left out.
 *
 * `setTotal` restates how many items there are to distribute, for a total
 * that another field decides, for example the cast dialog's slot level,
 * which sets how many projectiles a spell fires. A raise leaves the rows
 * alone and asks for the difference. A lowering trims from the last rows
 * down, so the rows the GM assigned first keep their value.
 * @param {{
 *   rows?: FieldOption[],
 *   total?: number,
 *   value?: string,
 *   unit?: string,
 * }} spec
 * @returns {CompositeField}
 */
export function buildAllocation(spec) {
  const element = el('div', 'modal__allocation u-col u-g1');
  // The rows scroll and the remaining line does not. A long target list can
  // never push the one piece of feedback that explains why Cast is refused
  // out of sight.
  const box = el('div', 'field modal__allocation-rows u-col u-g1');
  const rows = spec.rows ?? [];
  let total = Math.max(0, Math.floor(spec.total ?? 0));
  const unit = spec.unit ?? 'left';
  const remaining = el('p', 'modal__allocation-remaining u-muted');
  remaining.setAttribute('aria-live', 'polite');

  /** @type {HTMLInputElement[]} */
  const inputs = rows.map((row) => {
    const input = el('input', 'field modal__allocation-input');
    input.type = 'number';
    input.min = '0';
    input.max = String(total);
    input.value = '0';
    // The row's name sits in a sibling span, not a <label>, because the whole
    // field is already mounted inside the dialog's field label.
    input.setAttribute('aria-label', row.label);
    box.appendChild(
      el(
        'div',
        'modal__allocation-row u-row u-g2',
        el('span', 'modal__allocation-name', row.label),
        input,
      ),
    );
    return input;
  });
  element.append(box, remaining);

  const assignedOf = (/** @type {HTMLInputElement} */ input) =>
    Math.max(0, Math.floor(Number(input.value) || 0));

  const sync = () => {
    const left = total - inputs.reduce((sum, input) => sum + assignedOf(input), 0);
    remaining.textContent = left === 0 ? 'All assigned' : `${left} ${unit}`;
    remaining.classList.toggle('modal__allocation-remaining--short', left !== 0);
    inputs[0]?.setCustomValidity(left === 0 ? '' : `Assign all ${total}.`);
  };

  const write = (/** @type {string} */ value) => {
    const assigned = parseAssignments(value);
    for (const [i, input] of inputs.entries()) {
      input.value = String(Math.max(0, Math.floor(Number(assigned[rows[i].value]) || 0)));
    }
    sync();
  };

  write(spec.value ?? '');
  element.addEventListener('input', sync);

  return {
    element,
    setTotal: (next) => {
      total = Math.max(0, Math.floor(next));
      for (const input of inputs) input.max = String(total);
      let over = inputs.reduce((sum, input) => sum + assignedOf(input), 0) - total;
      for (let i = inputs.length - 1; i >= 0 && over > 0; i--) {
        const held = assignedOf(inputs[i]);
        const taken = Math.min(held, over);
        inputs[i].value = String(held - taken);
        over -= taken;
      }
      sync();
    },
    get: () =>
      rows
        .map((row, i) => ({ row: row.value, count: assignedOf(inputs[i]) }))
        .filter((entry) => entry.count > 0)
        .map((entry) => `${entry.row}:${entry.count}`)
        .join(','),
    set: write,
  };
}

/**
 * Assign `value` to `row`, and return the new assignment map. A click on the
 * pill the row already holds clears the row. A click on a pill another row
 * holds swaps the two rows' values. A GM who re-assigns a score never has to
 * un-assign it first, and the row that loses the value takes this row's old
 * value instead of becoming empty.
 * @param {Record<string, string>} assigned
 * @param {string} row
 * @param {string} value
 * @returns {Record<string, string>}
 */
export function assignPill(assigned, row, value) {
  const next = { ...assigned };
  const previous = next[row];
  if (previous === value) {
    delete next[row];
    return next;
  }
  const holder = Object.keys(next).find((key) => key !== row && next[key] === value);
  next[row] = value;
  if (holder !== undefined) {
    if (previous !== undefined) next[holder] = previous;
    else delete next[holder];
  }
  return next;
}

/**
 * Read the `row:value` pair list that a pill grid stores its state as.
 * @param {string} value
 * @returns {Record<string, string>}
 */
export function parseAssignments(value) {
  /** @type {Record<string, string>} */
  const assigned = {};
  for (const pair of splitList(value)) {
    const [row, held] = pair.split(':');
    if (row && held) assigned[row] = held;
  }
  return assigned;
}

/**
 * The reverse of `parseAssignments`.
 * @param {Record<string, string>} assigned
 * @returns {string}
 */
export function formatAssignments(assigned) {
  return Object.entries(assigned)
    .map(([row, held]) => `${row}:${held}`)
    .join(',');
}
