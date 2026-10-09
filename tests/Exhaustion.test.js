import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EXHAUSTION,
  atDeathLevel,
  easeExhaustion,
  exhaustionFields,
  exhaustionLevel,
  exhaustionNote,
  setExhaustion,
  exhaustionSlant,
  tiredSpeed,
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

test('the 2014 ladder slants checks at 1, attacks and saves at 3, and cuts speed at 2 and 5', () => {
  assert.equal(exhaustionSlant(0, 'check'), null);
  assert.equal(exhaustionSlant(1, 'check'), 'disadvantage');
  assert.equal(exhaustionSlant(2, 'attack'), null);
  assert.equal(exhaustionSlant(2, 'save'), null);
  assert.equal(exhaustionSlant(3, 'attack'), 'disadvantage');
  assert.equal(exhaustionSlant(3, 'save'), 'disadvantage');
  assert.equal(tiredSpeed({ exhaustion: 1 }, 30), 30);
  assert.equal(tiredSpeed({ exhaustion: 2 }, 25), 12);
  assert.equal(tiredSpeed({ exhaustion: 5 }, 30), 0);
});

test('level 4 halves the HP maximum, and easing below 4 gives it back without healing', () => {
  const creature = { exhaustion: 0, maxHP: 21, currentHP: 18 };
  const halved = setExhaustion(creature, 4);
  assert.deepEqual([halved.maxHP, halved.currentHP, halved.hpHalved], [10, 10, 11]);
  const eased = easeExhaustion(halved);
  assert.deepEqual([eased.maxHP, eased.currentHP, eased.hpHalved], [21, 10, undefined]);
  const hero = { exhaustion: 0, resources: [{ id: 'hp', current: 9, max: 9 }] };
  const tired = setExhaustion(hero, 4);
  assert.deepEqual(tired.resources?.[0], { id: 'hp', current: 4, max: 4 });
  assert.equal(tired.hpHalved, 5);
  const deeper = setExhaustion(tired, 5);
  assert.equal(deeper.resources, tired.resources, 'a level above 4 keeps the same cut');
  assert.deepEqual(setExhaustion({ exhaustion: 0 }, 4), { exhaustion: 4 });
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

test('easeExhaustion takes levels off and stops at zero', () => {
  assert.equal(easeExhaustion({ exhaustion: 3 }).exhaustion, 2, 'one level by default');
  assert.equal(easeExhaustion({ exhaustion: 3 }, 2).exhaustion, 1);
  assert.equal(easeExhaustion({ exhaustion: 1 }, 5).exhaustion, 0);
  assert.equal(easeExhaustion({}).exhaustion, 0);
});

test('easeExhaustion takes the fatal level off without asking, so its callers judge', () => {
  // This module cannot read a death-save tracker without closing an import
  // cycle, so each caller decides whether a level may come off.
  // `DeathSaves.clearDying` and `Creature.heal` call it exactly because the
  // fatal level must go. `Character.longRest` holds the opposite guard, and does
  // not call it for a dead character. If either rule ever moves here, this test
  // is the one to delete.
  assert.equal(easeExhaustion({ exhaustion: MAX_EXHAUSTION }).exhaustion, 5);
});

test('exhaustionNote says what the level costs', () => {
  assert.equal(exhaustionNote({}), 'No exhaustion.');
  assert.equal(
    exhaustionNote({ exhaustion: 2 }),
    'Exhaustion 2: disadvantage on checks, half speed.',
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
    createCondition('Exhaustion'),
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

test('exhaustionFields reads a hand-typed chip variant and its level', () => {
  const numbered = exhaustionFields(undefined, [createCondition('Exhaustion 3')]);
  assert.equal(numbered.exhaustion, 3, 'a trailing number is the level the GM meant');
  assert.deepEqual(numbered.conditions, []);

  const worded = exhaustionFields(undefined, [createCondition('exhausted')]);
  assert.equal(worded.exhaustion, 1, 'a bare variant reads as level 1');
  assert.deepEqual(worded.conditions, []);

  const several = exhaustionFields(undefined, [
    createCondition('Exhausted'),
    createCondition('Exhaustion 9'),
  ]);
  assert.equal(several.exhaustion, MAX_EXHAUSTION, 'the highest wins, clamped at death');
  assert.deepEqual(several.conditions, []);
});

test('exhaustionFields leaves a chip that only starts with the word', () => {
  const conditions = [createCondition('Exhausting aura')];
  const fields = exhaustionFields(undefined, conditions);
  assert.equal(fields.exhaustion, 0);
  assert.equal(fields.conditions, conditions, 'the same list back, untouched');
});

test('exhaustionFields defaults an unexhausted entity to zero', () => {
  assert.deepEqual(exhaustionFields(undefined, []), { exhaustion: 0, conditions: [] });
});
