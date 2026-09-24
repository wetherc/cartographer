export type QuestStatus = 'active' | 'completed';

/** A GM-authored quest or objective, tracked across sessions. */
export interface Quest {
  id: string;
  title: string;
  /** Free-form GM notes: objectives, leads, session recaps. Only a GM tab shows them. */
  notes: string;
  status: QuestStatus;
  /** True when players can see the quest title and status. Authored hidden, revealed on demand. */
  revealed: boolean;
}
