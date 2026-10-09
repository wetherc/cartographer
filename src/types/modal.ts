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
  /** Select only: the label of the `<optgroup>` the option sits in. */
  group?: string;
}

/** What every field carries: its key in the submitted record, and its caption. */
interface FieldBase {
  name: string;
  label: string;
  /** In a `wide` dialog, span both columns instead of taking one. */
  full?: boolean;
  /** Put a section heading with this text before the field. A long form
   * (the creature dialog) groups its fields under these headings. */
  section?: string;
  /** Begin a row rather than pairing with the field before it. This keeps a
   * pair that belongs together, for example weapon and armor, on one row when
   * an odd number of fields comes before it. */
  newRow?: boolean;
  /** Start hidden. `onChange`'s `setHidden` reveals it. */
  hidden?: boolean;
  /** Tuck the field behind the dialog's collapsed disclosure, for
   * situational inputs that a plain submit must not have to read past. */
  advanced?: boolean;
  disabled?: boolean;
  /** Enable the field only while the named field passes `test`, or, with no
   * `test`, while that field is not blank. The form applies the rule when it
   * opens and each time the named field changes (see `view/FieldRules.js`). */
  enabledWhen?: { field: string; test?: (value: string) => boolean };
}

/**
 * A single-line text or number input. `min` and `max` bound a number field.
 * A `search` field narrows another field, and Enter in it does not submit.
 */
export interface TextModalField extends FieldBase {
  type?: 'text' | 'number' | 'search';
  value?: string | number;
  min?: number;
  max?: number;
  /** Placeholder text for an empty field, for example 'Enemy name'. */
  placeholder?: string;
  /** Text field only: values the browser offers as the GM types, through a
   * `<datalist>`. The field still accepts any text. */
  suggestions?: string[];
}

/** A multi-line text input, for a field whose value is prose. */
export interface TextareaModalField extends FieldBase {
  type: 'textarea';
  value?: string;
  rows?: number;
  placeholder?: string;
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
 * `fixedHeight` keeps a refilter from reflowing the dialog. `columns` lays a
 * short, fixed list of options out in columns with no scroll. `emptyText`
 * fills the box while there are no options.
 */
export interface MultiselectModalField extends FieldBase {
  type: 'multiselect';
  value?: string;
  options: FieldOption[];
  max?: number;
  emptyText?: string;
  fixedHeight?: boolean;
  columns?: boolean;
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

/**
 * A line of text with no input, for example a warning that `onChange`
 * rewrites through `setLabel`. It contributes an empty value to the record.
 */
export interface NoteModalField extends FieldBase {
  type: 'note';
}

export type ModalField =
  | TextModalField
  | TextareaModalField
  | CheckboxModalField
  | SelectModalField
  | FileModalField
  | MultiselectModalField
  | TagsModalField
  | PillGridModalField
  | AllocationModalField
  | ButtonModalField
  | NoteModalField;

/**
 * The live form handle that `onChange` reads and writes through, so one
 * field can drive another. For example, changing a tier restamps default
 * stats, and changing a class refilters the class-skill picker. `get` is
 * deliberately synchronous and string-valued.
 */
export interface ModalFormHandle {
  get(name: string): string;
  set(name: string, value: string | number): void;
  /** Rebuild the options of a multiselect or a plain select. */
  setOptions(name: string, options: FieldOption[], max?: number): void;
  setDisabled(name: string, disabled: boolean): void;
  setLabel(name: string, text: string): void;
  setRange(name: string, min?: number, max?: number): void;
  setHidden(name: string, hidden: boolean): void;
  /** Allocation fields only: restate how many there are to distribute. */
  setTotal(name: string, total: number): void;
  /**
   * Close the dialog while `work` runs, so the page behind it takes clicks,
   * then open it again with every value kept and focus on the field `name`.
   * Only `promptModal` forms have it.
   */
  suspend?(name: string, work: () => Promise<void>): Promise<void>;
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
