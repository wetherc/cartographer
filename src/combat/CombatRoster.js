import { effectiveStatBlock, isDefeated } from '../entities/Creature.js';
import { creaturesNear, encounterGroup, isOnTile } from '../entities/CreatureMap.js';
import { parseCoords } from '../map/MapGeometry.js';
import { effectiveStats } from '../entities/Equipment.js';
import { abilityModifier } from '../entities/Modifiers.js';
import { createParticipant } from './Initiative.js';

/**
 * The combatants of a fight that starts where the party stands, and the log line
 * of the initiative roll. `app/encounterWiring.js` opens the setup dialog with
 * these.
 */

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/map.js').PartyPosition} PartyPosition */
/** @typedef {{ participant: Participant, tileId: string, distance: number }} NearbyFoe */

/**
 * A participant with its DEX modifier, at the passive initiative of 10 plus
 * that modifier.
 * @param {string} id
 * @param {Record<string, number> | undefined} stats
 * @returns {Participant}
 */
function withDex(id, stats) {
  const mod = abilityModifier(stats?.DEX ?? 10);
  return createParticipant(id, 10 + mod, mod);
}

/**
 * A creature as a participant with its DEX modifier, for a creature that
 * joins a running fight.
 * @param {Creature} creature
 * @returns {Participant}
 */
export function creatureParticipant(creature) {
  return withDex(creature.id, effectiveStatBlock(creature));
}

/**
 * The radius in tiles of the Nearby tab and of the "Add nearby foes" list:
 * four times the party's sight radius.
 * @param {number} revealRadius
 * @returns {number}
 */
export function nearbyRadius(revealRadius) {
  return revealRadius * 4;
}

/**
 * The straight-line distance in tiles between two tile ids on one map,
 * rounded to a whole tile. An unreadable id gives Infinity.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function tileDistance(a, b) {
  const p = parseCoords(a);
  const q = parseCoords(b);
  return p && q ? Math.round(Math.hypot(p.x - q.x, p.y - q.y)) : Infinity;
}

/**
 * The undefeated hostile creatures within `radius` of the party that the
 * roster leaves out, because they stand outside the encounter group. Each
 * comes as a participant with its tile and its distance in tiles, nearest
 * first. The
 * setup dialog offers them under "Add nearby foes". An unplaced creature has
 * no distance, so it is never offered.
 * @param {Creature[]} creatures
 * @param {PartyPosition} position
 * @param {number} radius
 * @returns {NearbyFoe[]}
 */
export function nearbyFoes(creatures, position, radius) {
  const grouped = new Set(encounterGroup(creatures, position).map((c) => c.id));
  return creaturesNear(creatures, position, radius)
    .filter((c) => c.disposition === 'hostile' && !isDefeated(c) && !grouped.has(c.id))
    .flatMap((c) =>
      c.location && position
        ? [
            {
              participant: creatureParticipant(c),
              tileId: c.location.tileId,
              distance: tileDistance(c.location.tileId, position.tileId),
            },
          ]
        : [],
    )
    .sort((a, b) => a.distance - b.distance);
}

/**
 * The nearby foes split into groups, one per tile, in the order of their
 * first foe. The setup dialog offers "Add the whole group" for a group of
 * two or more, so the GM adds four wolves with one tick.
 * @param {NearbyFoe[]} nearby
 * @returns {NearbyFoe[][]}
 */
export function nearbyGroups(nearby) {
  /** @type {Map<string, NearbyFoe[]>} */
  const groups = new Map();
  for (const foe of nearby) {
    const group = groups.get(foe.tileId);
    if (group) group.push(foe);
    else groups.set(foe.tileId, [foe]);
  }
  return [...groups.values()];
}

/**
 * Whether a running fight is still in reach of the party. It is while any
 * creature in the order stands in the encounter group of the party, or while
 * any hostile in the order stands within `radius`, the radius of "Add
 * nearby foes". The wider radius lets a foe that joined from farther away
 * keep the fight open. A defeated combatant counts, because a combatant at
 * 0 HP is a turn in the fight.
 * @param {Participant[]} order
 * @param {Creature[]} creatures
 * @param {PartyPosition} position
 * @param {number} radius
 * @returns {boolean}
 */
export function fightInReach(order, creatures, position, radius) {
  const inFight = new Set(order.map((p) => p.id));
  if (encounterGroup(creatures, position).some((c) => inFight.has(c.id))) return true;
  return creaturesNear(creatures, position, radius).some(
    (c) => c.location !== null && c.disposition === 'hostile' && inFight.has(c.id),
  );
}

/**
 * The combatants are everyone involved in this encounter: the whole party,
 * the undefeated hostile creatures of the encounter group (the party's tile
 * and the tiles around it), and any friendly or neutral creature on the
 * party's own tile. Hostile creatures line up as foes. Friendly and neutral
 * ones line up with the party. Each combatant carries its
 * DEX modifier. This modifier seeds the default value (10 + modifier, the
 * passive baseline), adds to the d20 roll from Roll initiative, and shows
 * beside the name. The GM can edit every value by hand.
 * @param {import('../types/entities.js').Character[]} characters
 * @param {import('../types/creature.js').Creature[]} creatures
 * @param {import('../types/map.js').PartyPosition} position
 * @returns {import('../types/combat.js').Participant[]}
 */
export function combatRoster(characters, creatures, position) {
  // A defeated hostile stays staged but takes no part in a new fight. A
  // bystander on the party's tile joins whatever its condition. One on a
  // neighbouring tile stays out, because it is not part of the encounter.
  const roster = encounterGroup(creatures, position).filter((c) =>
    c.disposition === 'hostile' ? !isDefeated(c) : isOnTile(c, position),
  );
  return [
    ...characters.map((c) => withDex(c.id, effectiveStats(c))),
    ...roster.map((c) => withDex(c.id, effectiveStatBlock(c))),
  ];
}

/**
 * The travelogue line for one press of Roll initiative. It records every
 * result, and a roll that something slanted states why, in parentheses after
 * its value.
 * @param {{ name: string, value: number, note: string }[]} results
 * @returns {string}
 */
export function initiativeLine(results) {
  return `Initiative rolled: ${results
    .map((r) => `${r.name} ${r.value}${r.note ? ` (${r.note})` : ''}`)
    .join(', ')}.`;
}

/**
 * The title of one nearby group for the "Add the whole group" box: each name
 * once, in order of its first foe, with a count when more than one foe has
 * it ("Gray Wolf x4", or "Gray Wolf x2, Goblin"). The box then tells which
 * creatures it adds, and two groups at the same distance read apart.
 * @param {string[]} names the plain names of the foes, without numbers
 * @returns {string}
 */
export function groupTitle(names) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} x${n}` : name)).join(', ');
}
