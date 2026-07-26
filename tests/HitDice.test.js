import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_HIT_DICE_ID,
  hitDicePoolId,
  hitDieOfPool,
  isHitDicePool,
  hitDieFor,
  characterHitDice,
  hpGainPerLevel,
  classMaxHP,
  getHitDicePools,
  withHitDice,
  spendHitDie,
  syncHitDice,
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
import { assignLevel } from '../src/entities/LevelAssign.js';
import { createResource } from '../src/entities/Resource.js';

/** @param {number} [con] */
function fighter(con = 10) {
  return {
    ...createCharacter('c1', 'Bron', { CON: con }),
    classes: [{ classId: 'fighter', level: 1 }],
  };
}

/** @param {import('../src/types/class.js').ClassRef[]} classes @param {number} [con] */
function classed(classes, con = 10) {
  const level = classes.reduce((sum, ref) => sum + ref.level, 0);
  return { ...createCharacter('c1', 'Bron', { CON: con }), classes, level };
}

/** @param {import('../src/types/entities.js').Character} c */
function dicePools(c) {
  return getHitDicePools(c).map((r) => ({ id: r.id, max: r.max, current: r.current }));
}

test('hitDieFor reads the class hit die; classless and unknown yield null', () => {
  assert.equal(hitDieFor(fighter()), 10);
  assert.equal(hitDieFor(createCharacter('c1', 'Nim')), null);
  assert.equal(
    hitDieFor({ ...createCharacter('c1', 'Nim'), classes: [{ classId: 'bogus', level: 1 }] }),
    null,
  );
});

test('pool ids embed the die size; the legacy sizeless pool still matches', () => {
  const pool = createResource(hitDicePoolId(8), 'Hit Dice (d8)', 'custom', 3);
  assert.equal(pool.id, 'hit-dice-d8');
  assert.equal(hitDieOfPool(pool), 8);
  assert.equal(isHitDicePool(pool), true);
  const legacy = createResource(LEGACY_HIT_DICE_ID, 'Hit Dice', 'custom', 3);
  assert.equal(isHitDicePool(legacy), true);
  assert.equal(hitDieOfPool(legacy), null);
  assert.equal(isHitDicePool(createResource('ki', 'Ki', 'custom', 3)), false);
});

test('characterHitDice counts one die per assigned class level, merged by size', () => {
  assert.deepEqual(characterHitDice(classed([{ classId: 'fighter', level: 5 }])), [
    { die: 10, count: 5 },
  ]);
  assert.deepEqual(
    characterHitDice(
      classed([
        { classId: 'wizard', level: 3 },
        { classId: 'fighter', level: 2 },
      ]),
    ),
    [
      { die: 6, count: 3 },
      { die: 10, count: 2 },
    ],
  );
  assert.deepEqual(
    characterHitDice(
      classed([
        { classId: 'cleric', level: 2 },
        { classId: 'rogue', level: 3 },
      ]),
    ),
    [{ die: 8, count: 5 }],
  );
  assert.deepEqual(characterHitDice(createCharacter('c1', 'Nim')), []);
  assert.deepEqual(
    characterHitDice({
      ...createCharacter('c1', 'Nim'),
      classes: [{ classId: 'bogus', level: 2 }],
    }),
    [],
  );
});

test('hpGainPerLevel is half the die plus one plus CON, floored at 1', () => {
  assert.equal(hpGainPerLevel(10, 0), 6);
  assert.equal(hpGainPerLevel(8, 2), 7);
  assert.equal(hpGainPerLevel(6, -5), 1);
});

test('classMaxHP follows the average rule and clamps level 1 to at least 1', () => {
  assert.equal(classMaxHP(fighter()), 10);
  assert.equal(classMaxHP(classed([{ classId: 'fighter', level: 3 }], 14)), 12 + 2 * 8);
  assert.equal(classMaxHP(classed([{ classId: 'fighter', level: 2 }], 1)), 5 + 1);
  const frail = classed([{ classId: 'wizard', level: 1 }], 0);
  assert.equal(classMaxHP(frail), 1);
  assert.equal(classMaxHP(createCharacter('c1', 'Nim')), null);
});

test('classMaxHP grants the first class the max die once and averages the rest', () => {
  const duo = classed(
    [
      { classId: 'fighter', level: 3 },
      { classId: 'wizard', level: 2 },
    ],
    14,
  );
  assert.equal(classMaxHP(duo), 12 + 2 * 8 + 2 * 6);
  const reversed = classed(
    [
      { classId: 'wizard', level: 2 },
      { classId: 'fighter', level: 3 },
    ],
    14,
  );
  assert.equal(classMaxHP(reversed), 8 + 1 * 6 + 3 * 8);
});

test('classMaxHP skips unknown classes and falls back to null when all are', () => {
  const mixed = classed(
    [
      { classId: 'bogus', level: 4 },
      { classId: 'fighter', level: 2 },
    ],
    14,
  );
  assert.equal(classMaxHP(mixed), 12 + 1 * 8);
  assert.equal(classMaxHP(classed([{ classId: 'bogus', level: 4 }])), null);
});

