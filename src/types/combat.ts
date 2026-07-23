/** One combatant in the initiative order. */
export interface Participant {
  id: string;
  name: string;
  side: 'party' | 'foe';
  initiative: number;
  /** DEX-derived bonus added to this combatant's initiative roll. */
  modifier: number;
}

/** A running combat: the sorted order, the round number, and whose turn it is. */
export interface CombatState {
  round: number;
  /** Index into `order` of the participant currently acting. */
  index: number;
  order: Participant[];
}
