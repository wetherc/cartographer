/**
 * Rolling initiative for one combatant.
 *
 * Initiative is a Dexterity check, so what slants a check slants it: the
 * condition chips of the roller, and armor the roller is not trained for.
 * Exhaustion takes 2 off for each level, as on every other d20 test. The setup
 * dialog fills the whole column at once and does not go through the dice tray,
 * so this module throws its own d20s and names the die it dropped.
 *
 * The DEX modifier itself comes from the participant, which the roster stamped
 * when it read the stat block. This module adds nothing to it but the penalty.
 */

import { unproficientWear } from '../entities/Armor.js';
import { d20Penalty, exhaustionLevel } from '../entities/Exhaustion.js';
import { modeReasons, rollMode } from '../entities/ConditionEffects.js';
import { droppedNote } from './AttackResolve.js';

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../entities/ConditionEffects.js').RollMode} RollMode */

/**
 * What the game state does to one initiative roll: the mode of the d20, the
 * signed exhaustion penalty, and the phrases that say where each came from.
 *
 * A missing entity happens when nothing holds the participant id any more. It
 * reads as a plain roll rather than an error, because the GM can still start
 * the fight and edit the value by hand.
 * @param {Character | Creature | null | undefined} entity
 * @returns {{ mode: RollMode | null, penalty: number, reasons: string[] }}
 */
export function initiativeSlant(entity) {
  const roller = entity ?? /** @type {Character} */ ({});
  // A check reads only the roller's own chips, so there is no target side and
  // no reach to state. The ability is not asked for either: a chip that slants
  // checks slants all of them.
  const query = /** @type {const} */ ({ roller: roller.conditions, kind: 'check' });
  // Every weapon attack rolls off STR or DEX and takes this slant, and so does
  // a DEX check. Only a character carries proficiency lists, so a creature is
  // never untrained for what it wears.
  const badWear = unproficientWear(/** @type {Character} */ (roller));
  const wearSlant = badWear.length > 0 ? /** @type {const} */ ('disadvantage') : null;
  const penalty = d20Penalty(roller);
  const reasons = [];
  const chips = modeReasons(query);
  if (chips) reasons.push(chips);
  if (wearSlant) reasons.push(`not proficient with ${badWear.join(' and ')}, disadvantage`);
  if (penalty) reasons.push(`exhaustion ${exhaustionLevel(roller)} ${penalty}`);
  return { mode: rollMode(query, [wearSlant]), penalty, reasons };
}

/**
 * Roll initiative for one row of the setup dialog. The value is the d20 plus
 * the participant's DEX modifier plus the exhaustion penalty. Advantage keeps
 * the higher of two d20s and disadvantage the lower, matching the tray.
 *
 * The note is for the log line. It names the dropped die and every reason the
 * roll came out the way it did, so a cancelled pair of chips still explains
 * itself. It is empty when nothing touched the roll.
 * @param {Participant} participant
 * @param {Character | Creature | null | undefined} entity
 * @param {() => number} [rng]
 * @returns {{ value: number, note: string }}
 */
export function rollInitiative(participant, entity, rng = Math.random) {
  const { mode, penalty, reasons } = initiativeSlant(entity);
  const d20 = () => Math.floor(rng() * 20) + 1;
  const slanted = mode === 'advantage' || mode === 'disadvantage';
  const rolls = slanted ? [d20(), d20()] : [d20()];
  const natural = mode === 'disadvantage' ? Math.min(...rolls) : Math.max(...rolls);
  const kept = rolls.indexOf(natural);
  const dropped = rolls.filter((_, i) => i !== kept);
  const value = natural + (participant.modifier ?? 0) + penalty;
  const parts = [droppedNote({ dropped }, mode ?? undefined).trim(), ...reasons].filter(Boolean);
  return { value, note: parts.join(', ') };
}
