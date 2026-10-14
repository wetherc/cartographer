/**
 * The text of the walked-into-something alert. A step onto a tile can meet
 * a hostile creature standing there, and this module writes the line that
 * names it.
 *
 * Pure over its inputs. The wiring layer collects who is on the tile and
 * decides what to do with the result.
 */

import { hpBand } from '../view/ViewRole.js';

/**
 * A threat as this module reads it: the name and hit-point fields of a
 * creature.
 * @typedef {{ name: string, currentHP: number, maxHP: number }} ArrivalThreat
 */

/**
 * The alert's title and message for the threats on a tile, or null when the
 * tile holds none. Threats that share a name read as one group ("4 Gray
 * Wolves"), in the order each name first appears. Only a hurt creature shows
 * its health. The GM sees exact hit points, and a player sees the coarse
 * band, the same rule the panels follow.
 * @param {ArrivalThreat[]} threats
 * @param {{ gm: boolean, subject: string, region: string }} context
 * @returns {{ title: string, message: string } | null}
 */
export function arrivalAlert(threats, { gm, subject, region }) {
  if (threats.length === 0) return null;
  /** @type {Map<string, ArrivalThreat[]>} */
  const groups = new Map();
  for (const t of threats) groups.set(t.name, [...(groups.get(t.name) ?? []), t]);
  const health = (/** @type {ArrivalThreat} */ t) =>
    gm ? `${t.currentHP}/${t.maxHP} HP` : hpBand(t.currentHP, t.maxHP);
  const names = [...groups].map(([name, members]) => {
    const hurt = members.filter((t) => t.currentHP < t.maxHP).map(health);
    if (members.length === 1) return hurt.length ? `${name} (${hurt[0]})` : name;
    const label = `${members.length} ${pluralName(name)}`;
    return hurt.length ? `${label} (hurt: ${hurt.join(', ')})` : label;
  });
  return {
    title: threats.length > 1 ? 'Encounters!' : 'Encounter!',
    message: `${subject} has come upon ${nameList(names)} here in ${region}.`,
  };
}

/** Last words whose plural changes the f to "ves". */
const VES = /(wolf|dwarf|elf|thief)$/i;

/**
 * The plural of a creature name, by its last word: "Gray Wolf" to "Gray
 * Wolves", "Harpy" to "Harpies", "Bandit Captain" to "Bandit Captains". The
 * rules cover regular English plurals and the common f-to-ves words. A name
 * outside them, such as "Sheep", gets a plain "s".
 * @param {string} name
 * @returns {string}
 */
export function pluralName(name) {
  if (VES.test(name)) return `${name.slice(0, -1)}ves`;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(name)) return `${name}es`;
  return `${name}s`;
}

/**
 * The names as one phrase: "A", "A and B", or "A, B and C".
 * @param {string[]} names
 * @returns {string}
 */
function nameList(names) {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
