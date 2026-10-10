/**
 * The Actions part of the creature dialog. The dialog keeps the action list in
 * a hidden field and shows a summary line. The Edit actions button closes the
 * dialog for a moment and opens a list dialog, where the GM adds, edits, or
 * removes one action at a time. Each action has a name, a save ability, a DC,
 * one damage term, a half-on-save box, and a recharge face.
 */

import { promptModal } from '../ui/Modal.js';
import { ABILITY_NAMES } from '../data/abilities.js';
import { DAMAGE_TYPES, DIE_SIZES } from '../entities/DamageParts.js';
import { actionList, actionSummary, RECHARGE_FACES } from '../entities/CreatureActions.js';
import { slugify, capitalize } from '../util/text.js';

/** @typedef {import('../types/creature.js').CreatureAction} CreatureAction */
/** @typedef {import('../types/modal.js').ModalField} ModalField */
/** @typedef {import('../types/modal.js').ModalFormHandle} ModalFormHandle */

/** The hidden field that keeps the list, as JSON written by this module. */
const LIST_FIELD = 'actionsJson';
/** The summary line above the button. */
const NOTE_FIELD = 'actionsNote';
/** The button that opens the list dialog. */
const EDIT_FIELD = 'editActions';
/** The value of the list dialog's "Add an action" choice. */
const NEW_ACTION = '__new';

/**
 * The summary line for a list: one action per sentence, or "No actions.".
 * @param {CreatureAction[]} actions
 * @returns {string}
 */
export function actionsNote(actions) {
  if (actions.length === 0) return 'No actions.';
  return actions.map((a) => `${a.name}: ${actionSummary(a)}.`).join(' ');
}

/**
 * The dialog fields for a creature's actions, under their own Actions heading.
 * @param {CreatureAction[] | undefined} actions
 * @returns {ModalField[]}
 */
export function actionFormFields(actions) {
  const list = actionList(actions);
  return [
    { name: NOTE_FIELD, label: actionsNote(list), type: 'note', full: true, section: 'Actions' },
    { name: LIST_FIELD, label: 'Actions', value: JSON.stringify(list), hidden: true },
    { name: EDIT_FIELD, label: 'Edit actions', type: 'button' },
  ];
}

/**
 * The action list a submitted dialog names. A missing or unreadable field
 * reads as no actions.
 * @param {Record<string, string>} values
 * @returns {CreatureAction[]}
 */
export function readActions(values) {
  try {
    return actionList(JSON.parse(values[LIST_FIELD] ?? '[]'));
  } catch {
    return [];
  }
}

/**
 * The change handler for the Edit actions button. It returns true when it
 * handled the change.
 * @param {string} name
 * @param {ModalFormHandle} form
 * @param {(actions: CreatureAction[]) => Promise<CreatureAction[]>} [edit]
 * @returns {boolean}
 */
export function actionsChange(name, form, edit = editActionList) {
  if (name !== EDIT_FIELD || !form.suspend) return false;
  void form.suspend(EDIT_FIELD, async () => {
    const next = await edit(readActions({ [LIST_FIELD]: form.get(LIST_FIELD) }));
    form.set(LIST_FIELD, JSON.stringify(next));
    form.setLabel(NOTE_FIELD, actionsNote(next));
  });
  return true;
}

/**
 * The fields of the dialog for one action. A blank action starts as a DC 12
 * DEX save for 2d6 fire, half on save, with no recharge.
 * @param {CreatureAction | null} action
 * @returns {ModalField[]}
 */
