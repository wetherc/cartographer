/**
 * Pure derivations over a running combat: which side a combatant fights on,
 * whether it is out of the fight, and the full per-participant view a combat
 * surface draws from. The UI layers used to derive these values separately
 * (the initiative panel one way, the target assembly another). This module
 * states each rule once. It resolves nothing itself. The caller injects
 * `resolve`, which maps a participant id to the entity holding it, because
 * only the wiring layer can see every collection an id can live in.
 */

import { effectiveStatBlock, isDefeated } from '../entities/Creature.js';
import { armorClass } from '../entities/Equipment.js';
import { getHP } from '../entities/Character.js';
import { canAct } from '../entities/ConditionEffects.js';

/** @typedef {import('../types/combat.js').CombatState} CombatState */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * A participant id resolved to whatever holds it. `kind` names the
 * collection. `entity` is the live object, read fresh each time, so a rename
 * or an HP change mid-fight shows up on the next draw.
 * @typedef {(
 *   { kind: 'character', entity: Character }
 *   | { kind: 'creature', entity: Creature }
 * )} ResolvedCombatant
 */

/**
 * Everything a combat surface needs to draw one participant. `name` is null
 * when nothing holds the id any more, because the entity was deleted
 * mid-fight. In that case the numeric fields fall back to neutral
 * values, and the row still draws, so the order and the turn pointer keep
 * lining up. `hp` is null only for a character with no HP pool.
 * `deathSaves` is null for anything but a dying party character, because only a
 * character rolls them.
 * @typedef {{
 *   id: string,
 *   name: string | null,
 *   side: 'party' | 'foe',
 *   initiative: number,
 *   hp: { current: number, max: number } | null,
 *   ac: number | null,
 *   conditions: import('../types/entities.js').Condition[],
 *   defeated: boolean,
 *   counted: boolean,
 *   incapacitated: boolean,
 *   mayAct: boolean,
 *   deathSaves: import('../types/entities.js').DeathSaveState | null,
 * }} CombatantRow
 */

/**
 * @typedef {{ round: number, turnIndex: number, rows: CombatantRow[] }} CombatView
 */

/**
 * Which side a resolved combatant fights on: the party's characters and its
 * friendly or neutral creatures against the hostile ones.
 * @param {ResolvedCombatant} found
 * @returns {'party' | 'foe'}
 */
export function sideOf(found) {
  if (found.kind === 'creature') {
    return found.entity.disposition === 'hostile' ? 'foe' : 'party';
  }
  return 'party';
}

/**
 * Whether a combatant is out of the fight: a defeated creature, or a
 * character at 0 HP.
 *
 * A friendly or neutral creature fights on the party's side but settles
 * nothing: `fightOutcome` reads only the rows marked `counted`, so a fallen
 * bystander does not lose the fight, and a standing one does not hold off
 * the defeat of a fallen party.
 * @param {ResolvedCombatant} found
 * @returns {boolean}
 */
export function isDowned(found) {
  if (found.kind === 'creature') return isDefeated(found.entity);
  const hp = getHP(found.entity);
  return Boolean(hp && hp.current <= 0);
}

/**
 * Whether the turn pointer steps past a combatant. It does so for one that is
 * out of the fight, and for one whose chips leave it unable to act, such as
 * Stunned. A participant that resolves to nothing, deleted mid-fight or walked
 * off the tile, also has no turn to take.
 * @param {ResolvedCombatant | null} found
 * @returns {boolean}
 */
export function skipsTurn(found) {
  return !found || isDowned(found) || !canAct(conditionsOf(found));
}

/**
 * The chips a combatant holds. Every kind tracks them, so this reads the
 * same field on all three, and an older save without the field reads empty.
 * @param {ResolvedCombatant} found
 * @returns {import('../types/entities.js').Condition[]}
 */
export function conditionsOf(found) {
  return found.entity.conditions ?? [];
}

/**
 * The combatant's HP as a current/max pair. A creature stores the pair. A
 * character reads it off its HP pool, and a character without that pool has
 * no pair to show.
 * @param {ResolvedCombatant} found
 * @returns {{ current: number, max: number } | null}
 */
