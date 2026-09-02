/**
 * Form controls. Everything here comes from `src/ui/formFields.js`, which
 * backs both the Library rail's inline forms and the plain fields of a
 * `promptModal`, so one field behaves the same on both surfaces.
 */

import {
  buildInlineForm,
  checkbox,
  fieldRow,
  labeled,
  numberField,
  select,
  textField,
  textareaField,
} from '../../../src/ui/formFields.js';
import { notify } from '../runtime.js';

/** @type {import('../runtime.js').Section} */
export const fieldsSection = {
  id: 'fields',
  title: 'Form fields',
  blurb:
    'Every input, select, and textarea in the app carries the field class and comes from one of ' +
    'these builders. labeled puts the control inside its own label element, so there is no id to keep in sync.',
  stories: [
    {
      title: 'textField',
      notes:
        "The search type gets the browser's clear affordance, which is what the Library rail's filter uses.",
      classes: '.field',
      render: () => [
        textField('Goblin', { placeholder: 'Name', ariaLabel: 'Name' }),
        textField('', { type: 'search', placeholder: 'Filter by name...', ariaLabel: 'Filter' }),
      ],
    },
    {
      title: 'numberField',
      notes:
        'min and max constrain the spinner, and a typed out-of-range number corrects to the nearer bound when the edit commits, not per keystroke.',
      classes: '.field',
      render: () => [
        numberField(7, { min: 0, max: 20, ariaLabel: 'Hit points' }),
        numberField('', { min: 1, placeholder: 'Optional', ariaLabel: 'Level' }),
      ],
    },
    {
      title: 'select',
      notes:
        'An option is a bare string, where the value is the label, or a { value, label } pair. A choice that shows but is unavailable carries disabled.',
      classes: '.field',
      render: () =>
        select(
          [
            { value: 'light', label: 'Light armor' },
            { value: 'medium', label: 'Medium armor' },
            { value: 'heavy', label: 'Heavy armor (not proficient)', disabled: true },
          ],
          'medium',
          { ariaLabel: 'Armor weight' },
        ),
    },
    {
      title: 'textareaField',
      notes: 'Three rows tall by default.',
      classes: '.field',
      stack: true,
      render: () =>
        textareaField('The gate stands open, and nothing has passed through it in a season.', {
          rows: 3,
          ariaLabel: 'Read-aloud text',
        }),
    },
    {
      title: 'labeled and fieldRow',
      notes:
        'A captioned wrapper and one horizontal group. Type-specific fields toggle in and out per row, so an appearing control extends its own line.',
      classes: '.form__label .form__row',
      stack: true,
      render: () =>
        fieldRow(
          labeled('Name', textField('Iron shortsword')),
          labeled('Damage', textField('1d6')),
          labeled('Weight', numberField(2, { min: 0 })),
        ),
    },
    {
      title: 'checkbox',
      notes:
        'The box sits before its caption, so it reads as the same weight as a captioned field.',
      classes: '.field-check',
      render: () => checkbox('Counts as a spellcasting focus', true).label,
    },
    {
      title: 'buildInlineForm',
      notes:
        'The envelope all four Library forms share: the wide name field first, the rows in order, then Cancel left of the primary submit. A blank name is refused before assemble runs.',
      classes: '.form.u-col.u-g2 .form__wide',
      stack: true,
      render: () =>
        buildInlineForm({
          nameInput: textField('Iron shortsword', { placeholder: 'Name', ariaLabel: 'Name' }),
          rows: [
            fieldRow(
              labeled('Damage', textField('1d6')),
              labeled('Cost (gp)', numberField(10, { min: 0 })),
            ),
          ],
          assemble: () => ({ name: 'Iron shortsword' }),
          submitLabel: 'Save item',
          onSubmit: (fields) => notify(`Saved ${fields.name}`),
          onCancel: () => notify('Cancelled'),
        }),
    },
  ],
};
