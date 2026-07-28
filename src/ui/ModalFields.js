/**
 * The four composite fields a form dialog can hold: the checkbox group, the tag
 * entry, the assignment pill grid, and the distribution grid. Each owns its own
 * working state and its own rendering, which is what made them the bulk of
 * `Modal.js`'s field switch;
 * split out here they follow the same `{ element, get, set }` contract as the
 * item form's list editors, so `Modal.js` treats a composite field as one value
 * and the pickers are reusable outside a dialog.
 *
 * Every builder reports edits by letting an `input` event reach `element`, which
 * is what a dialog's `onChange` listens on.
 */

import { emptyState, removableChip } from './buttons.js';
import { classNames, el } from './dom.js';

/** @typedef {import('../types/modal.js').FieldOption} FieldOption */
/** @typedef {import('../types/modal.js').CompositeField} CompositeField */

/**
 * A scrollable checkbox group whose value is the comma-joined checked values.
 * `max` caps the picks by disabling the unchecked boxes once reached;
 * `fixedHeight` pins the box's height so a refilter doesn't reflow the dialog,
 * with `emptyText` filling it while there are no options. `className` overrides
 * the box's classes for a caller mounting it outside a dialog.
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
    spec.className ??
      classNames(['field modal__multiselect', spec.fixedHeight && 'modal__multiselect--fixed']),
  );

  /** @type {HTMLInputElement[]} */
  let checks = [];
  /** The option set currently rendered, so `set` can write a new selection over
   * it without the caller restating the options. */
  let current = spec.options ?? [];
  let max = spec.max ?? Infinity;

  const enforceMax = () => {
    const full = checks.filter((c) => c.checked).length >= max;
    for (const check of checks) check.disabled = full && !check.checked;
  };

  // Rebuild the checkbox rows for a fresh option set, checking those in
  // `selected`. Reused by the initial render and by every refilter.
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
        el('label', 'modal__multiselect-option', check, el('span', '', option.label)),
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
    // A refilter keeps whatever is currently checked, even if it drops out of
    // the new option set, so a valid pick isn't silently lost mid-edit.
    setOptions: (options, newMax) => {
      if (newMax !== undefined) max = newMax;
      render(options, new Set(checks.filter((c) => c.checked).map((c) => c.value)));
    },
  };
}

/**
 * A pill list with an inline text entry: Enter finalizes the typed text as a
 * pill, the x removes one, Backspace in an empty entry removes the last. The
 * value is the comma-joined pills plus any un-finalized text, so nothing typed
 * is lost on submit.
 * @param {{ value?: string }} spec
 * @returns {CompositeField}
 */
export function buildTagsField(spec) {
  const element = el('div', 'field modal__tags');

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
      event.preventDefault(); // finalize the pill, don't submit the dialog
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
 * An assignment grid: each row (e.g. an ability) holds at most one of the option
 * values (e.g. the standard array), and every value is held by at most one row.
 * Clicking assigns, clicking the held pill un-assigns, and clicking a pill
 * another row holds moves it here. The value is the comma-joined `row:value`
 * pairs of the assigned rows.
 * @param {{ options?: FieldOption[], rows?: { value: string, label: string }[], value?: string }} spec
 * @returns {CompositeField}
 */
export function buildPillGrid(spec) {
  const element = el('div', 'modal__pillgrid');

  let assigned = parseAssignments(spec.value ?? '');

  const render = () => {
    element.textContent = '';
    for (const row of spec.rows ?? []) {
      const rowEl = el(
        'div',
        'modal__pillgrid-row',
        el('span', 'modal__pillgrid-label', row.label),
      );
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
 * A distribution grid: one number input per row, and a live line saying how many
 * of `total` are still unassigned. The form will not submit until they sum to
 * exactly `total`, enforced through the first input's own validity so the
 * browser reports it the way it reports any other invalid field. The value is
 * the comma-joined `row:count` pairs, zeroed rows left out.
 *
 * `setTotal` restates how many there are to distribute, for a total another
 * field decides (the cast dialog's slot level, which sets how many projectiles a
 * spell fires). Raising it leaves the rows alone and asks for the difference;
 * lowering it trims from the last rows down, so what the GM assigned first
 * survives.
 * @param {{
 *   rows?: FieldOption[],
 *   total?: number,
 *   value?: string,
 *   unit?: string,
 * }} spec
 * @returns {CompositeField}
 */
export function buildAllocation(spec) {
  const element = el('div', 'modal__allocation');
  // The rows scroll and the remaining line does not, so a long target list can
  // never push the one piece of feedback that says why Cast is refused out of
  // sight.
  const box = el('div', 'field modal__allocation-rows');
  const rows = spec.rows ?? [];
  let total = Math.max(0, Math.floor(spec.total ?? 0));
  const unit = spec.unit ?? 'left';
  const remaining = el('p', 'modal__allocation-remaining');
  remaining.setAttribute('aria-live', 'polite');

  /** @type {HTMLInputElement[]} */
  const inputs = rows.map((row) => {
    const input = el('input', 'field modal__allocation-input');
    input.type = 'number';
    input.min = '0';
    input.max = String(total);
    input.value = '0';
    // The row's name sits in a sibling span rather than a <label>, since this
    // whole field is already mounted inside the dialog's field label.
    input.setAttribute('aria-label', row.label);
    box.appendChild(
      el('div', 'modal__allocation-row', el('span', 'modal__allocation-name', row.label), input),
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
 * Assign `value` to `row`, returning the new assignment map. Clicking the pill
 * the row already holds clears it. Clicking a pill another row holds swaps the
 * two rows' values, so a GM re-assigning a score never has to un-assign first,
 * and the row that loses it takes this row's old value rather than emptying.
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
 * Read the `row:value` pair list a pill grid stores its state as.
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
 * The inverse of `parseAssignments`.
 * @param {Record<string, string>} assigned
 * @returns {string}
 */
export function formatAssignments(assigned) {
  return Object.entries(assigned)
    .map(([row, held]) => `${row}:${held}`)
    .join(',');
}

/**
 * The comma-joined-list convention these fields share: absent is empty, and an
 * empty segment is dropped rather than becoming a blank entry.
 * @param {string | undefined} value
 * @returns {string[]}
 */
function splitList(value) {
  return value === undefined ? [] : String(value).split(',').filter(Boolean);
}

/**
 * The same list, trimmed, for the tag entry: a GM typing "elvish, dwarvish"
 * into one paste should not get a pill with a leading space.
 * @param {string | undefined} value
 * @returns {string[]}
 */
function splitTrimmedList(value) {
  return splitList(value)
    .map((entry) => entry.trim())
    .filter(Boolean);
}