export function hpOf(found) {
  if (found.kind === 'character') {
    const hp = getHP(found.entity);
    return hp ? { current: hp.current, max: hp.max } : null;
  }
  return { current: found.entity.currentHP, max: found.entity.maxHP };
}

/**
 * The combatant's armor class: a creature's effective AC (armor and stat
 * modifiers applied), or a character's armor AC. Every kind has one, so the
 * return is never null.
 * @param {ResolvedCombatant} found
 * @returns {number | null}
 */
export function acOf(found) {
  if (found.kind === 'character') return armorClass(found.entity);
  return effectiveStatBlock(found.entity).AC;
}

/**
 * Whether this viewer can drive a participant's turn: the GM anywhere, a
 * player only on the party-side character their tab is bound to. A foe is the
 * GM's alone even if a player somehow holds its id.
 * @param {ResolvedCombatant | null} found
 * @param {{ gm: boolean, boundCharacterId: string | null }} viewer
 * @param {string} id
 * @returns {boolean}
 */
export function mayActOn(found, viewer, id) {
  if (viewer.gm) return true;
  if (!found || sideOf(found) === 'foe') return false;
  return viewer.boundCharacterId === id;
}

/**
 * How the fight turned out, or null while both sides still have someone
 * standing. A side with nobody on it settles nothing, so an order with no foes
 * in it (a brawl between party members, an order the GM built by hand) reads as
 * undecided rather than won. A mutual wipe reads as a defeat: what happens to
 * the party outweighs what happened to the monsters.
 * @param {CombatView} view
 * @returns {'victory' | 'defeat' | null}
 */
export function fightOutcome(view) {
  if (sideIsDown(view, 'party')) return 'defeat';
  if (sideIsDown(view, 'foe')) return 'victory';
  return null;
}

/**
 * Only the rows marked `counted` settle a side: the party's characters and
 * the hostile creatures. A friendly or neutral creature in the order is a
 * bystander and sways the outcome in neither direction. Rows that nothing
 * resolves are also uncounted, since their side and defeated flag are
 * placeholders (see `buildCombatView`).
 * @param {CombatView} view
 * @param {'party' | 'foe'} side
 */
function sideIsDown(view, side) {
  const rows = view.rows.filter((row) => row.side === side && row.counted);
  return rows.length > 0 && rows.every((row) => row.defeated);
}

/**
 * Assemble the full view of a running combat for one viewer: the round, the
 * turn pointer, and one row per participant in order. Pure over its inputs:
 * the combat state, the injected id resolver, and who is looking.
 * @param {CombatState} combat
 * @param {(id: string) => ResolvedCombatant | null} resolve
 * @param {{ gm: boolean, boundCharacterId?: string | null }} viewer
 * @returns {CombatView}
 */
export function buildCombatView(combat, resolve, viewer) {
  const who = { gm: viewer.gm, boundCharacterId: viewer.boundCharacterId ?? null };
  const rows = combat.order.map((participant) => {
    const found = resolve(participant.id);
    return {
      id: participant.id,
      name: found ? found.entity.name : null,
      side: found ? sideOf(found) : /** @type {'party'} */ ('party'),
      initiative: participant.initiative,
      hp: found ? hpOf(found) : null,
      ac: found ? acOf(found) : null,
      conditions: found ? conditionsOf(found) : [],
      defeated: found ? isDowned(found) : false,
      // The rows that settle the outcome: characters and hostile creatures.
      // A friendly or neutral creature is a bystander in the fight.
      counted: found ? found.kind === 'character' || sideOf(found) === 'foe' : false,
      // A chip such as Stunned takes the turn without taking the combatant
      // out of the fight, so the surfaces mark it apart from defeat.
      incapacitated: found ? !canAct(conditionsOf(found)) : false,
      mayAct: mayActOn(found, who, participant.id),
      // Only a character carries the tracker. Everything else reads null, so
      // the surfaces need no kind check of their own.
      deathSaves: found?.kind === 'character' ? (found.entity.deathSaves ?? null) : null,
    };
  });
  return { round: combat.round, turnIndex: combat.index, rows };
}
