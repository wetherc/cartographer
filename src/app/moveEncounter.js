import { characterPosition } from '../party/CharacterTokens.js';

/** @typedef {import('../types/app.js').AppContext} AppContext */
/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Check for an encounter after a move onto another map. A lone character
 * meets the hostiles at its own position, under its own name. With no
 * subject, the whole party moved, and the check reads the party position.
 * The move replaced the character object, so the roster is read again by id.
 * @param {AppContext} app
 * @param {Character | null | undefined} subject
 */
export function triggerEncounterAfterMove(app, subject) {
  if (!subject) {
    void app.actions.maybeTriggerEncounter();
    return;
  }
  const moved = app.state.characters.find((c) => c.id === subject.id) ?? subject;
  void app.actions.maybeTriggerEncounter(
    characterPosition(moved, app.partyTracker.getPosition()),
    subject.name,
  );
}
