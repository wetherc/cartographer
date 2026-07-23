/** In-game clock: a day counter plus an index into the watches of a day. */
export interface GameClock {
  day: number;
  /** Index into the day's watches (see WATCHES in time/GameClock.js). */
  watch: number;
}
