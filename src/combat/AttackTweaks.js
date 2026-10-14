import { attacksAvailable, budgetOf, canSpend } from './ActionBudget.js';
import { coerceLegendary, coerceMultiattack } from '../entities/CreatureAttacks.js';

/**
 * The answers of the weapon attack dialog, read into the overrides that one
 * swing takes, and the three kinds of swing with what each one costs.
 * `app/weaponAttack.js` rolls the swing, and `app/attackFields.js` builds the
 * dialog.
 */

/**
 * The situational overrides a pre-roll dialog can add to one attack: the mode
 * of the d20, bonus or penalty dice and a flat bonus on the attack roll, and
 * extra dice and a flat rider on the damage. `twoHanded` swings a versatile
 * weapon with both hands, so the damage uses the two-handed dice. `longRange`
 * fires past the weapon's normal range, which slants the roll toward
 * disadvantage. `thrown` throws a melee weapon instead of striking with it,
 * which makes the swing a ranged attack for every rule that asks.
 * `freeAction` swings without spending the turn's Attack action, which is how
 * the GM takes a swing the action economy has no room for. `offhand` is the
 * second swing of two-weapon fighting: it costs the bonus action rather than
 * the Attack action, and its damage carries no ability bonus. `reaction` is an
 * opportunity attack, which costs the reaction and rolls like a normal swing.
 * `legendary` is a legendary action, which costs one of the legendary
 * actions of the creature and rolls like a normal swing.
 * `cover` raises the defender's AC for this swing, and `sneak` adds the
 * attacker's Sneak Attack dice to the damage. Both are the GM's call, because
 * nothing here reads a barrel on the map or where the rogue is standing.
 * `pack` is Pack Tactics: an ally stands next to the defender, so the swing
 * rolls with advantage. The GM ticks it for the same reason.
 * `surprise` is the Surprise Attack dice of the attacker, and `weak` marks
 * the swing of a Multiattack that rolls with disadvantage. The attack code
 * sets both from the fight, never from the dialog.
 * Every field defaults to nothing, so a plain Enter in the dialog rolls the
 * unmodified attack.
 * @typedef {{
 *   mode?: AttackMode,
 *   twoHanded?: boolean,
 *   longRange?: boolean,
 *   thrown?: boolean,
 *   freeAction?: boolean,
 *   offhand?: boolean,
 *   reaction?: boolean,
 *   legendary?: boolean,
 *   cover?: import('./Cover.js').CoverLevel,
 *   sneak?: boolean,
 *   pack?: boolean,
 *   surprise?: import("../types/creature.js").SurpriseAttack | null,
 *   weak?: boolean,
 *   attackDice?: number,
 *   attackDie?: import('../types/dice.js').DieType,
 *   attackFlat?: number,
 *   damageDice?: number,
 *   damageDie?: import('../types/dice.js').DieType,
 *   damageFlat?: number,
 * }} AttackTweaks
 */

/**
 * What the dialog's mode control can say. `auto` is the default and reads the
 * mode off the condition chips, falling back to the dice tray's standing
 * toggle. The other three are the GM's call for this one attack, and each of
 * them beats both, including `normal`, which is how a GM cancels a standing
 * toggle for one roll.
 * @typedef {'auto' | import('../types/dice.js').RollMode} AttackMode
 */

/**
 * The swings a combatant can take, and what each one costs. `main` draws
 * on the Attack action and the swings Extra Attack banks behind it. `offhand`
 * is the second swing of two-weapon fighting. `reaction` is an opportunity
 * attack. `legendary` is a legendary action of a creature, taken on the turn
 * of another combatant. Each row carries what the budget spends, what the dialog is titled,
 * what its opt-out box says, what the log adds to the attack line, and what the
 * toast says when the turn cannot pay.
 * @typedef {'main' | 'offhand' | 'reaction' | 'legendary'} SwingKind
 */
export const SWINGS = {
  main: {
    cost: /** @type {const} */ ('attack'),
    title: 'Attack with',
    optOut: 'no attack left this turn',
    note: '',
    blocked: 'has no attack left this turn',
  },
  offhand: {
    cost: /** @type {const} */ ('bonus'),
    title: 'Off-hand attack with',
    optOut: 'bonus action already used',
    note: ', off-hand',
    blocked: 'already used their bonus action this turn',
  },
  reaction: {
    cost: /** @type {const} */ ('reaction'),
    title: 'Opportunity attack with',
    optOut: 'reaction already used',
    note: ', opportunity attack',
    blocked: 'already used their reaction',
  },
  legendary: {
    cost: /** @type {const} */ ('legendary'),
    title: 'Legendary action: attack with',
    optOut: 'no legendary action left',
    note: ', legendary action',
    blocked: 'has no legendary action left this round',
  },
};

