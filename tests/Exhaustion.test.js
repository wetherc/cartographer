import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_CHIP,
  MAX_EXHAUSTION,
  atDeathLevel,
  d20Penalty,
  easeExhaustion,
  exhaustionFields,
  exhaustionLevel,
  exhaustionNote,
  gainExhaustion,
  setExhaustion,
  speedPenalty,
} from '../src/entities/Exhaustion.js';
import { createCondition } from '../src/entities/Conditions.js';

test('exhaustionLevel reads a stored level and clamps a nonsense one', () => {
  assert.equal(exhaustionLevel({ exhaustion: 3 }), 3);
  assert.equal(exhaustionLevel({}), 0, 'absent reads as unexhausted');
  assert.equal(exhaustionLevel({ exhaustion: 0 }), 0);
  assert.equal(exhaustionLevel({ exhaustion: -2 }), 0, 'below rest');
  assert.equal(exhaustionLevel({ exhaustion: 99 }), MAX_EXHAUSTION, 'past death');
  assert.equal(exhaustionLevel({ exhaustion: 2.7 }), 2, 'a fraction floors');
  assert.equal(exhaustionLevel(/** @type {any} */ ({ exhaustion: 'tired' })), 0);
  assert.equal(exhaustionLevel(/** @type {any} */ ({ exhaustion: null })), 0);
});

test('each level costs 2 on a d20 test and 5 feet, and the penalty is signed', () => {
  assert.equal(d20Penalty({ exhaustion: 0 }), 0);
  assert.equal(d20Penalty({ exhaustion: 1 }), -2);
  assert.equal(d20Penalty({ exhaustion: 5 }), -10);
  assert.equal(speedPenalty({ exhaustion: 0 }), 0);
  assert.equal(speedPenalty({ exhaustion: 1 }), 5);
  assert.equal(speedPenalty({ exhaustion: 5 }), 25);
});

test('only the sixth level is fatal', () => {
  assert.equal(atDeathLevel({ exhaustion: 5 }), false);
  assert.equal(atDeathLevel({ exhaustion: MAX_EXHAUSTION }), true);
  assert.equal(atDeathLevel({ exhaustion: 40 }), true, 'a hand-edited save clamps into death');
  assert.equal(atDeathLevel({}), false);
});

test('setExhaustion writes a clamped level and leaves the rest of the entity alone', () => {
  const hero = { id: 'c1', name: 'Hero', exhaustion: 1 };
  assert.deepEqual(setExhaustion(hero, 4), { id: 'c1', name: 'Hero', exhaustion: 4 });
  assert.equal(setExhaustion(hero, -1).exhaustion, 0);
  assert.equal(setExhaustion(hero, 9).exhaustion, MAX_EXHAUSTION);
  assert.equal(hero.exhaustion, 1, 'the original is untouched');
});

test('gainExhaustion adds levels and stops at death', () => {
  assert.equal(gainExhaustion({}).exhaustion, 1, 'one level by default');
  assert.equal(gainExhaustion({ exhaustion: 2 }, 3).exhaustion, 5);
  assert.equal(gainExhaustion({ exhaustion: 5 }, 4).exhaustion, MAX_EXHAUSTION);
  assert.equal(gainExhaustion({ exhaustion: 2 }, -3).exhaustion, 2, 'a negative gain adds nothing');
});

test('easeExhaustion takes levels off and stops at zero', () => {
  assert.equal(easeExhaustion({ exhaustion: 3 }).exhaustion, 2, 'one level by default');
  assert.equal(easeExhaustion({ exhaustion: 3 }, 2).exhaustion, 1);
  assert.equal(easeExhaustion({ exhaustion: 1 }, 5).exhaustion, 0);
  assert.equal(easeExhaustion({}).exhaustion, 0);
});

test('easeExhaustion holds no death guard, so its callers must', () => {
  // The guard lives in `Character.longRest`, because this module cannot read a
  // death-save tracker without closing an import cycle. If that ever moves
  // here, this test is the one to delete.
  assert.equal(easeExhaustion({ exhaustion: MAX_EXHAUSTION }).exhaustion, 5);
});

test('exhaustionNote says what the level costs', () => {
  assert.equal(exhaustionNote({}), 'No exhaustion.');
  assert.equal(
    exhaustionNote({ exhaustion: 2 }),
    'Exhaustion 2: -4 to every d20 test, and 10 feet slower.',
  );
  assert.equal(exhaustionNote({ exhaustion: MAX_EXHAUSTION }), 'Exhaustion 6: dead.');
});

test('exhaustionFields keeps a stored level and the condition list it came with', () => {
  const conditions = [createCondition('Poisoned', 3)];
  const fields = exhaustionFields(2, conditions);
  assert.equal(fields.exhaustion, 2);
  assert.equal(fields.conditions, conditions, 'no chip means the same list back');
});

test('exhaustionFields folds a legacy chip into level 1 and drops it', () => {
  const fields = exhaustionFields(undefined, [
    createCondition('Poisoned', 3),
    createCondition(LEGACY_CHIP),
  ]);
  assert.equal(fields.exhaustion, 1);
  assert.deepEqual(
    fields.conditions.map((c) => c.name),
    ['Poisoned'],
  );
});

test('exhaustionFields drops a stray chip beside a stored level, keeping the level', () => {
  const fields = exhaustionFields(4, [createCondition('exhaustion')]);
  assert.equal(fields.exhaustion, 4, 'the number wins');
  assert.deepEqual(fields.conditions, [], 'and the chip goes, so the two cannot disagree');
});

test('exhaustionFields defaults an unexhausted entity to zero', () => {
  assert.deepEqual(exhaustionFields(undefined, []), { exhaustion: 0, conditions: [] });
});
