/**
 * The field descriptions that `promptModal` builds a form dialog from, and
 * the handle it hands to an `onChange` callback.
 *
 * This file uses one interface per field kind, instead of one wide shape.
 * `rows` only means something to a pill grid. `emptyText` only means
 * something to a multiselect. A single union member that lists every
 * property lets a caller write `emptyText` on a number field with no
 * complaint. Discriminating on `type` also tells a reader which properties
 * a kind actually reads. The previous flat shape did not.
 */

/** One choice in a select, multiselect, or pill grid. */
export interface FieldOption {
  value: string;
  label: string;
  /** Select only: shown, but not selectable, for example a class the
   * character cannot take. */
  disabled?: boolean;
}

/** What every field carries: its key in the submitted record, and its caption. */
interface FieldBase {
  name: string;
  label: string;
  /** In a `wide` dialog, span both columns instead of taking one. */
  full?: boolean;
  /** Start hidden. `onChange`'s `setHidden` reveals it. */
  hidden?: boolean;
  /** Tuck the field behind the dialog's collapsed disclosure, for
   * situational inputs that a plain submit must not have to read past. */
  advanced?: boolean;
  disabled?: boolean;
}

/** A single-line text or number input. `min` and `max` bound a number field. */
export interface TextModalField extends FieldBase {
  type?: 'text' | 'number';
  value?: string | number;
  min?: number;
  max?: number;
}

/**
 * A single on/off box. Its value is `'1'` when checked and `''` when not, so
 * a caller reads it as `values.name === '1'` and the record stays
 * all-strings, like every other field.
 */
export interface CheckboxModalField extends FieldBase {
  type: 'checkbox';
  value?: boolean;
}

export interface SelectModalField extends FieldBase {
  type: 'select';
  value?: string | number;
  options: FieldOption[];
}

/** An image picker. Its value is the picked file as a `data:` URL. */
export interface FileModalField extends FieldBase {
  type: 'file';
  value?: string;
}

/**
 * A scrollable checkbox group. Its value is the comma-joined checked
 * values, which is why option values must be slugs. `max` caps the picks.
 * `fixedHeight` keeps a refilter from reflowing the dialog. `emptyText`
 * fills the box while there are no options.
 */
export interface MultiselectModalField extends FieldBase {
  type: 'multiselect';
  value?: string;
  options: FieldOption[];
  max?: number;
  emptyText?: string;
  fixedHeight?: boolean;
}

/** A pill list with an inline entry. Its value is the comma-joined pills. */
export interface TagsModalField extends FieldBase {
  type: 'tags';
  value?: string;
}

/**
 * An assignment grid: each row holds at most one option value, each value is
 * held by at most one row. Its value is the comma-joined `row:value` pairs.
 */
export interface PillGridModalField extends FieldBase {
  type: 'pillgrid';
  value?: string;
  options: FieldOption[];
  rows: { value: string; label: string }[];
}

/**
 * A distribution grid: one number input per row, which together must sum to
 * `total` before the form submits. Its value is the comma-joined
 * `row:count` pairs of the rows given a share. Zeroed rows are left out.
 */
export interface AllocationModalField extends FieldBase {
  type: 'allocation';
  total: number;
  rows: FieldOption[];
  value?: string;
  /** What the row counts are, for the remaining line, for example 'rays'. */
  unit?: string;
}

/**
 * An in-form action button, for example "Reroll scores". Clicking it fires
 * the form's `onChange` under this field's name. It contributes no value to
 * the record.
 */
export interface ButtonModalField extends FieldBase {
  type: 'button';
}

export type ModalField =
  | TextModalField
  | CheckboxModalField
  | SelectModalField
  | FileModalField
  | MultiselectModalField
  | TagsModalField
  | PillGridModalField
  | AllocationModalField
  | ButtonModalField;

/**
 * The live form handle that `onChange` reads and writes through, so one
 * field can drive another. For example, changing a tier restamps default
 * stats, and changing a class refilters the class-skill picker. `get` is
 * deliberately synchronous and string-valued.
 */
export interface ModalFormHandle {
  get(name: string): string;
  set(name: string, value: string | number): void;
  setOptions(name: string, options: FieldOption[], max?: number): void;
  setDisabled(name: string, disabled: boolean): void;
  setLabel(name: string, text: string): void;
  setRange(name: string, min?: number, max?: number): void;
  setHidden(name: string, hidden: boolean): void;
  /** Allocation fields only: restate how many there are to distribute. */
  setTotal(name: string, total: number): void;
}

/**
 * What each composite field builder hands to `promptModal`: the element to
 * mount, the reader for the submitted record, and the writer that
 * `onChange`'s `set` uses. A multiselect adds `setOptions` for a live
 * refilter.
 */
export interface CompositeField {
  element: HTMLElement;
  get(): string;
  set(value: string): void;
  setOptions?(options: FieldOption[], max?: number): void;
  setTotal?(total: number): void;
}
