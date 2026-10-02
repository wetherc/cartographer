import { chipRider, riderSummary } from '../entities/Riders.js';
import { formatDamage } from '../entities/Equipment.js';
import { modsSummary } from '../entities/ChipMods.js';
import { capitalize } from '../util/text.js';

/**
 * What a condition chip says: the label on the chip itself, and the lines of
 * its tooltip. The conditions bar, the combatant card, and the active column
 * of the combat screen all show chips, and they read their text here so the
 * three never disagree.
 */

/** @typedef {import('../types/entities.js').Condition} Condition */

/**
 * The text on a chip: its name, then the rounds it has left. A chip that ends
 * at a turn boundary says "next turn" instead, because it counts turns and not
 * rounds.
 * @param {Condition} condition
 * @returns {string}
 */
export function chipLabel(condition) {
  if (condition.expires) return `${condition.name} (next turn)`;
  if (condition.rounds === null || condition.rounds === undefined) return condition.name;
  return `${condition.name} (${condition.rounds})`;
}

/**
 * The tooltip lines of a chip: what it adds to its holder's rolls, what it
 * changes besides a roll (such as AC), the damage it deals on later turns,
 * and the turn boundary that ends it. A chip with none of these has no
 * tooltip, and the list comes back empty.
 * @param {Condition} condition
 * @param {(id: string) => string | undefined} [nameOf] the name of a
 *   combatant, for the boundary line. Without it, the line names no one.
 * @returns {string[]}
 */
export function chipNotes(condition, nameOf = () => undefined) {
  /** @type {string[]} */
  const lines = [];
  const rider = chipRider(condition);
  if (rider) lines.push(riderSummary(rider));
  const mods = modsSummary(condition.mods);
  if (mods) lines.push(capitalize(mods));
  const damage = condition.ongoing ? formatDamage(condition.ongoing.damage) : '';
  if (damage) {
    lines.push(
      condition.source?.saveEnds
        ? `${damage} at the end of each turn, on a failed save`
        : `${damage} at the end of each turn`,
    );
  }
  const expires = condition.expires;
  if (expires) {
    const who = nameOf(expires.who);
    lines.push(`Ends at the ${expires.at} of ${who ? `${who}'s` : 'a'} turn`);
  }
  return lines;
}

/**
 * The cast that wrote a chip, for its tooltip and the label of its remove
 * button: "Ana's Hold Person", or the spell alone when the chip does not
 * name its caster. A hand-added chip names no cast, and the text comes back
 * empty. Two casts of a spell that tracks its cast each keep a chip of the
 * same name (see `Conditions.tracksCast`), and this text tells them apart.
 * @param {Condition} condition
 * @returns {string}
 */
export function chipOrigin(condition) {
  const source = condition.source;
  if (!source?.spellName) return '';
  return source.casterName ? `${source.casterName}'s ${source.spellName}` : source.spellName;
}
