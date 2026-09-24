import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameClock } from '../src/storage/RecordCoercion.js';
import { advanceWatches } from '../src/time/GameClock.js';

test('gameClock keeps a valid clock and drops a value that is not a record', () => {
  assert.deepEqual(gameClock({ day: 3, watch: 4 }), { day: 3, watch: 4 });
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
