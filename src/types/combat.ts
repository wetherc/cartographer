/**
 * One combatant in the initiative order: an id and the numbers the order is
 * built from, and nothing else. Everything presentational, the combatant's
 * name and which side it fights on, is resolved from the live entity when a
 * panel draws. This way a rename or a disposition change during a fight
 * shows up, instead of staying frozen at the moment combat started.
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
   * log column shows only travelogue entries at or after this time, so the
   * fight's log starts at its own initiative rolls, not the campaign's first
   * battle. An older save has 0 here, which shows every entry.
   */
  startedAt: number;
}
