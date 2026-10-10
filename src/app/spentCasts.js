import { drop as dropConcentration } from '../entities/Concentration.js';
import { findCombatant } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * End the caster's concentration on a spell when no chip of that cast is
 * left on anyone. A roll that uses up a one-roll rider, such as Guidance or
 * Resistance, removes the chip, and the spell then has no effect to hold.
 * Without this, the caster goes on rolling concentration saves for a spell
 * that does nothing. A caster that concentrates on another spell, or that
 * resolves to nothing, writes nothing.
 * @param {AppContext} app
 * @param {string} casterId
 * @param {string} spellId
 */
export function endIfSpent(app, casterId, spellId) {
  const found = findCombatant(app, casterId);
  const held = found?.entity.concentration;
  if (!found || held?.spellId !== spellId) return;
  const holds = (/** @type {Character | Creature} */ entity) =>
    (entity.conditions ?? []).some(
      (c) => c.source?.casterId === casterId && c.source?.spellId === spellId,
    );
  if (app.state.characters.some(holds) || app.state.creatures.some(holds)) return;
  if (found.kind === 'character') found.store(dropConcentration(found.entity));
  else found.store(dropConcentration(found.entity));
  app.actions.markDirty();
  app.actions.logEvent('combat', `${found.label} stops concentrating on ${held.spellName}.`);
}

/**
 * Run `endIfSpent` for each cast whose chip a spend removed.
 * @param {AppContext} app
 * @param {import('../types/entities.js').Condition[]} before the chips before the spend
 * @param {import('../types/entities.js').Condition[]} after the chips after the spend
 */
export function endSpentCasts(app, before, after) {
  const casts = new Map();
  for (const chip of before) {
    const source = chip.source;
    if (after.includes(chip) || !source?.casterId || !source.spellId) continue;
    casts.set(`${source.casterId}\n${source.spellId}`, source);
  }
  for (const { casterId, spellId } of casts.values()) endIfSpent(app, casterId, spellId);
}
