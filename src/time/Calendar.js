import { clampInt } from '../util/num.js';
import { isRecord } from '../util/isRecord.js';

/** @typedef {import('../types/time.js').Calendar} Calendar */

/** The days in a month when the GM names months but sets no length. */
export const DEFAULT_DAYS_PER_MONTH = 30;

/** The most names one month or season list keeps, and the longest name. */
const MAX_NAMES = 24;
const MAX_NAME_LENGTH = 40;

/**
 * A list of clean names: strings only, trimmed, cut to a length, with no
 * blanks and no repeats.
 * @param {unknown} value
 * @returns {string[]}
 */
export function nameList(value) {
  if (!Array.isArray(value)) return [];
  const names = value
    .filter((name) => typeof name === 'string')
    .map((name) => name.trim().slice(0, MAX_NAME_LENGTH))
    .filter(Boolean);
  return [...new Set(names)].slice(0, MAX_NAMES);
}

/**
 * The calendar of a save, or null when the save has none. A calendar with
 * no months, no seasons, and no weather roll reads as null too, so an empty
 * settings form leaves the save as it was.
 * @param {unknown} value
 * @returns {Calendar | null}
 */
export function coerceCalendar(value) {
  if (!isRecord(value)) return null;
  const months = nameList(value.months);
  const seasons = nameList(value.seasons);
  const weather = value.weather === true;
  if (months.length === 0 && seasons.length === 0 && !weather) return null;
  const today = isRecord(value.today) ? value.today : {};
  const day = Number.isInteger(today.day) && today.day >= 1 ? today.day : 0;
  return {
    months,
    daysPerMonth: clampInt(value.daysPerMonth, 1, 400, DEFAULT_DAYS_PER_MONTH),
    seasons,
    weather,
    ...(day > 0 && typeof today.text === 'string' && today.text
      ? { today: { day, text: today.text } }
      : {}),
  };
}

/**
 * The calendar date of a day number. Day 1 is the first day of the first
 * month. The year has one month per name, or 12 when the calendar names
 * seasons only, and the seasons split it into equal runs of months.
 * @param {number} day
 * @param {Calendar} calendar
 * @returns {{ month: string, dayOfMonth: number, season: string }}
 */
export function calendarDate(day, calendar) {
  const { months, seasons, daysPerMonth } = calendar;
  const monthCount = months.length || 12;
  const index = Math.floor((Math.max(1, day) - 1) / daysPerMonth);
  const monthIndex = index % monthCount;
  return {
    month: months[monthIndex] ?? '',
    dayOfMonth: ((Math.max(1, day) - 1) % daysPerMonth) + 1,
    season: seasons[Math.floor((monthIndex * seasons.length) / monthCount)] ?? '',
  };
}

/**
 * The calendar line of a day, such as "3 Alturiak, Winter", or an empty
 * string when the calendar names no months and no seasons.
 * @param {number} day
 * @param {Calendar | null} calendar
 * @returns {string}
 */
export function formatDate(day, calendar) {
  if (!calendar) return '';
  const { month, dayOfMonth, season } = calendarDate(day, calendar);
  return [month && `${dayOfMonth} ${month}`, season].filter(Boolean).join(', ');
}

/**
 * The line under the clock readout: the calendar date, then the weather when
 * it was rolled for this day. Empty when there is neither.
 * @param {number} day
 * @param {Calendar | null} calendar
 * @returns {string}
 */
export function dateLine(day, calendar) {
  const date = formatDate(day, calendar);
  const today = calendar?.today?.day === day ? `Weather: ${calendar.today.text}` : '';
  return [date, today].filter(Boolean).join('. ');
}