test('withHitDice builds one pool per die size, ordered after HP and slots', () => {
  let c = withSpellSlots(withHP(classed([{ classId: 'wizard', level: 3 }]), 10));
  c = addResource(c, createResource('ki', 'Ki', 'custom', 3));
  c = withHitDice(c);
  assert.deepEqual(
    c.resources.map((r) => r.id),
    ['hp', 'slots-1', 'slots-2', 'hit-dice-d6', 'ki'],
  );
  assert.deepEqual(dicePools(c), [{ id: 'hit-dice-d6', max: 3, current: 3 }]);

  const duo = withHitDice(
    classed([
      { classId: 'fighter', level: 2 },
      { classId: 'wizard', level: 1 },
    ]),
  );
  assert.deepEqual(dicePools(duo), [
    { id: 'hit-dice-d10', max: 2, current: 2 },
    { id: 'hit-dice-d6', max: 1, current: 1 },
  ]);
});

test('withHitDice replaces existing pools (legacy included) instead of stacking', () => {
  const c = withHitDice(withHitDice(fighter()));
  assert.equal(getHitDicePools(c).length, 1);
  const legacy = addResource(
    fighter(),
    createResource(LEGACY_HIT_DICE_ID, 'Hit Dice', 'custom', 3),
  );
  assert.deepEqual(dicePools(withHitDice(legacy)), [{ id: 'hit-dice-d10', max: 1, current: 1 }]);
  assert.deepEqual(dicePools(withHitDice(createCharacter('c1', 'Nim'))), []);
});

test('syncHitDice grows a pool keeping spent dice spent and shrinks cleanly', () => {
  let c = spendResource(
    withHitDice(classed([{ classId: 'fighter', level: 2 }])),
    'hit-dice-d10',
    1,
  );
  c = syncHitDice({ ...c, classes: [{ classId: 'fighter', level: 5 }], level: 5 });
  assert.deepEqual(dicePools(c), [{ id: 'hit-dice-d10', max: 5, current: 4 }]);

  const shrunk = syncHitDice({ ...c, classes: [{ classId: 'fighter', level: 2 }], level: 2 });
  assert.deepEqual(dicePools(shrunk), [{ id: 'hit-dice-d10', max: 2, current: 2 }]);
});

test('syncHitDice adds a new die size unspent and drops one no longer granted', () => {
  let c = spendResource(
    withHitDice(classed([{ classId: 'fighter', level: 2 }])),
    'hit-dice-d10',
    1,
  );
  c = syncHitDice({
    ...c,
    classes: [
      { classId: 'fighter', level: 2 },
      { classId: 'wizard', level: 1 },
    ],
    level: 3,
  });
  assert.deepEqual(dicePools(c), [
    { id: 'hit-dice-d10', max: 2, current: 1 },
    { id: 'hit-dice-d6', max: 1, current: 1 },
  ]);

  const dropped = syncHitDice({ ...c, classes: [{ classId: 'wizard', level: 3 }], level: 3 });
  assert.deepEqual(dicePools(dropped), [{ id: 'hit-dice-d6', max: 3, current: 3 }]);
});

test('syncHitDice converts a legacy pool, carrying the spent count', () => {
  const legacy = {
    ...classed([{ classId: 'fighter', level: 3 }]),
    resources: [{ id: LEGACY_HIT_DICE_ID, name: 'Hit Dice', type: 'custom', max: 3, current: 1 }],
  };
  assert.deepEqual(dicePools(syncHitDice(legacy)), [{ id: 'hit-dice-d10', max: 3, current: 1 }]);
});

test('syncHitDice preserves identity without a pool or a change', () => {
  const bare = fighter();
  assert.equal(syncHitDice(bare), bare);
  const pooled = withHitDice(bare);
  assert.equal(syncHitDice(pooled), pooled);
});

test('malformed level and missing stats fall back to level 1 and CON 10', () => {
  const zero = withHitDice({ ...fighter(), classes: [{ classId: 'fighter', level: 0 }] });
  assert.deepEqual(dicePools(zero), []);
  const statless = { ...withHitDice(withHP(fighter(), 10)), stats: undefined, level: NaN };
  assert.equal(classMaxHP(statless), 10);
  assert.equal(spendHitDie(statless, null, () => 0).healed, 1);
});

test('spendHitDie heals the roll plus CON and marks the die spent', () => {
  const c = spendResource(
    addResource(withHitDice(withHP(fighter(14), 20)), createResource('ki', 'Ki', 'custom', 3)),
    'hp',
    15,
  );
  const { character, healed, rolled } = spendHitDie(c, null, () => 0.5); // d10 -> 6
  assert.equal(rolled, 6);
  assert.equal(healed, 8);
  assert.equal(getHP(character).current, 13);
  assert.equal(getHitDicePools(character)[0].current, 0);
  assert.equal(character.resources.find((r) => r.id === 'ki').current, 3);
});

