import { ROUNDS_PER_WATCH, elapseCharacter, elapseCreature } from '../entities/TimedEffects.js';
import { commitCreatures, endSpellEffects } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */

/**
 * Spend game time on every timed effect in the campaign: the Time panel's
 * Advance button and both rests call this with the watches that passed. A
 * condition, a creature stat modifier, or a concentration that runs out
 * ends, and a concentration that ends also ends the chips and summons its
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
}
