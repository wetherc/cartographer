import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDefenses,
  defenseFields,
  defenseNote,
  defensesOf,
  defensesSummary,
  normalizeDefenses,
} from '../src/entities/DamageDefenses.js';
import {
  createCreature,
  editCreature,
  fromTemplate,
  toTemplate,
  withDefaults,
} from '../src/entities/Creature.js';
import { normalizeLibrary } from '../src/library/Library.js';

/** One damage group, as `rollDamage` returns it. */
const group = (/** @type {string} */ damageType, /** @type {number} */ subtotal) => ({
  damageType,
  rolls: [subtotal],
  bonus: 0,
  subtotal,
});

const none = normalizeDefenses(null);

test('normalizeDefenses keeps known types, lowercase and once each', () => {
  assert.deepEqual(normalizeDefenses({ resist: ['Fire', 'fire', 'lava'], immune: 'poison' }), {
    resist: ['fire'],
    vulnerable: [],
    immune: [],
  });
  assert.deepEqual(normalizeDefenses('junk'), none);
});

test('defenseFields stores nothing for a creature with no defenses', () => {
  assert.deepEqual(defenseFields({ resist: [] }), {});
  assert.deepEqual(defenseFields({ immune: ['poison'] }), {
    defenses: { resist: [], vulnerable: [], immune: ['poison'] },
  });
});

test('defensesOf joins a creature list with a race resistance', () => {
  assert.deepEqual(defensesOf({ raceTraits: { resistances: ['fire'] } }).resist, ['fire']);
  assert.deepEqual(defensesOf({ defenses: { resist: ['cold'], vulnerable: [], immune: [] } }), {
    resist: ['cold'],
    vulnerable: [],
    immune: [],
  });
  assert.deepEqual(defensesOf({}), none);
});

test('applyDefenses halves, doubles, or zeroes each type on its own', () => {
  const defenses = { resist: ['fire'], vulnerable: ['cold'], immune: ['poison'] };
  const hit = applyDefenses([group('fire', 7), group('cold', 3), group('poison', 9)], defenses);
  assert.equal(hit.total, 3 + 6);
  assert.deepEqual(hit.notes, ['resists fire', 'vulnerable to cold', 'immune to poison']);
  const other = applyDefenses([group('fire', 7), group('slashing', 5)], defenses);
  assert.equal(other.total, 3 + 5, 'an untouched type takes full damage');
});

test('a saved half comes before resistance', () => {
  const resisted = applyDefenses(
    [group('fire', 9)],
    { ...none, resist: ['fire'] },
    { halve: true },
  );
  assert.equal(resisted.total, 2, 'half of 9 is 4, and resistance halves it to 2');
  const plain = applyDefenses([group('fire', 5), group('cold', 4)], none, { halve: true });
  assert.deepEqual(plain, { total: 4, notes: [] }, 'no defense halves the whole total');
  assert.equal(applyDefenses([group('fire', 5)], none).total, 5);
});

test('defenseNote and defensesSummary read for the log and the stat block', () => {
  assert.equal(defenseNote(['resists fire', 'resists fire'], 4), ' (resists fire, takes 4)');
  assert.equal(defenseNote([], 4), '');
  assert.equal(
    defensesSummary({ resist: ['fire', 'cold'], vulnerable: [], immune: ['poison'] }),
    'Resists fire, cold. Immune to poison.',
  );
  assert.equal(defensesSummary(undefined), '');
});

test('a creature keeps its defenses through load, edit, and a template', () => {
  const defenses = { resist: ['fire'], vulnerable: [], immune: [] };
  const imp = createCreature('imp', 'Imp', { defenses });
  assert.deepEqual(imp.defenses, defenses);
  assert.deepEqual(
    withDefaults({ ...imp, defenses: { resist: ['FIRE', 'lava'] } }).defenses,
    defenses,
  );
  const template = toTemplate('imp', imp);
  assert.deepEqual(fromTemplate(template, 'imp-2').defenses, defenses);
  const edited = editCreature(imp, {
    name: 'Imp',
    disposition: 'hostile',
    maxHP: 4,
    location: null,
  });
  assert.equal('defenses' in edited, false, 'an edit with no defenses clears them');
  const lib = normalizeLibrary({
    creatures: [{ name: 'Imp', defenses: { immune: ['poison', 'x'] } }],
  });
  assert.deepEqual(lib.creatures[0].defenses, { resist: [], vulnerable: [], immune: ['poison'] });
});