test('spendHitDie spends the requested die size, skipping drained pools', () => {
  let c = withHitDice(
    withHP(
      classed(
        [
          { classId: 'fighter', level: 2 },
          { classId: 'wizard', level: 2 },
        ],
        10,
      ),
      20,
    ),
  );
  c = spendResource(spendResource(c, 'hp', 10), 'hit-dice-d10', 2);
  const { character, rolled } = spendHitDie(c, null, () => 0.99); // d10 drained, d6 rolls 6
  assert.equal(rolled, 6);
  assert.deepEqual(dicePools(character), [
    { id: 'hit-dice-d10', max: 2, current: 0 },
    { id: 'hit-dice-d6', max: 2, current: 1 },
  ]);

  const picked = spendHitDie(c, 6, () => 0);
  assert.equal(picked.rolled, 1);
  assert.equal(getHitDicePools(picked.character)[1].current, 1);
  assert.deepEqual(
    spendHitDie(c, 10, () => 0),
    { character: c, healed: 0, rolled: 0 },
  );
});

test('spendHitDie rolls the primary class die for a legacy pool', () => {
  const legacy = {
    ...withHP(fighter(), 20),
    resources: [
      ...withHP(fighter(), 20).resources,
      { id: LEGACY_HIT_DICE_ID, name: 'Hit Dice', type: 'custom', max: 1, current: 1 },
    ],
  };
  const { rolled } = spendHitDie(spendResource(legacy, 'hp', 10), null, () => 0.99);
  assert.equal(rolled, 10);
  const classless = {
    ...createCharacter('c1', 'Nim'),
    resources: [{ id: LEGACY_HIT_DICE_ID, name: 'Hit Dice', type: 'custom', max: 1, current: 1 }],
  };
  assert.equal(spendHitDie(classless).character, classless);
});

test('spendHitDie never heals negative and clamps HP to max', () => {
  const drained = spendHitDie(withHitDice(withHP(fighter(1), 20)), null, () => 0); // roll 1, CON -5
  assert.equal(drained.healed, 0);
  assert.equal(getHP(drained.character).current, 20);
  assert.equal(getHitDicePools(drained.character)[0].current, 0);

  const full = spendHitDie(withHitDice(withHP(fighter(14), 20)), null, () => 0.99);
  assert.equal(getHP(full.character).current, 20);
});

test('spendHitDie is a no-op without dice or a pool', () => {
  const empty = spendResource(withHitDice(fighter()), 'hit-dice-d10', 1);
  assert.deepEqual(
    spendHitDie(empty, null, () => 0.5),
    { character: empty, healed: 0, rolled: 0 },
  );
  const bare = fighter();
  assert.equal(spendHitDie(bare).character, bare);
});

test('a short rest leaves hit dice spent; a long rest restores half of each pool', () => {
  let c = withHitDice(classed([{ classId: 'fighter', level: 5 }]));
  c = spendResource(c, 'hit-dice-d10', 5);
  assert.equal(getHitDicePools(shortRest(c))[0].current, 0);
  assert.equal(getHitDicePools(longRest(c))[0].current, 2);

  const one = spendResource(withHitDice(fighter()), 'hit-dice-d10', 1);
  assert.equal(getHitDicePools(longRest(one))[0].current, 1);
});

test('addXP defers HP and hit-die growth until the levels are assigned', () => {
  const c = withHitDice(withHP(fighter(14), 12)); // level 1, d10, CON +2
  const leveled = addXP(c, 320); // level 1 -> 3, both levels pending
  assert.equal(getHP(leveled).max, 12);
  assert.deepEqual(dicePools(leveled), [{ id: 'hit-dice-d10', max: 1, current: 1 }]);
  const assigned = assignLevel(assignLevel(leveled, 'fighter'), 'fighter');
  assert.equal(getHP(assigned).max, 12 + 2 * 8);
  assert.equal(getHP(assigned).current, 12 + 2 * 8);
  assert.deepEqual(dicePools(assigned), [{ id: 'hit-dice-d10', max: 3, current: 3 }]);
});

test('addXP leaves a multiclass character dice for pending levels unassigned', () => {
  const duo = withHitDice(
    classed([
      { classId: 'fighter', level: 1 },
      { classId: 'wizard', level: 1 },
    ]),
  );
  const leveled = addXP(duo, 300); // level 2 -> 3, pending until assigned
  assert.equal(leveled.level, 3);
  assert.deepEqual(dicePools(leveled), [
    { id: 'hit-dice-d10', max: 1, current: 1 },
    { id: 'hit-dice-d6', max: 1, current: 1 },
  ]);
});

test('addXP keeps the tenth-of-max fallback for a classless character', () => {
  const c = withHP(createCharacter('c1', 'Nim'), 30);
  assert.equal(getHP(addXP(c, 100)).max, 33);
});

test('addXP honors an explicit hpGrowth override past the class rule', () => {
  const c = withHP(fighter(14), 12);
  assert.equal(getHP(addXP(c, 100, { hpGrowth: 1 })).max, 13);
});
