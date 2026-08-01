import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isImposedBy, removeImposed, repeatSaves } from '../src/entities/ImposedConditions.js';
import { createCondition, addCondition } from '../src/entities/Conditions.js';

/**
 * A deterministic RNG replaying a queue of unit values, one per call, matching
 * the dice suites: `roll` computes `floor(rng() * sides) + 1`. Past the queue it
 * returns 0, the minimum face.
 * @param {number[]} values
 * @returns {() => number}
 */
function seq(values) {
  const queue = [...values];
  return () => (queue.length ? /** @type {number} */ (queue.shift()) : 0);
}

/** rng() value that makes a d`sides` roll come up `face`. */
function face(sides, value) {
  return (value - 1) / sides + 1e-9;
}

/** A source stamped by a cast of Hold Person, retried at end of turn by default.
 * @param {Partial<import('../src/types/entities.js').ConditionSource>} [over] */
function source(over = {}) {
  return {
    spellId: 'hold-person',
    spellName: 'Hold Person',
    casterId: 'c1',
    saveAbility: 'WIS',
    saveDC: 15,
    saveBonus: 2,
    saveEnds: true,
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

test('repeatSaves rolls only the chips whose spell allows a retry', () => {
  const list = [
    createCondition('Prone', null),
    createCondition('Frightened', 5, source({ saveEnds: false })),
    createCondition('Paralyzed', 10, source()),
  ];
  // One roll consumed, and it is the paralysis: 10 + 2 beats nothing else.
  const { results } = repeatSaves(list, { rng: seq([face(20, 10)]) });
  assert.deepEqual(
    results.map((r) => r.condition.name),
    ['Paralyzed'],
  );
  assert.equal(results[0].save.dc, 15);
  assert.equal(results[0].save.total, 12, '10 on the die plus the recorded +2');
});

test('a successful retry takes the chip off, a failed one leaves it', () => {
  const list = [createCondition('Paralyzed', 10, source())];
  const made = repeatSaves(list, { rng: seq([face(20, 18)]) });
  assert.equal(made.results[0].ended, true);
  assert.deepEqual(made.conditions, [], '18 + 2 meets DC 15');
  const missed = repeatSaves(list, { rng: seq([face(20, 5)]) });
  assert.equal(missed.results[0].ended, false);
  assert.equal(missed.conditions, list, 'identity preserved, so no write follows a held effect');
});

test('a retry succeeds on a tie, matching every other save', () => {
  const list = [createCondition('Paralyzed', 10, source({ saveDC: 12 }))];
  const { results } = repeatSaves(list, { rng: seq([face(20, 10)]) });
  assert.equal(results[0].save.total, 12);
  assert.equal(results[0].ended, true);
});

test('bonusOf overrides the recorded bonus', () => {
  // What the app does for a party character: the stamped bonus was right when
  // the spell landed, but the live one counts now.
  const list = [createCondition('Paralyzed', 10, source())];
  const { results } = repeatSaves(list, { bonusOf: () => 9, rng: seq([face(20, 6)]) });
  assert.equal(results[0].save.total, 15);
  assert.equal(results[0].ended, true, '6 + 9 meets DC 15, where 6 + 2 would not');
});

test('a source with no DC recorded retries against DC 10', () => {
  const list = [createCondition('Paralyzed', null, source({ saveDC: undefined, saveBonus: 0 }))];
  const { results } = repeatSaves(list, { rng: seq([face(20, 10)]) });
  assert.equal(results[0].save.dc, 10);
  assert.equal(results[0].ended, true);
});

test('a list with nothing to retry rolls nothing and is handed straight back', () => {
  const list = [createCondition('Prone', null), createCondition('Poisoned', 2)];
  const result = repeatSaves(list, { rng: () => assert.fail('no die should be rolled') });
  assert.equal(result.conditions, list);
  assert.deepEqual(result.results, []);
  assert.deepEqual(repeatSaves([]).results, []);
});

test('several retries in one turn each roll their own die', () => {
  const list = [
    createCondition('Paralyzed', 10, source()),
    createCondition('Charmed', 4, source({ spellId: 'charm', spellName: 'Charm Person' })),
  ];
  const { conditions, results } = repeatSaves(list, {
    rng: seq([face(20, 20), face(20, 1)]),
  });
  assert.deepEqual(
    results.map((r) => r.ended),
    [true, false],
  );
  assert.deepEqual(
    conditions.map((c) => c.name),
    ['Charmed'],
  );
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

test('a source with no recorded bonus retries the save at a flat bonus of 0', () => {
  const chip = createCondition('Paralyzed', 10, source({ saveBonus: undefined }));
  // A d20 face of 15 alone meets the DC of 15, so a 0 bonus is enough.
  const passed = repeatSaves([chip], { rng: seq([face(20, 15)]) });
  assert.equal(passed.results[0].save.total, 15);
  assert.equal(passed.results[0].ended, true);
  assert.deepEqual(passed.conditions, []);
  // One face lower fails, which proves nothing was added to the roll.
  const failed = repeatSaves([chip], { rng: seq([face(20, 14)]) });
  assert.equal(failed.results[0].save.total, 14);
  assert.equal(failed.results[0].ended, false);
});
