import test from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_TABLE, dawnWeather, rollWeather } from '../src/time/Weather.js';

const total = WEATHER_TABLE.reduce((sum, row) => sum + row.weight, 0);
const at = (/** @type {number} */ n) => () => n / total;

test('rollWeather walks the weighted table', () => {
  assert.equal(rollWeather(at(0)), 'Clear skies');
  assert.equal(rollWeather(at(5)), 'Overcast');
  assert.equal(rollWeather(at(total - 1)), 'Heat wave');
});

test('rollWeather uses the cold text in a winter season', () => {
  assert.equal(rollWeather(at(9), 'Deep Winter'), 'Light snow');
  assert.equal(rollWeather(at(9), 'Spring'), 'Light rain');
  assert.equal(rollWeather(at(0), 'winter'), 'Clear skies');
});

test('rollWeather falls back to the first row for an out-of-range roll', () => {
  assert.equal(
    rollWeather(() => 1),
    'Clear skies',
  );
});

test('dawnWeather rolls once for each new day with weather turned on', () => {
  const calendar = { months: [], daysPerMonth: 30, seasons: [], weather: true };
  assert.equal(dawnWeather(null, 2, at(0)), null);
  assert.equal(dawnWeather({ ...calendar, weather: false }, 2, at(0)), null);
  assert.equal(dawnWeather({ ...calendar, today: { day: 2, text: 'Fog' } }, 2, at(0)), null);
  assert.deepEqual(dawnWeather({ ...calendar, today: { day: 2, text: 'Fog' } }, 4, at(0)), {
    calendar: { ...calendar, today: { day: 4, text: 'Clear skies' } },
    line: 'Day 4 weather: Clear skies.',
  });
  assert.equal(dawnWeather(calendar, 1, at(0))?.calendar.today?.day, 1);
});
