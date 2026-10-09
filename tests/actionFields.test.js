import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actionEditorFields,
  actionFormFields,
  actionsChange,
  actionsNote,
  applyActionValues,
  readActions,
} from '../src/app/actionFields.js';

const breath = {
  id: 'cold-breath',
  name: 'Cold Breath',
  saveAbility: 'DEX',
  dc: 12,
  damage: [{ count: 4, sides: 8, damageType: 'cold' }],
  halfOnSave: true,
  recharge: 5,
};

const form = (values = {}) => ({
  name: 'Cold Breath',
  saveAbility: 'CON',
  dc: '14',
  count: '3',
  sides: '10',
  damageType: 'cold',
  recharge: '6',
  halfOnSave: '1',
  ...values,
});

test('the dialog fields keep the list and show a summary', () => {
  const [note, list, button] = actionFormFields([breath]);
  assert.equal(note.type, 'note');
  assert.equal(note.section, 'Actions');
  assert.match(note.label, /^Cold Breath: DC 12 DEX save, 4d8 cold/);
  assert.deepEqual(readActions({ [list.name]: /** @type {any} */ (list).value }), [breath]);
  assert.equal(button.type, 'button');
  assert.equal(actionFormFields(undefined)[0].label, 'No actions.');
  assert.equal(actionsNote([]), 'No actions.');
});

test('readActions reads a missing or broken field as no actions', () => {
  assert.deepEqual(readActions({}), []);
  assert.deepEqual(readActions({ actionsJson: '{oops' }), []);
});

test('the action editor starts a blank action with defaults', () => {
  const fields = actionEditorFields(null);
  const value = (name) => /** @type {any} */ (fields.find((f) => f.name === name)).value;
  assert.equal(value('saveAbility'), 'DEX');
  assert.equal(value('dc'), 12);
  assert.equal(value('halfOnSave'), true);
  assert.equal(
    fields.some((f) => f.name === 'remove'),
    false,
  );
  const editing = actionEditorFields(breath);
  assert.equal(editing.find((f) => f.name === 'remove')?.type, 'checkbox');
  assert.equal(/** @type {any} */ (editing.find((f) => f.name === 'sides')).value, 8);
  assert.equal(/** @type {any} */ (editing.find((f) => f.name === 'recharge')).value, 5);
});

test('applyActionValues adds, edits, and removes actions', () => {
  const added = applyActionValues([breath], null, form());
  assert.equal(added.length, 2);
  assert.deepEqual(added[1], {
    id: 'cold-breath-2',
    name: 'Cold Breath',
    saveAbility: 'CON',
    dc: 14,
    damage: [{ count: 3, sides: 10, damageType: 'cold' }],
    halfOnSave: true,
    recharge: 6,
  });
  const spent = { ...breath, spent: true };
  const edited = applyActionValues(
    [spent],
    spent,
    form({ recharge: '', count: '0', halfOnSave: '' }),
  );
  assert.deepEqual(edited, [
    {
      id: 'cold-breath',
      name: 'Cold Breath',
      saveAbility: 'CON',
      dc: 14,
      damage: [],
      halfOnSave: false,
    },
  ]);
  assert.deepEqual(applyActionValues([breath], breath, form({ remove: '1' })), []);
  assert.deepEqual(applyActionValues([breath], null, form({ name: '  ' })), [breath]);
  assert.equal(applyActionValues([], null, form({ name: '!!' }))[0].id, 'action');
  const kept = applyActionValues([spent], spent, form({ recharge: '5' }));
  assert.equal(kept[0].spent, true, 'an edit keeps a spent recharge spent');
});

test('the Edit actions button writes the edited list back to the form', async () => {
  /** @type {Record<string, string>} */
  const values = { actionsJson: JSON.stringify([breath]) };
  /** @type {Record<string, string>} */
  const labels = {};
  let suspended = Promise.resolve();
  const handle = /** @type {any} */ ({
    get: (name) => values[name],
    set: (name, value) => {
      values[name] = String(value);
    },
    setLabel: (name, text) => {
      labels[name] = text;
    },
    suspend: (_name, work) => (suspended = work()),
  });
  assert.equal(actionsChange('name', handle), false);
  assert.equal(
    actionsChange('editActions', handle, async (list) => {
      assert.deepEqual(list, [breath]);
      return [];
    }),
    true,
  );
  await suspended;
  assert.equal(values.actionsJson, '[]');
  assert.equal(labels.actionsNote, 'No actions.');
  assert.equal(actionsChange('editActions', { ...handle, suspend: undefined }), false);
});
