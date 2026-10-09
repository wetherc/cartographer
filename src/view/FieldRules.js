/**
 * The `enabledWhen` rule of a dialog field. A field with the rule is enabled
 * only while another field of the same form passes a test, for example a
 * Key item field that means nothing until Lock names a lock. `promptModal`
 * and `buildSpecForm` apply the rule when the form opens and again each time
 * the named field changes, before they call the form's own `onChange`. So an
 * `onChange` can still override the rule for one edit.
 */

/** @typedef {import('../types/modal.js').ModalField} ModalField */

/**
 * The default test of a rule: the value is not blank.
 * @param {string} value
 */
export function filled(value) {
  return String(value ?? '').trim() !== '';
}

/**
 * Whether a field with an `enabledWhen` rule is enabled, given a reader of
 * the form's current values. Null for a field with no rule.
 * @param {ModalField} field
 * @param {(name: string) => string} get
 * @returns {boolean | null}
 */
export function ruleEnables(field, get) {
  const rule = field.enabledWhen;
  if (!rule) return null;
  return (rule.test ?? filled)(get(rule.field));
}

/**
 * Set the disabled state of every ruled field whose rule reads `changed`, or
 * of every ruled field when `changed` is null (the form just opened).
 * @param {ModalField[]} fields
 * @param {string | null} changed
 * @param {(name: string) => string} get
 * @param {(name: string, disabled: boolean) => void} setDisabled
 */
export function applyFieldRules(fields, changed, get, setDisabled) {
  for (const field of fields) {
    if (!field.enabledWhen) continue;
    if (changed !== null && field.enabledWhen.field !== changed) continue;
    setDisabled(field.name, !ruleEnables(field, get));
  }
}

/**
 * Whether any field of the list has an `enabledWhen` rule, so the form knows
 * to listen for changes even with no `onChange` of its own.
 * @param {ModalField[]} fields
 */
export function hasFieldRules(fields) {
  return fields.some((field) => field.enabledWhen !== undefined);
}
