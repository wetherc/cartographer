import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HIT_DICE_RESOURCE_ID,
  hitDieFor,
  hpGainPerLevel,
  levelHPGain,
  classMaxHP,
  getHitDice,
  withHitDice,
  spendHitDie,
  syncHitDiceToLevel,
} from '../src/entities/HitDice.js';
import {
  createCharacter,
  withHP,
  addXP,
  addResource,
  spendResource,
  shortRest,
  longRest,
  getHP,
} from '../src/entities/Character.js';
import { withSpellSlots } from '../src/entities/SpellSlots.js';
import { createResource } from '../src/entities/Resource.js';

/** @param {number} [con] */
function fighter(con = 10) {
  return {
    ...createCharacter('c1', 'Bron', { CON: con }),
    classes: [{ classId: 'fighter', level: 1 }],
  };
}

test('hitDieFor reads the class hit die; classless and unknown yield null', () => {
  assert.equal(hitDieFor(fighter()), 10);
  assert.equal(hitDieFor(createCharacter('c1', 'Nim')), null);
  assert.equal(
    hitDieFor({ ...createCharacter('c1', 'Nim'), classes: [{ classId: 'bogus', level: 1 }] }),
    null,
  );
});

test('hpGainPerLevel is half the die plus one plus CON, floored at 1', () => {
  assert.equal(hpGainPerLevel(10, 0), 6);
  assert.equal(hpGainPerLevel(8, 2), 7);
  assert.equal(hpGainPerLevel(6, -5), 1);
});

test('levelHPGain derives from the character; null without a class', () => {
  assert.equal(levelHPGain(fighter(14)), 8);
  assert.equal(levelHPGain(createCharacter('c1', 'Nim')), null);
});

test('classMaxHP follows the average rule and clamps level 1 to at least 1', () => {
  assert.equal(classMaxHP(fighter()), 10);
  assert.equal(classMaxHP({ ...fighter(14), level: 3 }), 12 + 2 * 8);
  assert.equal(classMaxHP({ ...fighter(1), level: 2 }), 5 + 1);
  const frail = {
    ...createCharacter('c1', 'Nim', { CON: 0 }),
    classes: [{ classId: 'wizard', level: 1 }],
  };
  assert.equal(classMaxHP(frail), 1);
  assert.equal(classMaxHP(createCharacter('c1', 'Nim')), null);
});

test('withHitDice sizes the pool to level and orders it after HP and slots', () => {
  let c = withSpellSlots(
    withHP({ ...fighter(), classes: [{ classId: 'wizard', level: 3 }], level: 3 }, 10),
  );
  c = addResource(c, createResource('ki', 'Ki', 'custom', 3));
  c = withHitDice(c);
  assert.deepEqual(
    c.resources.map((r) => r.id),
    ['hp', 'slots-1', 'slots-2', HIT_DICE_RESOURCE_ID, 'ki'],
  );
  assert.deepEqual(getHitDice(c), {
    id: HIT_DICE_RESOURCE_ID,
    name: 'Hit Dice',
    type: 'custom',
    current: 3,
    max: 3,
  });
});

test('withHitDice replaces an existing pool instead of stacking a second', () => {
  const c = withHitDice(withHitDice(fighter()));
  assert.equal(c.resources.filter((r) => r.id === HIT_DICE_RESOURCE_ID).length, 1);
});

test('malformed level and missing stats fall back to level 1 and CON 10', () => {
  assert.equal(getHitDice(withHitDice({ ...fighter(), level: 0 })).max, 1);
  assert.equal(getHitDice(syncHitDiceToLevel({ ...withHitDice(fighter()), level: NaN })).max, 1);
  const statless = { ...withHitDice(withHP(fighter(), 10)), stats: undefined, level: NaN };
  assert.equal(classMaxHP(statless), 10);
  assert.equal(spendHitDie(statless, () => 0).healed, 1);
});

