import { test } from 'node:test';
import assert from 'node:assert/strict';

import { npcFields, readNPCFields } from '../src/app/npcFields.js';
import { gearOptions } from '../src/app/gearFields.js';
import { DEFAULT_CREATURE_HP } from '../src/entities/Creature.js';
import { STAT_KEYS } from '../src/entities/Modifiers.js';

/** @param {import('../src/types/modal.js').ModalField[]} fields @param {string} name */
function field(fields, name) {
  const found = fields.find((f) => f.name === name);
  assert.ok(found, `the form has a ${name} field`);
  return found;
}

test('a new NPC starts at the commoner hit points, unarmed and unarmored', () => {
  const fields = npcFields(null, gearOptions(null));
  assert.equal(field(fields, 'maxHP').value, DEFAULT_CREATURE_HP);
  assert.equal(field(fields, 'weapon').value, '', 'an NPC has no tier default loadout');
  assert.equal(field(fields, 'armor').value, '');
});

test('the NPC form shows one input per stat, AC included', () => {
  const fields = npcFields(null, gearOptions(null));
  for (const key of STAT_KEYS) assert.equal(field(fields, `stat-${key}`).value, 10);
});

test('the AC input pre-fills from a seed DEX until the GM types over it', () => {
  const derived = npcFields({ stats: { DEX: 16 } }, gearOptions(null));
  assert.equal(field(derived, 'stat-AC').value, 13);
  const typed = npcFields({ stats: { DEX: 16, AC: 18 } }, gearOptions(null));
  assert.equal(field(typed, 'stat-AC').value, 18, 'a stored AC wins over the derived one');
});

test('an edit shows the hit points and gear the NPC already carries', () => {
  const seed = {
    maxHP: 22,
    weapon: { name: 'Rusty Cleaver', handling: 'melee', damage: [] },
    armor: { name: 'Bone Plate', acBonus: 3 },
  };
  const fields = npcFields(seed, gearOptions(seed));
  assert.equal(field(fields, 'maxHP').value, 22);
  assert.equal(field(fields, 'weapon').value, 'Rusty Cleaver');
  assert.equal(field(fields, 'armor').value, 'Bone Plate');
});

test('readNPCFields reads the hit points, the stats, and the gear back', () => {
  const gear = gearOptions(null);
  const values = {
    name: '  Smith  ',
    role: ' Blacksmith ',
    disposition: 'friendly',
    notes: ' Forges blades. ',
    maxHP: '11',
    weapon: 'Shortsword',
    armor: '',
    class: '',
    ...Object.fromEntries(STAT_KEYS.map((key) => [`stat-${key}`, '12'])),
  };
  const read = readNPCFields(values, gear);
  assert.equal(read.name, 'Smith');
  assert.equal(read.role, 'Blacksmith');
  assert.equal(read.notes, 'Forges blades.');
  assert.equal(read.maxHP, 11);
  assert.equal(read.stats.AC, 12, 'AC is read, not re-derived from DEX');
  assert.equal(read.weapon.name, 'Shortsword');
  assert.equal(read.armor, null, 'the empty picker is the explicit None');
});

test('a blank or nonsense maximum reads as the commoner default', () => {
  const gear = gearOptions(null);
  const base = { name: 'X', role: '', disposition: 'neutral', notes: '', weapon: '', armor: '' };
  assert.equal(readNPCFields({ ...base, maxHP: '' }, gear).maxHP, DEFAULT_CREATURE_HP);
  assert.equal(readNPCFields({ ...base, maxHP: 'tough' }, gear).maxHP, DEFAULT_CREATURE_HP);
  assert.equal(readNPCFields({ ...base, maxHP: '-6' }, gear).maxHP, 1, 'a negative clamps to 1');
});
