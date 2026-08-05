/**
 * The GM's write path for exhaustion, over a character or a creature by id.
 *
 * The rules live in `entities/Exhaustion.js`, which knows nothing about death.
 * It cannot: `Checks.js` reads it, and `DeathSaves.js` is built on `Checks.js`,
 * so an import of the death rules from there would close a cycle. The sixth
 * level kills, and the two kinds of combatant die differently, so the write
 * that kills lives here instead. A character dies through its death-save
 * tracker. A creature dies at 0 HP.
 *
 * The reverse coupling is not here. A revive has to take the fatal level back
 * off, and it happens in more places than this module can see, so
 * `DeathSaves.clearDying` and `Creature.heal` each hold that half.
 */

import { isDefeated, applyDamage } from '../entities/Creature.js';
import { isDead, killOutright } from '../entities/DeathSaves.js';
import {
  atDeathLevel,
  exhaustionLevel,
  exhaustionNote,
  setExhaustion,
} from '../entities/Exhaustion.js';
import { findCombatant, logDefeatTransition } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * Set the exhaustion level of one combatant, and apply what the new level
 * costs. The stepper on the character sheet and on the two creature panels
 * calls this.
 *
 * A level that does not change writes nothing, so a stepper that repeats its
 * current value neither logs nor marks the campaign dirty. The log names the new
 * level and what it takes off, because a penalty that reaches every d20 roll
 * must be visible to the table.
 *
 * The sixth level kills. A combatant that is already dead or already at 0 HP
 * takes the level and nothing else, so a second write cannot log a second death.
 * @param {AppContext} app
 * @param {string} id
 * @param {number} level
 * @returns {boolean} whether the level changed
 */
export function setCombatantExhaustion(app, id, level) {
  const found = findCombatant(app, id);
  if (!found) return false;
  const after = exhaustionLevel({ exhaustion: level });
  if (after === exhaustionLevel(found.entity)) return false;
  // The level goes into the log before the death line that the sixth one adds,
  // so the log reads in the order the two things happened.
  app.actions.logEvent('note', `${found.entity.name}: ${exhaustionNote({ exhaustion: after })}`);
  // The two branches do the same write. They are split because each store
  // function accepts only its own entity type, and because the sixth level
  // kills the two kinds differently.
  if (found.kind === 'character') {
    found.store(killIfFatalCharacter(app, setExhaustion(found.entity, after)));
  } else {
    found.store(killIfFatalCreature(app, setExhaustion(found.entity, after)));
  }
  app.actions.markDirty();
  return true;
}

/**
 * The character half of the sixth level: three failed death saves, which is
 * what the app reads as dead everywhere else.
 * @param {AppContext} app
 * @param {Character} character already at the new level
 * @returns {Character}
 */
function killIfFatalCharacter(app, character) {
  if (!atDeathLevel(character) || isDead(character)) return character;
  app.actions.logEvent('combat', `${character.name} dies of exhaustion.`);
  return killOutright(character);
}

/**
 * The creature half of the sixth level: 0 HP, which is the only way a creature
 * leaves a fight. The damage goes through `applyDamage` so that the defeat log
 * line and the map markers behave as they do for a killing blow.
 * @param {AppContext} app
 * @param {Creature} creature already at the new level
 * @returns {Creature}
 */
function killIfFatalCreature(app, creature) {
  if (!atDeathLevel(creature) || isDefeated(creature)) return creature;
  const dead = applyDamage(creature, creature.currentHP);
  logDefeatTransition(app, creature, dead);
  return dead;
}
