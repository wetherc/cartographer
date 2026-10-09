import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grantTempHP, settleHPBuffs } from '../src/entities/HPBuffs.js';
import { createCreature } from '../src/entities/Creature.js';
import { createCharacter, getHP, setBonusHP, withHP } from '../src/entities/Character.js';
import { reconcileMaxHP } from '../src/entities/HitDice.js';
import { createCondition } from '../src/entities/Conditions.js';
import { elapse } from '../src/entities/TimedEffects.js';

/** A chip that raises the HP maximum by `n`, for `rounds` rounds. */
const aid = (n, rounds = null) => createCondition('Aid', rounds, { mods: { maxHP: n } });

test('an entity with no HP chip comes back as the same object', () => {
  const goblin = createCreature('g', 'Goblin', { maxHP: 7 });
  assert.equal(settleHPBuffs(goblin), goblin);
  const hero = withHP(createCharacter('h', 'Hero'), 20);
  assert.equal(settleHPBuffs(hero), hero);
});

test('a raise lifts a creature, and its end drops the maximum only', () => {
  const goblin = createCreature('g', 'Goblin', { maxHP: 7 });
  const raised = settleHPBuffs({ ...goblin, conditions: [aid(5)] });
  assert.deepEqual([raised.currentHP, raised.maxHP, raised.hpBoost], [12, 12, 5]);
  assert.equal(settleHPBuffs(raised), raised);
  const bigger = settleHPBuffs({ ...raised, conditions: [aid(10)] });
  assert.deepEqual([bigger.currentHP, bigger.maxHP], [17, 17]);
  const ended = settleHPBuffs({ ...bigger, currentHP: 9, conditions: [] });
  assert.deepEqual([ended.currentHP, ended.maxHP, 'hpBoost' in ended], [7, 7, false]);
  const hurt = settleHPBuffs({ ...bigger, currentHP: 4, conditions: [] });
  assert.equal(hurt.currentHP, 4);
});

test('a raise moves a character pool, and a character without one records it', () => {
  const hero = withHP(createCharacter('h', 'Hero'), 20);
  const raised = settleHPBuffs({ ...hero, conditions: [aid(5)] });
  assert.deepEqual([getHP(raised)?.current, getHP(raised)?.max], [25, 25]);
  const ended = settleHPBuffs({ ...raised, conditions: [] });
  assert.deepEqual([getHP(ended)?.current, getHP(ended)?.max], [20, 20]);
  const bare = createCharacter('b', 'Bare');
  const recorded = settleHPBuffs({ ...bare, conditions: [aid(5)] });
  assert.equal(recorded.hpBoost, 5);
  assert.equal(settleHPBuffs(recorded), recorded);
});

test('temporary HP from a chip end with it, and hand-typed ones stay', () => {
  const hero = withHP(createCharacter('h', 'Hero'), 20);
  const chip = createCondition('False Life', 600);
  const granted = grantTempHP({ ...hero, conditions: [chip] }, 7, 'False Life');
  assert.deepEqual([granted.bonusHP, granted.bonusHPFrom], [7, 'false life']);
  assert.equal(settleHPBuffs(granted), granted);
  const gone = settleHPBuffs({ ...granted, conditions: [] });
  assert.deepEqual([gone.bonusHP, 'bonusHPFrom' in gone], [0, false]);
  const typed = setBonusHP(granted, 9);
  assert.equal('bonusHPFrom' in typed, false);
  assert.equal(settleHPBuffs({ ...typed, conditions: [] }).bonusHP, 9);
});

test('temporary HP take the larger grant and never add up', () => {
  const goblin = createCreature('g', 'Goblin', { maxHP: 7 });
  const five = grantTempHP(goblin, 5, 'Heroism');
  assert.equal(grantTempHP(five, 3, 'False Life'), five);
  const eight = grantTempHP(five, 8);
  assert.deepEqual([eight.bonusHP, 'bonusHPFrom' in eight], [8, false]);
});

test('the class maximum keeps the raise on top', () => {
  const hero = /** @type {any} */ ({
    ...withHP(createCharacter('h', 'Hero'), 1),
    classes: [{ classId: 'fighter', level: 1 }],
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
  });
  const base = getHP(reconcileMaxHP(hero))?.max ?? 0;
  assert.equal(getHP(reconcileMaxHP({ ...hero, hpBoost: 5 }))?.max, base + 5);
});

test('game time and the round tick end a timed raise', () => {
  const hero = settleHPBuffs({
    ...withHP(createCharacter('h', 'Hero'), 20),
    conditions: [aid(5, 1)],
  });
  assert.equal(getHP(hero)?.max, 25);
  assert.equal(getHP(elapse(hero, 2400).entity)?.max, 20);
  const goblin = settleHPBuffs({
    ...createCreature('g', 'Goblin', { maxHP: 7 }),
    conditions: [aid(5, 1)],
  });
  assert.equal(elapse(goblin, 1).entity.maxHP, 7);
});