test('syncHitDiceToLevel grows the pool keeping spent dice spent', () => {
  let c = spendResource(withHitDice({ ...fighter(), level: 2 }), HIT_DICE_RESOURCE_ID, 1);
  c = syncHitDiceToLevel({ ...c, level: 5 });
  assert.deepEqual(
    { max: getHitDice(c).max, current: getHitDice(c).current },
    { max: 5, current: 4 },
  );

  const shrunk = syncHitDiceToLevel({ ...c, level: 2 });
  assert.deepEqual(
    { max: getHitDice(shrunk).max, current: getHitDice(shrunk).current },
    { max: 2, current: 2 },
  );
});

test('syncHitDiceToLevel preserves identity without a pool or a change', () => {
  const bare = fighter();
  assert.equal(syncHitDiceToLevel(bare), bare);
  const pooled = withHitDice(bare);
  assert.equal(syncHitDiceToLevel(pooled), pooled);
});

test('spendHitDie heals the roll plus CON and marks the die spent', () => {
  const c = spendResource(
    addResource(withHitDice(withHP(fighter(14), 20)), createResource('ki', 'Ki', 'custom', 3)),
    'hp',
    15,
  );
  const { character, healed, rolled } = spendHitDie(c, () => 0.5); // d10 -> 6
  assert.equal(rolled, 6);
  assert.equal(healed, 8);
  assert.equal(getHP(character).current, 13);
  assert.equal(getHitDice(character).current, 0);
  assert.equal(character.resources.find((r) => r.id === 'ki').current, 3);
});

test('spendHitDie never heals negative and clamps HP to max', () => {
  const drained = spendHitDie(withHitDice(withHP(fighter(1), 20)), () => 0); // roll 1, CON -5
  assert.equal(drained.healed, 0);
  assert.equal(getHP(drained.character).current, 20);
  assert.equal(getHitDice(drained.character).current, 0);

  const full = spendHitDie(withHitDice(withHP(fighter(14), 20)), () => 0.99);
  assert.equal(getHP(full.character).current, 20);
});

test('spendHitDie is a no-op without dice, a pool, or a class', () => {
  const empty = spendResource(withHitDice(fighter()), HIT_DICE_RESOURCE_ID, 1);
  assert.deepEqual(
    spendHitDie(empty, () => 0.5),
    { character: empty, healed: 0, rolled: 0 },
  );

  const bare = fighter();
  assert.equal(spendHitDie(bare).character, bare);

  const classless = withHitDice({ ...withHP(createCharacter('c1', 'Nim'), 10), level: 2 });
  assert.equal(spendHitDie(classless).character, classless);
});

test('a short rest leaves hit dice spent; a long rest restores half, at least one', () => {
  let c = withHitDice({ ...fighter(), level: 5 });
  c = spendResource(c, HIT_DICE_RESOURCE_ID, 5);
  assert.equal(getHitDice(shortRest(c)).current, 0);
  assert.equal(getHitDice(longRest(c)).current, 2);

  const one = spendResource(withHitDice(fighter()), HIT_DICE_RESOURCE_ID, 1);
  assert.equal(getHitDice(longRest(one)).current, 1);
});

test('addXP grows HP by the class average rule and hit dice by levels gained', () => {
  const c = withHitDice(withHP(fighter(14), 12)); // level 1, d10, CON +2
  const leveled = addXP(c, 320); // level 1 -> 3
  assert.equal(getHP(leveled).max, 12 + 2 * 8);
  assert.equal(getHP(leveled).current, 12 + 2 * 8);
  assert.deepEqual(
    { max: getHitDice(leveled).max, current: getHitDice(leveled).current },
    { max: 3, current: 3 },
  );
});

test('addXP keeps the tenth-of-max fallback for a classless character', () => {
  const c = withHP(createCharacter('c1', 'Nim'), 30);
  assert.equal(getHP(addXP(c, 100)).max, 33);
});

test('addXP honors an explicit hpGrowth override past the class rule', () => {
  const c = withHP(fighter(14), 12);
  assert.equal(getHP(addXP(c, 100, { hpGrowth: 1 })).max, 13);
});
