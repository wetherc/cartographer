/** What produced a travelogue entry, used only to tag and style rows. */
export type LogEntryKind = 'travel' | 'combat' | 'note' | 'rest' | 'roll';

/** The share of the travelogue that an entry kind counts against. Story is
 * travel, notes, and rests. Chatter is rolls and fight lines. */
export type LogBudget = 'story' | 'chatter';

/** One automatically recorded event in the party's travelogue. */
export interface LogEntry {
  id: string;
  /** Epoch milliseconds when the event was logged. */
  at: number;
  kind: LogEntryKind;
  /** The line the GM reads. */
  message: string;
  /** True when `message` names something only the GM sees, such as a foe's
   * exact HP or save bonus. A Player tab shows `player` in its place, or
   * leaves the entry out. Absent means every viewer reads `message`. */
  gm?: true;
  /** The line a Player tab shows for a GM-only entry. Absent on a GM-only
   * entry means a Player tab leaves the entry out. */
  player?: string;
  /** The in-game day and watch when the event was logged. Absent on an
   * entry from a save without it, which then shows the wall-clock time. */
  clock?: { day: number; watch: number };
  /** The combat round when the event was logged during a fight. */
  round?: number;
}

/** When a new entry happened, in game terms. */
export interface LogStamp {
  clock?: { day: number; watch: number };
  round?: number;
}

/** Who may read a logged line. `player` is the line a Player tab shows in
 * place of the GM's, and it marks the entry GM-only too. */
export interface LogOptions {
  gm?: boolean;
  player?: string;
}
