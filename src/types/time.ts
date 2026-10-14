/** In-game clock: a day counter, plus an index into the watches of a day. */
export interface GameClock {
  day: number;
  /** Index into the day's watches (see WATCHES in time/GameClock.js). */
  watch: number;
  /** Minutes spent inside the current watch by travel, 0 to 239. Absent at
   * the start of a watch. See advanceMinutes in time/GameClock.js. */
  minutes?: number;
}

/**
 * Optional calendar names for a campaign. A campaign without a calendar
 * counts days only ("Day 3, Dusk"). See time/Calendar.js.
 */
export interface Calendar {
  /** Month names in order. Empty means no months. */
  months: string[];
  /** Days in each month, 1 or more. */
  daysPerMonth: number;
  /** Season names in order. They split the year into equal parts. Empty
   * means no seasons. */
  seasons: string[];
  /** True when each new day rolls its weather at Dawn. */
  weather: boolean;
  /** The weather rolled for one day. Absent until the first roll. */
  today?: { day: number; text: string };
}
