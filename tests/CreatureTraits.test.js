import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAIT_KEYS,
  createCreature,
  creatureTraitFields,
  editCreature,
  omitTraits,
  pickTraits,
  withDefaults,
} from '../src/entities/Creature.js';
import { fromTemplate, toTemplate } from '../src/entities/CreatureTemplate.js';

/** A usable value for every trait key. */
const FULL = {
  cr: 2,
  proficiencies: { saves: ['DEX'], skills: ['stealth'] },
  defenses: { resist: ['cold'], vulnerable: [], immune: [] },
  creatureType: 'beast',
  conditionImmunities: ['Charmed'],
  multiattack: 2,
  packTactics: true,
  surpriseAttack: { count: 2, sides: 6 },
  multiattackDisadvantage: 2,
  redirectAttack: true,
  turnResistance: true,
  legendaryActions: 3,
  legendaryResistance: 1,
  actions: [{ name: 'Frost Breath', saveAbility: 'DEX', dc: 13, damage: [], halfOnSave: true }],
};

/** A value for every trait key that coerces to no trait at all. */
const JUNK = Object.fromEntries(TRAIT_KEYS.map((key) => [key, 'junk']));

const sorted = (list) => [...list].sort();

test('the trait list names every key that the trait coercers write', () => {
  assert.deepEqual(sorted(Object.keys(FULL)), sorted(TRAIT_KEYS));
  assert.deepEqual(sorted(Object.keys(creatureTraitFields(FULL))), sorted(TRAIT_KEYS));
  assert.deepEqual(creatureTraitFields(JUNK), {});
  const bare = Object.keys(createCreature('a', 'A'));
  const full = Object.keys(createCreature('a', 'A', FULL));
  assert.deepEqual(sorted(full.filter((key) => !bare.includes(key))), sorted(TRAIT_KEYS));
});

test('pickTraits copies only present trait keys and omitTraits drops them all', () => {
  assert.deepEqual(pickTraits({ cr: 1, name: 'x', notes: 'y' }), { cr: 1 });
  assert.deepEqual(pickTraits({ actions: undefined }), { actions: undefined });
  assert.deepEqual(omitTraits({ ...FULL, name: 'x' }), { name: 'x' });
});

test('withDefaults keeps every usable trait and coerces every bad one away', () => {
  const kept = withDefaults({ ...createCreature('a', 'A'), ...FULL });
  for (const key of TRAIT_KEYS) assert.ok(key in kept, key);
  const dropped = withDefaults({ ...createCreature('a', 'A'), ...JUNK });
  for (const key of TRAIT_KEYS) assert.ok(!(key in dropped), key);
});

test('editCreature clears every trait the edit leaves out, except the actions', () => {
  const creature = createCreature('a', 'A', FULL);
  const edits = { name: 'A', disposition: 'hostile', maxHP: 4, location: null };
  const edited = editCreature(creature, edits);
  for (const key of TRAIT_KEYS) assert.equal(key in edited, key === 'actions', key);
  const cleared = editCreature(creature, { ...edits, actions: [] });
  for (const key of TRAIT_KEYS) assert.ok(!(key in cleared), key);
  const set = editCreature(createCreature('b', 'B'), { ...edits, ...FULL });
  for (const key of TRAIT_KEYS) assert.ok(key in set, key);
});

test('a template round trip keeps every trait', () => {
  const template = toTemplate('t', createCreature('a', 'A', FULL));
  for (const key of TRAIT_KEYS) assert.ok(key in template, key);
  const spawned = fromTemplate(template, 'b');
  for (const key of TRAIT_KEYS) assert.deepEqual(spawned[key], template[key], key);
  assert.notEqual(spawned.actions, template.actions);
});
