import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LEGENDARY,
  attackTraitFields,
  coerceLegendary,
} from '../src/entities/CreatureAttacks.js';
import { createCreature, editCreature, withDefaults } from '../src/entities/Creature.js';
import { fromTemplate, toTemplate } from '../src/entities/CreatureTemplate.js';
import { creatureFields } from '../src/view/forms/creatureFields.js';
import { readCreatureFields } from '../src/view/forms/creatureRead.js';
import { gearOptions } from '../src/view/forms/gearFields.js';
import { normalizeLibrary } from '../src/library/Library.js';
import { STAT_KEYS } from '../src/entities/Modifiers.js';

const HERE = { nodeId: 'n1', tileId: '0,0' };
const king = createCreature('king', 'King', {
  disposition: 'hostile',
  maxHP: 90,
  location: HERE,
  legendaryActions: 2,
  legendaryResistance: 1,
});

test('coerceLegendary keeps a count from 1 to the cap', () => {
  assert.equal(coerceLegendary('3'), 3);
  assert.equal(coerceLegendary(2.9), 2);
  assert.equal(coerceLegendary(99), MAX_LEGENDARY);
  assert.equal(coerceLegendary(0), undefined);
  assert.equal(coerceLegendary(''), undefined);
  assert.equal(coerceLegendary('x'), undefined);
  assert.deepEqual(attackTraitFields({ legendaryActions: 3, legendaryResistance: '2' }), {
    legendaryActions: 3,
    legendaryResistance: 2,
  });
  assert.deepEqual(attackTraitFields({ legendaryActions: -1 }), {});
});

test('the creature keeps its legendary counts through load, edit, and template', () => {
  assert.equal(king.legendaryActions, 2);
  assert.equal(king.legendaryResistance, 1);
  const loaded = withDefaults(/** @type {any} */ ({ ...king, legendaryActions: 'lots' }));
  assert.equal('legendaryActions' in loaded, false);
  assert.equal(loaded.legendaryResistance, 1);
  const spawn = fromTemplate(toTemplate('t', king), 'k2');
  assert.equal(spawn.legendaryActions, 2);
  assert.equal(spawn.legendaryResistance, 1);
  const edited = editCreature(king, {
    name: 'King',
    disposition: 'hostile',
    maxHP: 90,
    location: HERE,
    legendaryActions: 3,
  });
  assert.equal(edited.legendaryActions, 3);
  assert.equal('legendaryResistance' in edited, false);
});

test('a library creature coerces its legendary counts', () => {
  const library = normalizeLibrary({
    creatures: [{ name: 'Lich', maxHP: 135, legendaryActions: 3, legendaryResistance: 9 }],
  });
  assert.equal(library.creatures[0].legendaryActions, 3);
  assert.equal(library.creatures[0].legendaryResistance, MAX_LEGENDARY);
});

test('the creature form fills and reads the legendary counts', () => {
  const gear = gearOptions(king);
  const fields = creatureFields(king, gear);
  const value = (/** @type {string} */ name) => fields.find((f) => f.name === name)?.value;
  assert.equal(value('legendaryActions'), 2);
  assert.equal(value('legendaryResistance'), 1);
  const blank = creatureFields(null, gear);
  assert.equal(blank.find((f) => f.name === 'legendaryActions')?.value, '');
  const values = {
    name: 'King',
    role: '',
    disposition: 'hostile',
    notes: '',
    maxHP: '90',
    level: '',
    tier: 'mob',
    cr: '',
    weapon: '',
    armor: '',
    casterClass: '',
    legendaryActions: '2',
    legendaryResistance: '',
    ...Object.fromEntries(STAT_KEYS.map((key) => [`stat-${key}`, '10'])),
  };
  const read = readCreatureFields(values, gear);
  assert.equal(read.legendaryActions, 2);
  assert.equal('legendaryResistance' in read, false);
});
