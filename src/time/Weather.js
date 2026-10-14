import { calendarDate } from './Calendar.js';

/** @typedef {import('../types/time.js').Calendar} Calendar */

/**
 * The weather table: each row has a weight and its text. A row with a
 * `cold` text uses it in a season whose name says winter.
 * @type {readonly { weight: number, text: string, cold?: string }[]}
 */
export const WEATHER_TABLE = Object.freeze([
  { weight: 5, text: 'Clear skies' },
  { weight: 4, text: 'Overcast' },
  { weight: 3, text: 'Light rain', cold: 'Light snow' },
  { weight: 2, text: 'Strong wind' },
  { weight: 2, text: 'Fog' },
  { weight: 2, text: 'Heavy rain', cold: 'Heavy snow' },
  { weight: 1, text: 'Thunderstorm', cold: 'Blizzard' },
  { weight: 1, text: 'Heat wave', cold: 'Bitter cold' },
]);

const TOTAL = WEATHER_TABLE.reduce((sum, row) => sum + row.weight, 0);

/**
 * Roll the weather for one day. A season named like "Winter" turns rain into
 * snow and heat into cold.
 * @param {() => number} rng returns a number in [0, 1)
 * @param {string} [season]
 * @returns {string}
 */
export function rollWeather(rng, season = '') {
  let roll = Math.floor(rng() * TOTAL);
  const cold = /winter/i.test(season);
  for (const row of WEATHER_TABLE) {
    roll -= row.weight;
    if (roll < 0) return cold && row.cold ? row.cold : row.text;
  }
  return WEATHER_TABLE[0].text;
}

/**
 * The weather of the current day, when the calendar rolls weather and the
 * day has no roll yet. The clock reaches a new day at Dawn, so this rolls
 * once per Dawn. A move that crosses several Dawns rolls only for the last
 * day, the one the party is in. Returns null when no roll is due.
 * @param {Calendar | null} calendar
 * @param {number} day the day of the clock now
 * @param {() => number} rng
 * @returns {{ calendar: Calendar, line: string } | null}
 */
export function dawnWeather(calendar, day, rng) {
  if (!calendar?.weather || day <= (calendar.today?.day ?? 0)) return null;
  const text = rollWeather(rng, calendarDate(day, calendar).season);
  return {
    calendar: { ...calendar, today: { day, text } },
    line: `Day ${day} weather: ${text}.`,
  };
}
