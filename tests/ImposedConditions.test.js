import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isImposedBy, removeImposed } from '../src/entities/ImposedConditions.js';
import { createCondition, addCondition } from '../src/entities/Conditions.js';

/** A source stamped by a cast of Hold Person.
 * @param {Partial<import('../src/types/entities.js').ConditionSource>} [over] */
function source(over = {}) {
  return {
    spellId: 'hold-person',
    spellName: 'Hold Person',
    casterId: 'c1',
    saveAbility: 'WIS',
    saveDC: 15,
    saveBonus: 2,
    ...over,
  };
}

test('isImposedBy needs both the caster and the spell to match', () => {
  const chip = createCondition('Paralyzed', 10, source());
  assert.equal(isImposedBy(chip, 'c1', 'hold-person'), true);
  assert.equal(isImposedBy(chip, 'c2', 'hold-person'), false, 'another caster of the same spell');
  assert.equal(isImposedBy(chip, 'c1', 'bless'), false, 'the same caster, another spell');
  assert.equal(isImposedBy(createCondition('Prone', null), 'c1', 'hold-person'), false);
});

test('removeImposed takes off one cast’s chips and reports them', () => {
  const list = [
    createCondition('Paralyzed', 10, source()),
    createCondition('Prone', null),
    createCondition('Frightened', 5, source({ spellId: 'bane', spellName: 'Bane' })),
    createCondition('Charmed', 3, source({ casterId: 'c2' })),
  ];
  const { conditions, removed } = removeImposed(list, 'c1', 'hold-person');
  assert.deepEqual(
    conditions.map((c) => c.name),
    ['Prone', 'Frightened', 'Charmed'],
    'a hand-added chip, another spell, and another caster all stay',
  );
  assert.deepEqual(
    removed.map((c) => c.name),
    ['Paralyzed'],
  );
});

test('removeImposed preserves identity when nothing matched', () => {
  const list = [createCondition('Prone', null), createCondition('Paralyzed', 10, source())];
  const result = removeImposed(list, 'c9', 'hold-person');
  assert.equal(result.conditions, list, 'the caller can skip the write');
  assert.deepEqual(result.removed, []);
});

test('addCondition carries a source through, and a replacement takes over the chip', () => {
  const first = addCondition([], 'Paralyzed', 10, source());
  assert.equal(first[0].source?.spellId, 'hold-person');
  // A second cast replaces the chip, and owns it from then on.
  const second = addCondition(first, 'paralyzed', 4, source({ casterId: 'c2' }));
  assert.equal(second.length, 1);
  assert.equal(second[0].source?.casterId, 'c2');
  assert.equal(second[0].rounds, 4);
  // A hand-added chip stores no source key at all.
  assert.deepEqual(addCondition([], 'Prone'), [{ name: 'Prone', rounds: null }]);
});
