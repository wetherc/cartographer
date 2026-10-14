import { currentParticipant } from '../combat/Initiative.js';
import { chipTiming } from '../entities/TurnEffects.js';
import { settleHPBuffs } from '../entities/HPBuffs.js';
import { withLethargy } from '../entities/Lethargy.js';
import { logName } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Condition} Condition */

/**
 * The wiring of Haste's lethargy (see `entities/Lethargy.js`). Every write
 * that changes a combatant's chips passes the entity before and after
 * through {@link addLethargy} or {@link settleChips}, and this module adds
 * the Lethargic chip and logs it when a Haste chip ended.
 */

/**
 * `next` with a Lethargic chip when a Haste chip ended between `prev` and
 * `next`. The chip ends at the end of the target's next turn, so it waits
 * for two turn ends when Haste ends during the target's own turn. Outside a
 * fight it lasts one round. The log line waits in `notes` when the caller
 * passes that list, so a sweep can log it after the line that ends Haste.
 * @template {{ id: string, name: string, conditions: Condition[] }} T
 * @param {AppContext} app
 * @param {T} prev
 * @param {T} next
 * @param {string[]} [notes]
 * @returns {T}
 */
export function addLethargy(app, prev, next, notes) {
  const combat = app.state.combat;
  const timing = chipTiming('target-end', {
    casterId: next.id,
    targetId: next.id,
    actingId: combat ? (currentParticipant(combat)?.id ?? null) : null,
    inOrder: (id) => !!combat?.order.some((p) => p.id === id),
  });
  const conditions = withLethargy(prev.conditions, next.conditions, timing);
  if (conditions === next.conditions) return next;
  const line = `${logName(app, next)} is lethargic and can't move or take actions until after its next turn.`;
  if (notes) notes.push(line);
  else app.actions.logEvent('combat', line);
  return { ...next, conditions };
}

/**
 * An entity with a new chip list, its HP settled against the chips (see
 * `HPBuffs.settleHPBuffs`) and its lethargy added.
 * @template {import('../types/entities.js').Character | import('../types/creature.js').Creature} T
 * @param {AppContext} app
 * @param {T} entity
 * @param {Condition[]} conditions
 * @param {string[]} [notes]
 * @returns {T}
 */
export function settleChips(app, entity, conditions, notes) {
  return settleHPBuffs(addLethargy(app, entity, { ...entity, conditions }, notes));
}
