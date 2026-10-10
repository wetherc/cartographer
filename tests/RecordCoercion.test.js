import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combatState, gameClock, quests, uniqueIds } from '../src/storage/RecordCoercion.js';
import { advanceWatches } from '../src/time/GameClock.js';

test('gameClock keeps a valid clock and drops a value that is not a record', () => {
  assert.deepEqual(gameClock({ day: 3, watch: 4 }), { day: 3, watch: 4 });
  assert.deepEqual(gameClock({ day: 3, watch: 4, minutes: 90 }), { day: 3, watch: 4, minutes: 90 });
  assert.deepEqual(gameClock({ day: 3, watch: 4, minutes: 999 }), {
    day: 3,
    watch: 4,
    minutes: 239,
  });
  assert.equal(gameClock(null), null);
  assert.equal(gameClock('Day 3'), null);
  assert.equal(gameClock([1, 2]), null);
});

test('gameClock coerces a string watch, so advancing it adds instead of joining', () => {
  const clock = gameClock({ day: 1, watch: '5' });
  assert.deepEqual(clock, { day: 1, watch: 5 });
  assert.deepEqual(advanceWatches(/** @type {any} */ (clock), 1), { day: 2, watch: 0 });
});

test('gameClock fills a missing day and resets a watch outside the day', () => {
  assert.deepEqual(gameClock({}), { day: 1, watch: 0 });
  assert.deepEqual(gameClock({ day: 0, watch: -2 }), { day: 1, watch: 0 });
  assert.deepEqual(gameClock({ day: '4.7', watch: 6 }), { day: 4, watch: 0 });
});

test('combatState keeps the surprised flag only when it is true', () => {
  const state = combatState({
    round: 1,
    index: 0,
    order: [
      { id: 'a', initiative: 12, modifier: 1, surprised: true },
      { id: 'b', initiative: 8, modifier: 0, surprised: 'yes' },
    ],
  });
  assert.equal(state?.order[0].surprised, true);
  assert.equal('surprised' in (state?.order[1] ?? {}), false);
});

test('quests reads the unlock list as unique string ids, and a missing list as empty', () => {
  const [one, two] = quests([
    { id: 'a', unlocks: ['b', 'b', '', 3, 'c'] },
    { id: 'b', unlocks: 'c' },
  ]);
  assert.deepEqual(one.unlocks, ['b', 'c']);
  assert.deepEqual(two.unlocks, []);
});

test('quests keep a paying reward and drop one that pays nothing', () => {
  const [paid, empty] = quests([
    { id: 'a', reward: { gp: 25, xp: 0, per: 'total' } },
    { id: 'b', reward: { gp: 0, xp: 0 } },
  ]);
  assert.deepEqual(paid.reward, { gp: 25, xp: 0, per: 'total' });
  assert.equal('reward' in empty, false);
});

test('uniqueIds renames each repeat and returns a list with no repeat as is', () => {
  const clean = [{ id: 'a' }, { id: 'b' }, {}];
  assert.equal(uniqueIds(clean), clean);
  const first = { id: 'w', hp: 1 };
  const out = uniqueIds([first, { id: 'w', hp: 2 }, { id: 'w', hp: 3 }, { id: 5 }, { id: 5 }]);
  assert.equal(out[0], first, 'the first entry keeps its object');
  assert.deepEqual(
    out.map((e) => e.id),
    ['w', 'w-2', 'w-3', 5, 5],
  );
  assert.equal(out[2].hp, 3);
});
