/**
 * One combatant in the initiative order: an id and the numbers the order is
 * built from, nothing else. Everything presentational — the combatant's name
 * and which side it fights on — is resolved from the live entity when a panel
 * draws, so a rename or a disposition change during a fight is picked up
 * instead of being frozen at the moment combat started.
 */
export interface Participant {
  id: string;
  initiative: number;
  /** DEX-derived bonus added to this combatant's initiative roll. */
  modifier: number;
}

/** How a participant is presented, derived from the entity holding its id. */
export interface ParticipantView {
  name: string;
  side: 'party' | 'foe';
}

/** A running combat: the sorted order, the round number, and whose turn it is. */
export interface CombatState {
  round: number;
  /** Index into `order` of the participant currently acting. */
  index: number;
  order: Participant[];
  /**
   * Epoch milliseconds when this fight's setup opened. The combat screen's
   * log column shows only travelogue entries at or after this, so the fight's
   * log starts at its own initiative rolls rather than the campaign's first
   * battle. 0 in an older save, which shows everything.
   */
  startedAt: number;
}
