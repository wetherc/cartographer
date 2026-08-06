/**
 * Spawning the creatures that a summoning spell brings. This is the wiring
 * half of `entities/Summons.js`: the pure module says which creatures a cast
 * owns, and this module reads the template out of the library, puts the
 * creatures on the map, and joins them to a running fight.
 *
 * The despawn half lives in `endSpellEffects` (combatants.js), beside the
 * condition sweep, because both ends of a spell end together.
 */

import { effectiveStatBlock, fromTemplate } from '../entities/Creature.js';
import { abilityModifier } from '../entities/Modifiers.js';
import { createParticipant } from '../combat/Initiative.js';
import { slugId } from '../entities/Roster.js';
import { stampSummon } from '../entities/Summons.js';
import { activeCreatureByName } from '../library/Library.js';
import { commitCreatures, rosterIds } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The initiative a summon joins a running fight on: a straight d20 plus its
 * DEX modifier. This matches the Roll initiative fill of the setup dialog,
 * including its limits. No condition or armor slant reaches an initiative roll
 * yet, and the GM can edit the value by hand afterward.
 * @param {Creature} creature
 * @param {() => number} rng
 * @returns {import('../types/combat.js').Participant}
 */
function joinRoll(creature, rng) {
  const modifier = abilityModifier(effectiveStatBlock(creature).DEX ?? 10);
  return createParticipant(creature.id, Math.floor(rng() * 20) + 1 + modifier, modifier);
}

/**
 * Spawn the creatures that one cast of a summoning spell brings. They stand on
 * the tile of the party, at full health, and each one carries the stamp of the
 * cast so the end of the spell takes them away again.
 *
 * The side they fight on is the disposition of the template. A hostile
 * template fights the party, which is what the built-in beasts are, and a
 * friendly or neutral one stands with it. Nothing here overrides that, so a GM
 * who wants a summon that fights beside the party writes a friendly template.
 *
 * Each creature is appended before the next id is drawn, so a cast that brings
 * four wolves gets four distinct ids instead of four copies of one.
 *
 * @param {AppContext} app
 * @param {Spell} spell
 * @param {string} casterId
 * @param {{ creature: string, count: number }} outcome what the cast resolved
 * @param {{ rng?: () => number }} [options]
 * @returns {{ spawned: Creature[], template: string } | { error: string }}
 */
export function spawnSummons(app, spell, casterId, outcome, { rng = Math.random } = {}) {
  const template = activeCreatureByName(outcome.creature);
  // The cast dialog refuses a spell whose template is missing, so this only
  // catches a library edited between opening the dialog and confirming it.
  if (!template) return { error: `No creature template named "${outcome.creature}".` };

  const { state } = app;
  const location = app.partyTracker.getPosition();
  const source = { spellId: spell.id, spellName: spell.name, casterId };
  /** @type {Creature[]} */
  const spawned = [];
  for (let i = 0; i < outcome.count; i += 1) {
    const id = slugId(template.name, [...rosterIds(state), ...spawned.map((c) => c.id)]);
    spawned.push(stampSummon(fromTemplate(template, id, { ...location }), source));
  }
  state.creatures = [...state.creatures, ...spawned];
  // A fight already running takes the newcomers into its order. With no fight
  // running they simply stand on the tile, and a fight started there stages
  // them like any other creature.
  if (state.combat) {
    for (const creature of spawned) app.actions.addCombatant(joinRoll(creature, rng));
  }
  // The spawn marks the campaign itself. The cast marks it too where it spends
  // a slot, but a cantrip summons that holds no concentration spends nothing,
  // and the new creatures still have to reach the save.
  commitCreatures(app);
  return { spawned, template: template.name };
}
