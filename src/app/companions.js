/**
 * The NPC card controls for companions: the "Travels with the party" toggle
 * and "Bring to the party". Both move the NPC with `moveCreature`, which
 * keeps `met`, so the party does not meet a known NPC a second time.
 */

import { moveCreature } from '../entities/CreatureMap.js';
import { replaceById } from '../entities/Roster.js';
import { commitCreatures } from './combatants.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * Move one NPC onto the party tile. An NPC that the party has not met yet
 * is met there, with the usual travelogue line.
 * @param {AppContext} app
 * @param {Creature} npc
 */
export function bringToParty(app, npc) {
  const { nodeId, tileId } = app.partyTracker.getPosition();
  app.state.creatures = moveCreature(app.state.creatures, npc.id, { nodeId, tileId });
  app.actions.meetCreatures();
  commitCreatures(app);
}

/**
 * Turn the companion flag of an NPC on or off. Turning it on also brings
 * the NPC to the party, and from then on the NPC moves with each party
 * move. Turning it off leaves the NPC where it stands.
 * @param {AppContext} app
 * @param {Creature} npc
 */
export function toggleCompanion(app, npc) {
  const current = app.state.creatures.find((c) => c.id === npc.id);
  if (!current) return;
  const { travelsWithParty, ...rest } = current;
  const next = travelsWithParty ? rest : { ...rest, travelsWithParty: true };
  app.state.creatures = replaceById(app.state.creatures, next);
  app.actions.logEvent(
    'travel',
    travelsWithParty ? `${next.name} parts from the party.` : `${next.name} joins the party.`,
    { gm: true },
  );
  if (travelsWithParty) commitCreatures(app);
  else bringToParty(app, next);
}
