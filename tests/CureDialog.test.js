import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cureDialog, cureLabel } from '../src/view/CureDialog.js';
import { EXHAUSTION } from '../src/entities/HealCure.js';

test('cureLabel names exhaustion as one level and leaves a condition name as it is', () => {
  assert.equal(cureLabel(EXHAUSTION), 'one level of exhaustion');
  assert.equal(cureLabel('Poisoned'), 'Poisoned');
});

test('cureDialog asks for one of the choices, with the first picked', () => {
  const dialog = cureDialog('Lesser Restoration', 'Wren', ['Poisoned', EXHAUSTION]);
  assert.deepEqual(dialog, {
    title: 'Lesser Restoration on Wren',
    fields: [
      {
        name: 'cure',
        label: 'Condition to end',
        type: 'select',
        full: true,
        value: 'Poisoned',
        options: [
          { value: 'Poisoned', label: 'Poisoned' },
          { value: EXHAUSTION, label: 'one level of exhaustion' },
        ],
      },
    ],
    options: { submitLabel: 'End it' },
  });
});
