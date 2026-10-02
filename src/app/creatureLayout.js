/**
 * The layout of the creature form: the section headings and their order,
 * the row breaks inside a section, and the fields that stay disabled until
 * another field has a value. `creatureFields` builds the fields, and
 * `arrangeFields` puts them in this order.
 */

import { STAT_KEYS } from '../entities/Modifiers.js';

/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/modal.js').ModalFormHandle} ModalFormHandle */

/**
 * Put the blueprint fields under their section headings, then the caster
 * fields under "Spellcasting", and disable each dependent field whose
 * parent starts blank.
 * @param {ModalField[]} fields the blueprint fields, in any order
 * @param {ModalField[]} casters the caster fields
 * @returns {ModalField[]}
 */
export function arrangeFields(fields, casters) {
  const byName = new Map(fields.map((field) => [field.name, field]));
  const placed = new Set(FIELD_SECTIONS.flatMap(([, names]) => names));
  const values = new Map(
    [...fields, ...casters].map((field) => [
      field.name,
      String(('value' in field ? field.value : '') ?? ''),
    ]),
  );
  return [
    ...FIELD_SECTIONS.flatMap(([section, names, advanced]) =>
      names
        .map((name) => byName.get(name))
        .filter((field) => field !== undefined)
        .map((field, i) => ({
          ...field,
          ...(i === 0 ? { section, newRow: true } : {}),
          ...(ROW_BREAKS.has(field.name) ? { newRow: true } : {}),
          ...(advanced ? { advanced: true } : {}),
        })),
    ),
    // A field that no section names still shows, at the end of the list.
    ...fields.filter((field) => !placed.has(field.name)),
    ...casters.map((field, i) => (i === 0 ? { ...field, section: 'Spellcasting' } : field)),
  ].map((field) => {
    const parent = DEPENDS_ON[field.name];
    return parent && !parentSet(parent, values.get(parent)) ? { ...field, disabled: true } : field;
  });
}

/**
 * The fields that mean nothing until another field has a value, keyed by
 * the dependent field and naming its parent. A dependent field stays
 * disabled while its parent is blank (or, for Multiattack, 1 or less), so
 * the GM does not set a condition for a save that the weapon never forces.
 * @type {Record<string, string>}
 */
export const DEPENDS_ON = {
  hitSaveDC: 'hitSaveAbility',
  hitSaveCondition: 'hitSaveAbility',
  surpriseDie: 'surpriseCount',
  multiattackDisadvantage: 'multiattack',
  casterLevel: 'casterClass',
};

/**
 * Whether a parent field's value turns on the fields that depend on it. A
 * count (Surprise Attack dice, Multiattack) counts only above its no-op
 * value.
 * @param {string} parent
 * @param {string | undefined} value
 */
export function parentSet(parent, value) {
  const text = String(value ?? '').trim();
  if (parent === 'multiattack') return Number(text) > 1;
  if (parent === 'surpriseCount') return Number(text) > 0;
  return text !== '';
}

/**
 * Enable or disable the fields that depend on `name`, from its value in the
 * form. Returns nothing, and does nothing for a field that no other field
 * depends on.
 * @param {string} name
 * @param {ModalFormHandle} form
 */
export function syncDependents(name, form) {
  for (const [child, parent] of Object.entries(DEPENDS_ON)) {
    if (parent === name) form.setDisabled(child, !parentSet(parent, form.get(name)));
  }
}

/**
 * The sections of the creature form, in order: a heading, the field names
 * under it, and whether the fields sit in the dialog's collapsed disclosure.
 * The scores and AC come right after the basics, because the GM sets them
 * for nearly every creature, and the damage and condition defenses are
 * collapsed, because most creatures have none.
 * @type {[string, string[], boolean][]}
 */
const FIELD_SECTIONS = [
  [
    'Basics',
    ['name', 'role', 'disposition', 'creatureType', 'maxHP', 'level', 'tier', 'cr', 'notes'],
    false,
  ],
  [
    'Combat',
    [
      ...STAT_KEYS.map((key) => `stat-${key}`),
      'weapon',
      'armor',
      'multiattack',
      'multiattackDisadvantage',
      'hitSaveAbility',
      'hitSaveDC',
      'hitSaveCondition',
      'surpriseCount',
      'surpriseDie',
      'legendaryActions',
      'legendaryResistance',
      'packTactics',
      'redirectAttack',
      'turnResistance',
    ],
    false,
  ],
  ['Proficiencies', ['saves', 'skills'], false],
  ['Defenses', ['resist', 'vulnerable', 'immune', 'conditionImmunities'], true],
];

/** Fields that begin a row inside their section, so each pair stays together. */
const ROW_BREAKS = new Set([
  'weapon',
  'hitSaveAbility',
  'surpriseCount',
  'legendaryActions',
  'packTactics',
]);
