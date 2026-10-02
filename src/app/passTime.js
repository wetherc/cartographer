import { advanceMinutes, formatClock, formatMinutes, watchesBetween } from '../time/GameClock.js';
import { ROUNDS_PER_WATCH, elapseCharacter, elapseCreature } from '../entities/TimedEffects.js';
import { commitCreatures } from './combatants.js';
import { endSpellEffects } from './combatantWrites.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Spend game time on every timed effect in the campaign: the Time panel's
 * Advance button and both rests call this with the watches that passed. A
 * short rest passes a quarter watch, which is one hour. A condition, a
 * creature stat modifier, or a concentration that runs out ends, and a
 * concentration that ends also ends the chips and summons its
 * spell holds on other entities. A collection with nothing timed in it
 * keeps its identity, so the roster caches keyed on it stay warm.
 * @param {AppContext} app
 * @param {number} watches
 */
export function passTime(app, watches) {
  const { state } = app;
  const rounds = watches * ROUNDS_PER_WATCH;
  if (rounds <= 0) return;
  /** @type {{ casterId: string, spellId: string }[]} */
  const ended = [];
  const characters = state.characters.map((c) => {
    const result = elapseCharacter(c, rounds);
    if (result.ended) {
      app.actions.logEvent('note', `${c.name}'s concentration on ${result.ended.spellName} ends.`);
      ended.push({ casterId: c.id, spellId: result.ended.spellId });
    }
    return result.character;
  });
  const creatures = state.creatures.map((c) => elapseCreature(c, rounds));
  if (characters.some((c, i) => c !== state.characters[i])) {
    state.characters = characters;
    app.actions.refreshSelectedCharacter();
  }
  if (creatures.some((c, i) => c !== state.creatures[i])) {
    state.creatures = creatures;
    commitCreatures(app, { dirty: false });
  }
  // The sweep runs after both collections are written. It writes to the same
  // two collections, and run earlier, the write above would restore them.
  for (const { casterId, spellId } of ended) endSpellEffects(app, casterId, spellId);
  // The sight radius follows the watch, and the exit arrows show by sight.
  app.actions.syncExits();
}

/**
 * Spend the minutes of a whole-party walk. Timed effects count whole
 * watches, so they tick only when the walk crosses into a new watch. A walk
 * that crosses one also logs under 'travel' and shows a toast with its
 * length and the new time, so a GM who also advances the clock by hand for
 * travel does not count the watch twice.
 * @param {AppContext} app
 * @param {number} minutes
 * @returns {boolean} whether the clock moved
 */
export function passTravelTime(app, minutes) {
  if (minutes <= 0) return false;
  const before = app.state.clock;
  app.state.clock = advanceMinutes(before, minutes);
  const watches = watchesBetween(before, app.state.clock);
  passTime(app, watches);
  if (watches > 0) {
    const text = `The walk took ${formatMinutes(minutes)}. Now ${formatClock(app.state.clock)}.`;
    app.actions.logEvent('travel', text);
    app.toasts.show(text);
  }
  return true;
}