/**
 * Which swing the dialog's answers describe. A swing is a
 * main-hand one unless it says otherwise, and no swing is two of these at once.
 * @param {AttackTweaks} tweaks
 * @returns {SwingKind}
 */
export function swingKind(tweaks) {
  if (tweaks.legendary) return 'legendary';
  if (tweaks.reaction) return 'reaction';
  if (tweaks.offhand) return 'offhand';
  return 'main';
}

/**
 * Whether the participant's turn can pay for the given swing. A main-hand swing
 * asks the attack bank, because Extra Attack buys more than one swing per
 * action and Haste adds one more. The other two ask for their own part of the
 * turn.
 * @param {import('../types/combat.js').Participant} participant
 * @param {SwingKind} kind
 * @param {number} perAction how many swings one Attack action buys
 * @param {boolean} [extraAction] whether a chip gives the swinger an extra action
 * @returns {boolean}
 */
export function canSwing(participant, kind, perAction, extraAction = false) {
  if (kind === 'main') return attacksAvailable(participant, perAction, extraAction) > 0;
  // The card offers a legendary swing only while one is left, and the write
  // path refuses a swing past the last one.
  if (kind === 'legendary') return true;
  return canSpend(participant, SWINGS[kind].cost);
}

/**
 * Read the pre-roll dialog's answers into the override shape the roll takes.
 * A blank or unreadable field counts as no override.
 * @param {Record<string, string>} values
 * @returns {AttackTweaks}
 */
export function readAttackTweaks(values) {
  return {
    mode: /** @type {AttackMode} */ (values['mode'] || 'auto'),
    twoHanded: values['two-handed'] === '1',
    // The range control of a ranged weapon says 'normal' or 'long'. On a
    // thrown melee weapon it says 'melee', 'thrown', or 'thrown-long', so a
    // dagger can stab at the same dice it throws with.
    longRange: values['range'] === 'long' || values['range'] === 'thrown-long',
    thrown: values['range'] === 'thrown' || values['range'] === 'thrown-long',
    freeAction: values['free-action'] === '1',
    cover: /** @type {import('./Cover.js').CoverLevel} */ (values['cover'] || 'none'),
    sneak: values['sneak'] === '1',
    pack: values['pack'] === '1',
    attackDice: Number(values['atk-count']) || 0,
    attackDie: /** @type {import('../types/dice.js').DieType} */ (values['atk-die']),
    attackFlat: Number(values['atk-flat']) || 0,
    damageDice: Number(values['dmg-count']) || 0,
    damageDie: /** @type {import('../types/dice.js').DieType} */ (values['dmg-die']),
    damageFlat: Number(values['dmg-flat']) || 0,
  };
}

/**
 * Whether this swing is the one of the attacker's Multiattack that rolls with
 * disadvantage (`multiattackDisadvantage`). Only a main-hand swing counts.
 * The swing number comes from the participant's budget before the swing
 * pays. An unspent Attack action makes it swing 1, and each banked swing
 * that the creature has used moves it on by one. A swing outside a fight has
 * no budget and reads as swing 1.
 * @param {any} attacker
 * @param {import('../types/combat.js').Participant | null | undefined} participant
 * @param {AttackTweaks} tweaks
 * @returns {boolean}
 */
export function isWeakSwing(attacker, participant, tweaks) {
  const weak = attacker?.multiattackDisadvantage;
  const count = coerceMultiattack(attacker?.multiattack);
  if (!weak || !count || swingKind(tweaks) !== 'main') return false;
  const used = budgetOf(participant?.used);
  const swing = used.action && used.attacksLeft > 0 ? count - used.attacksLeft + 1 : 1;
  return swing === weak;
}

/**
 * The legendary swing row, with the log note numbered for this use, as in
 * ", legendary action 2 of 3". The number reads the budget before the swing
 * pays. A swing outside a fight has no budget and reads as use 1.
 * @param {any} attacker
 * @param {import('../types/combat.js').Participant | null | undefined} participant
 * @returns {(typeof SWINGS)['legendary']}
 */
export function legendarySwing(attacker, participant) {
  const max = coerceLegendary(attacker?.legendaryActions) ?? 0;
  const use = budgetOf(participant?.used).legendary + 1;
  const note = `${SWINGS.legendary.note} ${use} of ${Math.max(max, use)}`;
  return { ...SWINGS.legendary, note };
}
