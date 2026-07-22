/** What produced a travelogue entry, used only to tag/style rows. */
export type LogEntryKind = 'travel' | 'combat' | 'note';

/** One automatically-recorded event in the party's travelogue. */
export interface LogEntry {
  id: string;
  /** Epoch milliseconds when the event was logged. */
  at: number;
  kind: LogEntryKind;
  message: string;
}
