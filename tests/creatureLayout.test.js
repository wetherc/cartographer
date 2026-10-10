import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  arrangeFields,
  DEPENDS_ON,
  FIELD_SECTIONS,
  parentSet,
  ROW_BREAKS,
} from '../src/view/forms/creatureLayout.js';
import { creatureFields } from '../src/view/forms/creatureFields.js';
import { gearOptions } from '../src/view/forms/gearFields.js';

/** @typedef {import('../src/types/modal.js').ModalField} ModalField */

/** @param {string} name @returns {ModalField} */
const field = (name) => ({ name, label: name, type: 'text', value: '' });

test('every field the layout names exists in the creature form', () => {
  const seed = { disposition: 'hostile', level: 1, class: 'wizard' };
  const names = new Set(creatureFields(seed, gearOptions(null)).map((f) => f.name));
  const named = [
    ...FIELD_SECTIONS.flatMap(([, list]) => list),
    ...ROW_BREAKS,
    ...Object.keys(DEPENDS_ON),
    ...Object.values(DEPENDS_ON),
  ];
  for (const name of named) assert.ok(names.has(name), `missing field ${name}`);
});

test('arrangeFields orders by section, marks rows, and puts unplaced and caster fields last', () => {
  const out = arrangeFields(
    [field('extra'), field('resist'), field('weapon'), field('name')],
    [field('casterClass'), field('casterLevel')],
  );
  assert.deepEqual(
    out.map((f) => f.name),
    ['name', 'weapon', 'resist', 'extra', 'casterClass', 'casterLevel'],
  );
  const [name, weapon, resist, extra, casterClass, casterLevel] = out;
  assert.equal(name.section, 'Basics');
  assert.equal(weapon.section, 'Combat');
  assert.equal(weapon.newRow, true);
  assert.equal(resist.advanced, true);
  assert.equal(extra.section, undefined);
  assert.equal(casterClass.section, 'Spellcasting');
  assert.equal(casterLevel.section, undefined);
  assert.equal(casterLevel.enabledWhen?.field, 'casterClass');
  assert.equal(casterLevel.enabledWhen?.test('wizard'), true);
  assert.equal(casterClass.enabledWhen, undefined);
});

test('parentSet counts Multiattack above 1, Surprise Attack dice above 0, and any other text', () => {
  assert.equal(parentSet('multiattack', '1'), false);
  assert.equal(parentSet('multiattack', '2'), true);
  assert.equal(parentSet('surpriseCount', '0'), false);
  assert.equal(parentSet('surpriseCount', '1'), true);
  assert.equal(parentSet('hitSaveAbility', ' '), false);
  assert.equal(parentSet('hitSaveAbility', undefined), false);
  assert.equal(parentSet('hitSaveAbility', 'con'), true);
});
