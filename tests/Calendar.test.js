import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DAYS_PER_MONTH,
  calendarDate,
  coerceCalendar,
  dateLine,
  formatDate,
  nameList,
} from '../src/time/Calendar.js';

const calendar = (over = {}) => ({
  months: ['Hammer', 'Alturiak', 'Ches', 'Tarsakh'],
  daysPerMonth: 10,
  seasons: ['Winter', 'Spring'],
  weather: false,
  ...over,
});

test('nameList keeps trimmed, unique, non-empty strings', () => {
  assert.deepEqual(nameList(['  A ', 'A', '', 3, null, 'B']), ['A', 'B']);
  assert.deepEqual(nameList('A,B'), []);
  assert.equal(nameList(['x'.repeat(99)])[0].length, 40);
  assert.equal(nameList(Array.from({ length: 30 }, (_, i) => `M${i}`)).length, 24);
});

test('coerceCalendar reads null for no record or an empty calendar', () => {
  assert.equal(coerceCalendar(null), null);
  assert.equal(coerceCalendar('x'), null);
  assert.equal(coerceCalendar({ months: [], seasons: [], weather: false }), null);
});

test('coerceCalendar repairs the day length and keeps a valid weather roll', () => {
  assert.deepEqual(coerceCalendar({ weather: true, daysPerMonth: 'x' }), {
    months: [],
    daysPerMonth: DEFAULT_DAYS_PER_MONTH,
    seasons: [],
    weather: true,
  });
  assert.equal(coerceCalendar({ months: ['A'], daysPerMonth: -3 })?.daysPerMonth, 1);
  assert.equal(coerceCalendar({ months: ['A'], daysPerMonth: 900 })?.daysPerMonth, 400);
  assert.deepEqual(coerceCalendar({ weather: true, today: { day: 3, text: 'Fog' } })?.today, {
    day: 3,
    text: 'Fog',
  });
  assert.equal(
    'today' in (coerceCalendar({ weather: true, today: { day: 0, text: 'Fog' } }) ?? {}),
    false,
  );
  assert.equal(
    'today' in (coerceCalendar({ weather: true, today: { day: 2, text: '' } }) ?? {}),
    false,
  );
  assert.equal('today' in (coerceCalendar({ weather: true, today: 'Fog' }) ?? {}), false);
});

test('calendarDate counts months and seasons from day 1', () => {
  assert.deepEqual(calendarDate(1, calendar()), {
    month: 'Hammer',
    dayOfMonth: 1,
    season: 'Winter',
  });
  assert.deepEqual(calendarDate(13, calendar()), {
    month: 'Alturiak',
    dayOfMonth: 3,
    season: 'Winter',
  });
  assert.deepEqual(calendarDate(21, calendar()), {
    month: 'Ches',
    dayOfMonth: 1,
    season: 'Spring',
  });
  // The year wraps after the last month.
  assert.deepEqual(calendarDate(41, calendar()), {
    month: 'Hammer',
    dayOfMonth: 1,
    season: 'Winter',
  });
  assert.equal(calendarDate(0, calendar()).dayOfMonth, 1);
});

test('calendarDate splits a year of 12 months among the seasons when no months are named', () => {
  const seasonsOnly = calendar({ months: [], seasons: ['Summer', 'Winter'] });
  assert.equal(calendarDate(1, seasonsOnly).season, 'Summer');
  assert.equal(calendarDate(61, seasonsOnly).season, 'Winter');
  assert.equal(calendarDate(1, seasonsOnly).month, '');
});

test('formatDate names the day of the month and the season', () => {
  assert.equal(formatDate(13, calendar()), '3 Alturiak, Winter');
  assert.equal(formatDate(13, calendar({ seasons: [] })), '3 Alturiak');
  assert.equal(formatDate(13, calendar({ months: [] })), 'Winter');
  assert.equal(formatDate(13, calendar({ months: [], seasons: [] })), '');
  assert.equal(formatDate(13, null), '');
});

test('dateLine adds the weather rolled for the same day', () => {
  const today = { day: 13, text: 'Fog' };
  assert.equal(dateLine(13, calendar({ today })), '3 Alturiak, Winter. Weather: Fog');
  assert.equal(dateLine(14, calendar({ today })), '4 Alturiak, Winter');
  assert.equal(dateLine(13, calendar({ months: [], seasons: [], today })), 'Weather: Fog');
  assert.equal(dateLine(13, null), '');
});
