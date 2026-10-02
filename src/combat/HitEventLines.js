/**
 * The log line for one thing that a hit or a heal did to a combatant (see
 * `CharacterHit.HitEvent`). The combatant write path in
 * `app/combatantWrites.js` logs these lines in the order the events happened.
 */

/**
 * @param {string} name
 * @param {import('../entities/CharacterHit.js').HitEvent} event
 * @returns {string}
 */
export function hitEventLine(name, event) {
  switch (event.kind) {
    case 'downed':
      return `${name} drops to 0 HP.`;
    case 'massive':
      return `${name} dies from massive damage.`;
    case 'failures':
      return `${name} takes ${event.count === 2 ? 'two failed death saves' : 'a failed death save'} from the hit.`;
    case 'revived':
      return `${name} regains consciousness.`;
    case 'dead':
      return `${name} is dead, and the heal has no effect.`;
    case 'raised':
      return `${name} returns to life.`;
    case 'living':
      return `${name} is not dead, and the spell has no effect.`;
    case 'fell':
      return `${name} falls and loses concentration on ${event.spellName}.`;
    default:
      return (
        `${name} ${event.kept ? 'holds' : 'loses'} concentration on ${event.spellName} ` +
        `(CON save ${event.total} vs DC ${event.dc}).`
      );
  }
}
