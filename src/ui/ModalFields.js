/**
 * The three composite fields a form dialog can hold: the checkbox group, the
 * tag entry, and the assignment pill grid. Each owns its own working state and
 * a `render()`, which is what made them the bulk of `Modal.js`'s field switch;
 * split out here they follow the same `{ element, get, set }` contract as the
 * item form's list editors, so `Modal.js` treats a composite field as one value
 * and the pickers are reusable outside a dialog.
 *
 * Every builder reports edits by letting an `input` event reach `element`, which
 * is what a dialog's `onChange` listens on.
 */

import { removableChip } from './buttons.js';

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
  const element = document.createElement('div');
  element.className =
    spec.className ??
    (spec.fixedHeight
      ? 'field modal__multiselect modal__multiselect--fixed'
      : 'field modal__multiselect');

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
    if (!options.length && spec.emptyText) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = spec.emptyText;
      element.appendChild(empty);
    }
    checks = options.map((option) => {
      const row = document.createElement('label');
      row.className = 'modal__multiselect-option';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.value = option.value;
      check.checked = selected.has(option.value);
      const text = document.createElement('span');
      text.textContent = option.label;
      row.append(check, text);
      element.appendChild(row);
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
  const element = document.createElement('div');
  element.className = 'field modal__tags';

  /** @type {string[]} */
  let tags = splitTrimmedList(spec.value);
  const entry = document.createElement('input');
  entry.type = 'text';
  entry.className = 'modal__tags-input';

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
  const element = document.createElement('div');
  element.className = 'modal__pillgrid';

  let assigned = parseAssignments(spec.value ?? '');

  const render = () => {
    element.textContent = '';
    for (const row of spec.rows ?? []) {
      const rowEl = document.createElement('div');
      rowEl.className = 'modal__pillgrid-row';
      const rowLabel = document.createElement('span');
      rowLabel.className = 'modal__pillgrid-label';
      rowLabel.textContent = row.label;
      rowEl.appendChild(rowLabel);
      for (const option of spec.options ?? []) {
        const held = assigned[row.value] === option.value;
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = held ? 'modal__pill modal__pill--selected' : 'modal__pill';
        pill.textContent = option.label;
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
