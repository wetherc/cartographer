import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WATCHES,
  createClock,
  advanceWatches,
  advanceMinutes,
  advanceToDawn,
  formatClock,
  formatMinutes,
  crossesInto,
  minutesUntil,
  longRestClock,
  offersRestUntilDawn,
  formatWatchProgress,
} from '../src/time/GameClock.js';

test('advanceMinutes adds up inside a watch and rolls over into the next', () => {
  const half = advanceMinutes(createClock(), 120);
  assert.deepEqual(half, { day: 1, watch: 0, minutes: 120 });
  assert.deepEqual(advanceMinutes(half, 120), { day: 1, watch: 1 });
  assert.deepEqual(advanceMinutes(half, 1570), { day: 2, watch: 1, minutes: 10 });
  assert.deepEqual(advanceMinutes(half, -5), half);
  assert.deepEqual(advanceWatches(half, 1), { day: 1, watch: 1, minutes: 120 }, 'keeps minutes');
  assert.deepEqual(advanceToDawn(half), { day: 2, watch: 0 });
});
import {
  withHP,
  getHP,
  shortRest,
  longRest,
  gainsLongRest,
  createCharacter,
  spendResource,
  addResource,
} from '../src/entities/Character.js';
import { createResource } from '../src/entities/Resource.js';
import { dropToDying, isDead, isDying, killOutright } from '../src/entities/DeathSaves.js';

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
  assert.equal(formatClock({ day: 3, watch: 4 }), 'Day 3, Dusk');
});

test('formatClock falls back to the first watch for an out-of-range index', () => {
  assert.equal(formatClock({ day: 2, watch: 99 }), 'Day 2, Dawn');
});

test('longRest fully restores every pool; shortRest refills only short-rest pools', () => {
  let hero = withHP(createCharacter('h', 'Hero'), 20);
  hero = addResource(hero, { ...createResource('focus', 'Focus', 'custom', 4), recharge: 'short' });
  hero = addResource(hero, createResource('torch', 'Torch', 'custom', 3));
  hero = spendResource(spendResource(hero, 'hp', 16), 'focus', 4); // down to 4/20 HP
  hero = spendResource(hero, 'torch', 3);
  const pool = (/** @type {typeof hero} */ c, /** @type {string} */ id) =>
    c.resources.find((r) => r.id === id)?.current;
  const short = shortRest(hero);
  assert.equal(getHP(short).current, 4, 'a short rest heals no HP');
  assert.equal(pool(short, 'focus'), 4, 'a short-rest pool refills in full');
  assert.equal(pool(short, 'torch'), 0, 'a pool with no recharge waits for a long rest');
  const long = longRest(hero);
  assert.equal(getHP(long).current, 20);
  assert.equal(pool(long, 'focus'), 4);
  assert.equal(pool(long, 'torch'), 3);
});

test('longRest eases one level of exhaustion, and a short rest eases none', () => {
  const tired = { ...withHP(createCharacter('h', 'Hero'), 20), exhaustion: 3 };
  assert.equal(longRest(tired).exhaustion, 2);
  assert.equal(shortRest(tired).exhaustion, 3);
  assert.equal(longRest({ ...tired, exhaustion: 0 }).exhaustion, 0);
});

test('longRest leaves a dead character at the level that killed it', () => {
  const hero = { ...withHP(createCharacter('h', 'Hero'), 20), exhaustion: 6 };
  const dead = killOutright(hero);
  const rested = longRest(dead);
  assert.equal(rested.exhaustion, 6, 'a rest cannot walk death back');
  assert.equal(isDead(rested), true);
});

test('a long rest gives a character at 0 HP nothing', () => {
  const hero = withHP(createCharacter('h', 'Hero'), 12);
  const dying = dropToDying(spendResource(hero, 'hp', 12));
  assert.equal(isDying(dying), true);
  assert.equal(gainsLongRest(dying), false);
  assert.equal(longRest(dying), dying, 'HP, death saves, and pools stay as they are');
  const stable = { ...dying, deathSaves: { successes: 0, failures: 0, stable: true } };
  assert.equal(longRest(stable), stable);
  assert.equal(isDying(shortRest(dying)), true, 'a short rest heals nothing, so it stays');
});

test('a long rest heals a character at 1 HP to full', () => {
  const hero = spendResource(withHP(createCharacter('h', 'Hero'), 12), 'hp', 11);
  assert.equal(gainsLongRest(hero), true);
  assert.equal(getHP(longRest(hero)).current, 12);
});

test('a character with no HP pool still gains a long rest', () => {
  const blank = { ...createCharacter('h', 'Hero'), resources: [] };
  assert.equal(gainsLongRest(blank), true);
});

test('formatMinutes reads a walk in hours and minutes', () => {
  assert.equal(formatMinutes(30), '30 minutes');
  assert.equal(formatMinutes(1), '1 minute');
  assert.equal(formatMinutes(60), '1 hour');
  assert.equal(formatMinutes(240), '4 hours');
  assert.equal(formatMinutes(270), '4 hours 30 minutes');
  assert.equal(formatMinutes(0), '0 minutes');
  assert.equal(formatMinutes(-5), '0 minutes');
});

test('minutesUntil counts to the next start of a watch', () => {
  const afternoon = { day: 2, watch: 3, minutes: 60 };
  assert.equal(minutesUntil(afternoon, 'Night'), 420);
  assert.equal(minutesUntil({ day: 1, watch: 5 }, 'Night'), 1440, 'inside it: the next day');
  assert.equal(minutesUntil({ day: 1, watch: 5, minutes: 30 }, 'Dawn'), 210);
});

test('crossesInto tells whether a stretch of time reaches a watch', () => {
  const afternoon = { day: 2, watch: 3, minutes: 60 };
  assert.equal(crossesInto(afternoon, 419, 'Night'), false);
  assert.equal(crossesInto(afternoon, 420, 'Night'), true, 'landing on its start');
  assert.equal(crossesInto(afternoon, 1000, 'Night'), true, 'passing through it');
  assert.equal(crossesInto({ day: 2, watch: 5 }, 1000, 'Night'), false, 'already in it');
});

test('longRestClock rests eight hours and keeps the minutes', () => {
  assert.deepEqual(longRestClock({ day: 3, watch: 1 }), { day: 3, watch: 3 });
  assert.deepEqual(longRestClock({ day: 3, watch: 5, minutes: 30 }), {
    day: 4,
    watch: 1,
    minutes: 30,
  });
});

test('only Afternoon and Dusk offer a long rest until Dawn', () => {
  const offers = WATCHES.map((_, watch) => offersRestUntilDawn({ day: 1, watch }));
  assert.deepEqual(offers, [false, false, false, true, true, false]);
});

test('formatWatchProgress names the time spent inside the current watch', () => {
  assert.equal(formatWatchProgress(createClock()), 'Start of the watch');
  assert.equal(formatWatchProgress(advanceMinutes(createClock(), 30)), '30 minutes in');
  assert.equal(formatWatchProgress(advanceMinutes(createClock(), 210)), '3 hours 30 minutes in');
  // Advance passes four hours and keeps the minutes already spent.
  const advanced = advanceWatches(advanceMinutes(createClock(), 210), 1);
  assert.equal(formatClock(advanced), 'Day 1, Morning');
  assert.equal(formatWatchProgress(advanced), '3 hours 30 minutes in');
});
