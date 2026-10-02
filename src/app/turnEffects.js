import { rollDamage } from '../dice/DiceRoller.js';
import { defenseNote } from '../entities/DamageDefenses.js';
import { dropBoundaryChips, ongoingChips, passBoundary } from '../entities/TurnEffects.js';
import { isGone } from '../combat/CombatView.js';
import { isDying } from '../entities/DeathSaves.js';
import { settleChips } from './lethargy.js';
import { endedLine } from '../entities/Conditions.js';
import { grantTempTo } from './tempHP.js';
import { commitCreatures, defendedDamage, findCombatant, logName } from './combatants.js';
import { applyToTarget, retryImposedSaves } from './combatantWrites.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * What happens at the start and the end of one combatant's turn, beyond the
 * action budget that `Initiative.js` refreshes. The end of a turn rolls the
 * repeated saves the combatant is owed, deals the damage its chips leave for
 * later turns, and counts the boundary for every chip keyed to it. The start
 * of a turn only counts the boundary. The pure rules live in
 * `entities/TurnEffects.js` and `entities/ImposedConditions.js`, and this
 * module writes their results into the rosters and the log.
 */

/**
 * The end of one combatant's turn. A dead character or a defeated creature
 * has no turn to take, so it rolls no save and takes no damage. A dying
 * character at 0 HP still does both, and the damage costs it a death save.
 * The chips keyed to its turns always count the boundary, because a caster
 * who drops before its next turn still ends "until the end of your next
 * turn" at that point.
 * @param {AppContext} app
 * @param {string} id
 * @param {{ rng?: RandomFn }} [options]
 */
export function endTurnEffects(app, id, { rng = Math.random } = {}) {
  const found = findCombatant(app, id);
  if (found && !isGone(found)) {
    // A retry that fails leaves the chip, and a chip with later-turn damage
    // then deals it. Phantasmal Killer works this way: the save both ends the
    // spell and spares the damage.
    for (const { condition, ended } of retryImposedSaves(app, id, { rng })) {
      if (!ended && condition.ongoing) dealOngoing(app, id, condition, rng);
    }
    const live = findCombatant(app, id);
    for (const chip of live ? ongoingChips(live.entity.conditions) : []) {
      dealOngoing(app, id, chip, rng);
    }
  }
  sweepChips(app, (list) => passBoundary(list, id, 'end'));
}

/**
 * The start of one combatant's turn. Every chip keyed to it counts the
 * boundary, and the ones with none left end, such as a Shield that lasts
 * until the start of the caster's next turn. Then each chip that grants
 * temporary HP at the start of the holder's turn (Heroism) grants them. A
 * dying character gets a log line and a toast that ask for its death save,
 * because that roll is the whole of its turn.
 * @param {AppContext} app
 * @param {string} id
 */
export function startTurnEffects(app, id) {
  sweepChips(app, (list) => passBoundary(list, id, 'start'));
  const found = findCombatant(app, id);
  for (const chip of found ? found.entity.conditions : []) {
    const amount = chip.mods?.tempHPEachTurn ?? 0;
    if (amount > 0) grantTempTo(app, id, amount, chip.name, { quiet: true });
  }
  if (found?.kind === 'character' && isDying(found.entity)) {
    const line = `${found.label} is dying. Roll a death save.`;
    app.actions.logEvent('combat', line);
    app.toasts.show(line);
  }
}

/**
 * Remove the chips that wait on a turn boundary. With `who`, only the chips
 * keyed to that combatant go, which is what its removal from the fight does:
 * its turns do not come again. Without it, every such chip goes, which is
 * what the end of the fight does, because no turn comes again at all.
 * @param {AppContext} app
 * @param {string} [who]
 */
export function dropTurnChips(app, who) {
  sweepChips(app, (list) => dropBoundaryChips(list, who));
}

/**
 * Deal the later-turn damage on one chip to the combatant that has it.
 * The damage goes through the combatant's defenses and the shared write path,
 * so it can break concentration or cost a death save like any other hit.
 * @param {AppContext} app
 * @param {string} id
 * @param {Condition} chip
 * @param {RandomFn} rng
 */
function dealOngoing(app, id, chip, rng) {
  const found = findCombatant(app, id);
  if (!found || !chip.ongoing) return;
  const damage = rollDamage(chip.ongoing.damage, 0, rng);
  const taken = defendedDamage(app, id, damage.byType);
  const from = chip.source?.spellName ?? chip.name;
  app.actions.logEvent(
    'combat',
    `${from} deals ${damage.detail}${defenseNote(taken.notes, taken.total)} to ${found.label}.`,
  );
  applyToTarget(app, id, taken.total, false);
}

/**
 * Run one chip rule over every combatant, write back what changed, and log
 * each chip that ended. An entity whose chips the rule leaves alone keeps its
 * identity, and so does a roster in which nothing changed. The roster indexes
 * and the save's pack cache key on that identity, and this sweep runs on every
 * turn of a fight.
 * @param {AppContext} app
 * @param {(list: Condition[]) => { conditions: Condition[], ended: Condition[] }} rule
 */
function sweepChips(app, rule) {
  const { state } = app;
  /** @type {{ name: string, condition: string }[]} */
  const freed = [];
  /** @type {string[]} */
  const notes = [];
  /**
   * @template {import('../types/entities.js').Character | import('../types/creature.js').Creature} T
   * @param {T[]} list
   * @returns {T[] | null}
   */
  const swept = (list) => {
    const next = list.map((entity) => {
      const { conditions, ended } = rule(entity.conditions);
      if (conditions === entity.conditions) return entity;
      // A chip that only counted a boundary down still changes the list, so
      // the entity is written. Only an ended chip settles HP and logs.
      if (ended.length === 0) return { ...entity, conditions };
      for (const c of ended) freed.push({ name: logName(app, entity), condition: c.name });
      return settleChips(app, entity, conditions, notes);
    });
    return next.some((entity, i) => entity !== list[i]) ? next : null;
  };
  const characters = swept(state.characters);
  const creatures = swept(state.creatures);
  if (!characters && !creatures) return;
  if (characters) {
    state.characters = characters;
    app.actions.refreshSelectedCharacter();
  }
  if (creatures) {
    state.creatures = creatures;
    commitCreatures(app, { dirty: false });
  }
  app.actions.markDirty();
  app.views.combatScreen.update();
  for (const { name, condition } of freed) {
    app.actions.logEvent('combat', `${endedLine(name, condition)}.`);
  }
  for (const line of notes) app.actions.logEvent('combat', line);
}

/**
 * The end of a fight. A chip that waits on a turn boundary has no turn left
 * to wait for, so it ends (see {@link dropTurnChips}). The later-turn damage
 * such a chip still owes lands first, because in 5e the time of that turn
 * still passes after the fight: an Acid Arrow that hit on the last turn still
 * burns. A chip that deals its damage only on a failed repeated save deals
 * none here, because no save is rolled. A dead character or a defeated
 * creature takes nothing.
 * @param {AppContext} app
 * @param {{ rng?: RandomFn }} [options]
 */
export function endFightEffects(app, { rng = Math.random } = {}) {
  for (const { id, conditions } of [...app.state.characters, ...app.state.creatures]) {
    for (const chip of ongoingChips(conditions ?? [])) {
      const found = chip.expires ? findCombatant(app, id) : null;
      if (found && !isGone(found)) dealOngoing(app, id, chip, rng);
    }
  }
  dropTurnChips(app);
}
