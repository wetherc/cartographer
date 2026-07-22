export type QuestStatus = 'active' | 'completed';

/** A GM-authored quest or objective tracked across sessions. */
export interface Quest {
  id: string;
  title: string;
  /** Free-form GM notes: objectives, leads, session recap. */
  notes: string;
  status: QuestStatus;
}
