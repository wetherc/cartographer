/**
 * Rolling a death save from the combat screen or the character sheet, and
 * stabilizing a character by hand.
 *
 * The rule layer lives in `entities/DeathSaves.js`, and it can roll a d20 on
 * its own. This module does not use that part of it, for the reason
 * `app/checkRolls.js` states: the dice tray also rolls, so going through
 * `rollDeathSave` would throw two d20s and show the wrong one. The riders roll
 * here, the tray throws the only d20, and `judgeDeathSave` reads the result.
 * Both paths therefore share one set of rules.
 */

import { HP_RESOURCE_ID, restoreResource } from '../entities/Character.js';
import {
  DEATH_SAVE_DC,
  applyJudged,
  deathSaveBonus,
  isDead,
  isDying,
  judgeDeathSave,
  stabilize,
} from '../entities/DeathSaves.js';
import { exhaustionLevel } from '../entities/Exhaustion.js';
import { rollRiders } from '../entities/Riders.js';
import { findCombatant } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * The line each outcome logs, given the character's name.
 * @type {Record<import('../entities/DeathSaves.js').DeathSaveOutcome, (name: string) => string>}
 */
const OUTCOME_LINES = {
  revive: (name) => `${name} wakes at 1 HP.`,
  success: (name) => `${name} holds on.`,
  stable: (name) => `${name} is stable at 0 HP.`,
  failure: (name) => `${name} slips further.`,
  dead: (name) => `${name} dies.`,
};

/**
 * Resolve a participant id to the character behind it, when that character is
 * dying. A creature and a standing character have no death save to roll,
 * and neither does a character who is already stable or dead.
 * @param {AppContext} app
 * @param {string} id
 * @returns {import('./combatants.js').Combatant & { kind: 'character' } | null}
 */
function dyingCharacter(app, id) {
  const found = findCombatant(app, id);
  if (found?.kind !== 'character') return null;
  return isDying(found.entity) ? found : null;
}

/**
 * Roll one death save for a character and apply what it did. The tray shows
 * the d20 with the riders already in its modifier field, and the log line
 * breaks that number back down, the way a sheet check does. A Bless chip
 * therefore reaches a death save without the GM adding anything by hand.
 *
 * The save adds no ability modifier and no proficiency, so the tray's modifier
 * is the riders plus the exhaustion penalty. A natural 20 wakes the character at
 * 1 HP, which is the one outcome that writes HP as well as the tracker.
 *
 * A character who is not dying rolls nothing. This covers a standing
 * character, a stable one, and a dead one, so a stale button cannot move the
 * counters.
 * @param {AppContext} app
 * @param {string} characterId
 * @param {{ rng?: () => number }} [opts] `rng` is the source for the rider
 *   dice. The d20 belongs to the tray, which owns its own randomness.
 */
export function rollDeathSaveFor(app, characterId, { rng = Math.random } = {}) {
  const found = dyingCharacter(app, characterId);
  if (!found) return;
  const character = found.entity;
  const state = character.deathSaves;
  if (!state) return;
  // Rider dice roll outside the tray, the way an attack's and a sheet check's
  // do, so a bonus and a penalty read the same in the log.
  const rider = rollRiders(character.conditions, 'save', rng);
  // Exhaustion is the only standing part of the modifier. It is not a rider, so
  // it joins the tray's number here and the log names it below.
  const tired = deathSaveBonus(character);
  const { result } = app.actions.rollDice({
    counts: { d20: 1 },
    modifier: tired + rider.modifier,
  });
  const d20 = result.results.find((r) => r.die === 'd20');
  const natural = d20?.rolls[0] ?? 0;
  const judged = judgeDeathSave(state, { natural, total: result.total, dc: DEATH_SAVE_DC });
  let next = applyJudged(character, judged.state);
  if (judged.outcome === 'revive') next = restoreResource(next, HP_RESOURCE_ID, 1);
  found.store(next);
  app.actions.markDirty();
  const tiredNote = tired ? `, exhaustion ${exhaustionLevel(character)} ${tired}` : '';
  const rode = rider.note ? `, ${rider.note}` : '';
  const naturalNote = natural === 1 || natural === 20 ? ` Natural ${natural}.` : '';
  app.actions.logEvent(
    'combat',
    `${character.name} rolls a death save (${result.total}${tiredNote}${rode} vs DC ${DEATH_SAVE_DC}): ` +
      `${OUTCOME_LINES[judged.outcome](character.name)}${naturalNote}`,
  );
  app.toasts.show(OUTCOME_LINES[judged.outcome](character.name));
}

/**
 * Stabilize a dying character by hand, which is what a successful Medicine
 * check or a healer's kit does at the table. The character stays at 0 HP and
 * stays unconscious, and it rolls no more saves. A character who is not dying,
 * or one that is already dead, is left alone.
 * @param {AppContext} app
 * @param {string} characterId
 */
export function stabilizeCharacter(app, characterId) {
  const found = findCombatant(app, characterId);
  if (found?.kind !== 'character') return;
  if (!found.entity.deathSaves || isDead(found.entity)) return;
  found.store(stabilize(found.entity));
  app.actions.markDirty();
  app.actions.logEvent('combat', `${found.entity.name} is stabilized at 0 HP.`);
  app.toasts.show(`${found.entity.name} is stable.`);
}
