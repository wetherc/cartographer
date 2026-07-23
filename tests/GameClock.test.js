import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WATCHES,
  createClock,
  advanceWatches,
  advanceToDawn,
  formatClock,
} from '../src/time/GameClock.js';
import { withHP, getHP, shortRest, longRest, createCharacter, spendResource } from '../src/entities/Character.js';

test('createClock starts at dawn of day 1', () => {
  assert.deepEqual(createClock(), { day: 1, watch: 0 });
});

test('advanceWatches rolls the day over past the last watch', () => {
  const clock = { day: 1, watch: WATCHES.length - 1 };
  assert.deepEqual(advanceWatches(clock, 1), { day: 2, watch: 0 });
  assert.deepEqual(advanceWatches({ day: 1, watch: 0 }, WATCHES.length + 1), { day: 2, watch: 1 });
});

test('advanceWatches never runs backward', () => {
  assert.deepEqual(advanceWatches({ day: 2, watch: 3 }, -5), { day: 2, watch: 3 });
});

test('advanceToDawn moves to the next day at watch 0', () => {
  assert.deepEqual(advanceToDawn({ day: 4, watch: 3 }), { day: 5, watch: 0 });
  assert.deepEqual(advanceToDawn({ day: 4, watch: 0 }), { day: 5, watch: 0 });
});

test('formatClock reads day and watch name', () => {
  assert.equal(formatClock({ day: 3, watch: 4 }), `Day 3, ${WATCHES[4]}`);
});

test('longRest fully restores every pool; shortRest restores half', () => {
  let hero = withHP(createCharacter('h', 'Hero'), 20);
  hero = spendResource(hero, 'hp', 16); // down to 4/20
  const short = shortRest(hero);
  assert.equal(getHP(short).current, 14); // 4 + ceil(20*0.5)=10
  const long = longRest(hero);
  assert.equal(getHP(long).current, 20);
});
