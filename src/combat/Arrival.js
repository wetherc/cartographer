/**
 * The text of the walked-into-something alert. A step onto a tile can meet
 * two kinds of threat: an encounter staged there and a hostile NPC standing
 * there. Both carry a name and the same two hit-point fields, so one
 * formatter names both, and the alert cannot describe an NPC differently
 * from a foe.
 *
 * Pure over its inputs. The wiring layer collects who is on the tile and
 * decides what to do with the result.
 */

import { hpBand } from '../view/ViewRole.js';

/**
 * A threat as this module reads it: the fields an `Encounter` and an `NPC`
 * both carry.
 * @typedef {{ name: string, currentHP: number, maxHP: number }} ArrivalThreat
 */

/**
 * The alert's title and message for the threats on a tile, or null when the
 * tile holds none. The GM sees exact hit points. A player sees the coarse
 * band, the same rule the panels follow.
 * @param {ArrivalThreat[]} threats
 * @param {{ gm: boolean, subject: string, region: string }} context
 * @returns {{ title: string, message: string } | null}
 */
export function arrivalAlert(threats, { gm, subject, region }) {
  if (threats.length === 0) return null;
  const names = threats.map((t) =>
    gm ? `${t.name} (${t.currentHP}/${t.maxHP} HP)` : `${t.name} (${hpBand(t.currentHP, t.maxHP)})`,
  );
  return {
    title: threats.length > 1 ? 'Encounters!' : 'Encounter!',
    message: `${subject} has come upon ${nameList(names)} here in ${region}.`,
  };
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
