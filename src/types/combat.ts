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
  /**
   * What this combatant already spent on the current turn. Absent on a
   * participant from a save written before the budget existed, which reads as
   * a fresh turn.
   */
  used?: ActionBudget;
  /**
   * Whether the combatant starts the fight surprised. Its first turn has no
   * action and no bonus action, and it has no reaction until that turn ends.
   * The flag goes away when that turn ends.
   */
  surprised?: boolean;
}

/** One kind of turn expenditure. Movement is absent: see `ActionBudget`. */
export type ActionCost = 'action' | 'bonus' | 'reaction';

/**
 * A once-per-turn allowance that costs no action. Sneak Attack damage rides an
 * attack that already paid for itself, and a dying character rolls one death
 * save on its turn. The two spell flags feed the bonus action spell rule.
 */
export type TurnFlag = 'sneak' | 'deathSave' | 'bonusSpell' | 'actionSpell';

/**
 * What one combatant already spent this turn. The three costs are booleans,
 * because a turn holds one of each. Movement has no entry, because nothing in
 * the app moves a token by feet yet.
 */
export interface ActionBudget {
  action: boolean;
  bonus: boolean;
  reaction: boolean;
  /**
   * Weapon swings still owed by an Attack action already spent. Extra Attack
   * banks one here, so the second swing of the turn costs nothing.
   */
  attacksLeft: number;
  /**
   * Whether the turn's action went to a weapon swing. The `action` flag alone
   * cannot say, because a cast spends it too, and two-weapon fighting needs
   * the Attack action specifically.
   */
  attacked: boolean;
  /**
   * Whether a weapon swing of the Attack action this turn used a light melee
   * weapon. Two-weapon fighting needs it for the off-hand swing.
   */
  lightAttack: boolean;
  /** Whether Sneak Attack damage was already added once this turn. */
  sneak: boolean;
  /** Whether a dying character already rolled its death save this turn. */
  deathSave: boolean;
  /** Whether a spell was cast with the bonus action this turn (see `SpellRule.js`). */
  bonusSpell: boolean;
  /** Whether a spell of 1st level or higher was cast with the action this turn. */
  actionSpell: boolean;
  /**
   * Whether the extra action of a chip such as Haste is spent. The extra
   * action buys one weapon swing, and nothing banks behind it.
   */
  extra: boolean;
  /**
   * Whether Action Surge already gave this turn its second action. 5e allows
   * one surge per turn, even for a fighter with two uses.
   */
  surged: boolean;
  /**
   * Whether Action Surge, taken before the turn's action, left a second
   * action waiting. The first spend of the action uses this one instead, so
   * the action stays free for one more full action.
   */
  spare: boolean;
  /**
   * How many legendary actions the creature spent since the start of its own
   * turn. The count goes back to 0 when its next turn starts.
   */
  legendary: number;
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
