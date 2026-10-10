import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCondition } from '../src/entities/Conditions.js';
import { applyCure, cureFields, cureNames, cureOptions } from '../src/entities/HealCure.js';

const chip = (name, source) => createCondition(name, null, source ? { source } : {});

test('cureNames trims, drops empty and repeated names, and reads a comma list', () => {
  assert.deepEqual(cureNames(' Blinded, deafened ,, BLINDED'), ['Blinded', 'deafened']);
  assert.deepEqual(cureNames(['Poisoned', 3, '']), ['Poisoned']);
  assert.equal(cureNames(null), null);
  assert.equal(cureNames([]), null);
  assert.deepEqual(cureFields({ removes: 'Blinded', removesOneOf: [] }), { removes: ['Blinded'] });
  assert.deepEqual(cureFields({}), {});
});

test('cureOptions lists only what the target has, and Exhaustion reads the level', () => {
  const effect = /** @type {any} */ ({
    kind: 'heal',
    healing: [],
    removes: ['Blinded'],
    removesOneOf: ['Exhaustion', 'Charmed', 'Petrified'],
  });
  const target = { conditions: [chip('blinded'), chip('Charmed')], exhaustion: 2 };
  assert.deepEqual(cureOptions(effect, target), {
    always: ['Blinded'],
    choices: ['Exhaustion', 'Charmed'],
  });
  assert.deepEqual(cureOptions({ kind: 'heal', healing: [] }, { conditions: [] }), {
    always: [],
    choices: [],
  });
});

test('applyCure takes the chips off and one level of exhaustion, and returns the same target for nothing', () => {
  const target = { conditions: [chip('Blinded'), chip('Poisoned')], exhaustion: 2 };
  const { entity, ended } = applyCure(target, ['blinded', 'Exhaustion']);
  assert.deepEqual(ended, ['Blinded', 'Exhaustion']);
  assert.deepEqual(
    entity.conditions.map((c) => c.name),
    ['Poisoned'],
  );
  assert.equal(entity.exhaustion, 1);
  assert.equal(target.conditions.length, 2, 'the input is not changed');
  assert.equal(applyCure(target, ['Charmed']).entity, target);
  assert.equal(applyCure({ conditions: [] }, ['Exhaustion']).ended.length, 0);
});
