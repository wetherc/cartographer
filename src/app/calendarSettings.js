import { promptModal } from '../ui/Modal.js';
import { DEFAULT_DAYS_PER_MONTH, coerceCalendar } from '../time/Calendar.js';
import { dawnWeather } from '../time/Weather.js';
import { splitTrimmedList } from '../util/text.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Open the calendar settings: month names, the days in a month, season
 * names, and the weather roll at Dawn. Clearing every field removes the
 * calendar, and the clock shows the day count only. Turning the weather on
 * rolls the weather of the current day at once. Resolves to true when the
 * GM saves.
 * @param {AppContext} app
 * @returns {Promise<boolean>}
 */
export async function editCalendar(app) {
  const { state } = app;
  const current = state.calendar;
  const values = await promptModal(
    'Calendar',
    [
      {
        name: 'months',
        label: 'Month names, in order',
        type: 'tags',
        value: (current?.months ?? []).join(','),
      },
      {
        name: 'daysPerMonth',
        label: 'Days in a month',
        type: 'number',
        min: 1,
        max: 400,
        value: current?.daysPerMonth ?? DEFAULT_DAYS_PER_MONTH,
      },
      {
        name: 'seasons',
        label: 'Season names, in order (they split the year evenly)',
        type: 'tags',
        value: (current?.seasons ?? []).join(','),
      },
      {
        name: 'weather',
        label: 'Roll the weather at each Dawn',
        type: 'checkbox',
        value: current?.weather ?? false,
      },
    ],
    { submitLabel: 'Save' },
  );
  if (!values) return false;
  state.calendar = coerceCalendar({
    months: splitTrimmedList(values.months),
    daysPerMonth: Number(values.daysPerMonth),
    seasons: splitTrimmedList(values.seasons),
    weather: values.weather === '1',
    today: current?.today,
  });
  rollDawnWeather(app);
  app.actions.markDirty();
  return true;
}

/**
 * Roll the weather of the current day when the calendar asks for it and the
 * day has no roll yet, and log the result. Every clock move calls this, so
 * the roll happens once at each Dawn.
 * @param {AppContext} app
 * @param {() => number} [rng]
 */
export function rollDawnWeather(app, rng = Math.random) {
  const { state } = app;
  const rolled = dawnWeather(state.calendar, state.clock.day, rng);
  if (!rolled) return;
  state.calendar = rolled.calendar;
  app.actions.logEvent('note', rolled.line);
}
