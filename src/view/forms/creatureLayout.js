/**
 * The layout of the creature form: the section headings and their order,
 * the row breaks inside a section, and the fields that stay disabled until
 * another field has a value. `creatureFields` builds the fields, and
 * `arrangeFields` puts them in this order.
 */

import { STAT_KEYS } from '../../entities/Modifiers.js';

/** @typedef {import('../../types/modal.js').ModalField} ModalField */

/**
 * Put the blueprint fields under their section headings, then the caster
 * fields under "Spellcasting", and give each dependent field an
 * `enabledWhen` rule on its parent.
 * @param {ModalField[]} fields the blueprint fields, in any order
 * @param {ModalField[]} casters the caster fields
 * @returns {ModalField[]}
 */
export function arrangeFields(fields, casters) {
  const byName = new Map(fields.map((field) => [field.name, field]));
  const placed = new Set(FIELD_SECTIONS.flatMap(([, names]) => names));
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
    if (!parent) return field;
    return { ...field, enabledWhen: { field: parent, test: (value) => parentSet(parent, value) } };
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
 * The sections of the creature form, in order: a heading, the field names
 * under it, and whether the fields sit in the dialog's collapsed disclosure.
 * The scores and AC come right after the basics, because the GM sets them
 * for nearly every creature, and the damage and condition defenses are
 * collapsed, because most creatures have none.
 * @type {[string, string[], boolean][]}
 */
export const FIELD_SECTIONS = [
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
      'otherWeapons',
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
export const ROW_BREAKS = new Set([
  'weapon',
  'hitSaveAbility',
  'surpriseCount',
  'legendaryActions',
  'packTactics',
]);