export function actionEditorFields(action) {
  const part = action?.damage[0];
  return [
    { name: 'name', label: 'Name (required)', value: action?.name ?? '', full: true },
    {
      name: 'saveAbility',
      label: 'Saving throw',
      type: 'select',
      value: action?.saveAbility ?? 'DEX',
      options: Object.entries(ABILITY_NAMES).map(([value, label]) => ({ value, label })),
    },
    { name: 'dc', label: 'DC', type: 'number', value: action?.dc ?? 12, min: 1, max: 30 },
    {
      name: 'count',
      label: 'Damage dice',
      type: 'number',
      value: part?.count ?? 2,
      min: 0,
      max: 40,
    },
    {
      name: 'sides',
      label: 'Die',
      type: 'select',
      value: part?.sides ?? 6,
      options: DIE_SIZES.map((n) => ({ value: String(n), label: `d${n}` })),
    },
    {
      name: 'damageType',
      label: 'Damage type',
      type: 'select',
      value: part?.damageType ?? 'fire',
      options: DAMAGE_TYPES.map((t) => ({ value: t, label: capitalize(t) })),
    },
    {
      name: 'recharge',
      label: 'Recharge',
      type: 'select',
      value: action?.recharge ?? '',
      options: [
        { value: '', label: 'None' },
        ...RECHARGE_FACES.map((n) => ({ value: String(n), label: n === 6 ? '6' : `${n}-6` })),
      ],
    },
    {
      name: 'halfOnSave',
      label: 'Half damage on a save',
      type: 'checkbox',
      value: action?.halfOnSave ?? true,
    },
    ...(action
      ? [{ name: 'remove', label: 'Remove this action', type: 'checkbox', value: false }]
      : []),
  ].map((f) => /** @type {ModalField} */ (f));
}

/**
 * The action list after one submitted action dialog. A blank name or a
 * ticked Remove box drops the action. A new action takes an id from its name
 * that no other action has.
 * @param {CreatureAction[]} actions
 * @param {CreatureAction | null} editing the action the dialog opened on
 * @param {Record<string, string>} values
 * @returns {CreatureAction[]}
 */
export function applyActionValues(actions, editing, values) {
  const others = actions.filter((a) => a !== editing);
  const name = (values.name ?? '').trim();
  if (!name || values.remove === '1') return others;
  const count = Number(values.count) || 0;
  const id =
    editing?.id ?? uniqueActionId(slugify(name) || 'action', new Set(others.map((a) => a.id)));
  const [next] = actionList([
    {
      id,
      name,
      saveAbility: values.saveAbility,
      dc: values.dc,
      damage:
        count > 0 ? [{ count, sides: Number(values.sides), damageType: values.damageType }] : [],
      halfOnSave: values.halfOnSave === '1',
      recharge: Number(values.recharge) || undefined,
      ...(editing?.spent ? { spent: true } : {}),
    },
  ]);
  return editing ? actions.map((a) => (a === editing ? next : a)) : [...actions, next];
}

/**
 * The first id from `base` that `taken` does not have.
 * @param {string} base
 * @param {Set<string>} taken
 * @returns {string}
 */
function uniqueActionId(base, taken) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * The list dialog. The GM picks an action to edit, or Add an action, and the
 * action dialog opens. Done closes the list with the changes kept.
 * @param {CreatureAction[]} start
 * @returns {Promise<CreatureAction[]>}
 */
async function editActionList(start) {
  let actions = start;
  for (;;) {
    const picked = await promptModal(
      'Actions',
      [
        {
          name: 'pick',
          label: 'Action',
          type: 'select',
          value: NEW_ACTION,
          options: [
            ...actions.map((a) => ({ value: a.id, label: `${a.name} (${actionSummary(a)})` })),
            { value: NEW_ACTION, label: 'Add an action' },
          ],
        },
      ],
      { submitLabel: 'Open', cancelLabel: 'Done' },
    );
    if (!picked) return actions;
    const editing = actions.find((a) => a.id === picked.pick) ?? null;
    const values = await promptModal(
      editing ? `Edit ${editing.name}` : 'New action',
      actionEditorFields(editing),
      { submitLabel: editing ? 'Save' : 'Add', wide: true },
    );
    if (values) actions = applyActionValues(actions, editing, values);
  }
}
