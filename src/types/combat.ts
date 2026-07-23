/** One combatant in the initiative order. */
export interface Participant {
  id: string;
  name: string;
  side: 'party' | 'foe';
  initiative: number;
}

/** A running combat: the sorted order, the round number, and whose turn it is. */
export interface CombatState {
  round: number;
  /** Index into `order` of the participant currently acting. */
  index: number;
  order: Participant[];
}
