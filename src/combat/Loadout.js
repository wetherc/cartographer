/**
 * What a combatant brings to the fight, as display-ready values: worn armor,
 * the weapons it can swing, how many spells it has to hand, and what is left in
 * its slot pools. The combat board showed HP and AC only, which is enough to
 * pick a target and nothing like enough for a player to see what their turn can
 * do; this module is the one statement of how each of those reads.
 *
 * Not all of it is public. Armor and a drawn weapon are visible across the
 * table: anyone in the fight can see what someone is wearing and swinging. What
 * a caster has prepared and how many slots they have left is theirs, so it goes
 * only to that player's own tab and to the GM. `loadoutAccess` states that rule
 * once, and `buildLoadout` never assembles what the viewer may not see rather
 * than leaving the filtering to whichever surface draws it.
 *
 * Pure over its inputs. The resolved combatant comes from the wiring layer (the
 * same `ResolvedCombatant` the combat view takes), and the castable spell list
 * is injected because resolving spell ids needs the merged library, which only
 * the wiring layer can see.
 */

import { equippedWeapons, formatDamage, getEquipped } from '../entities/Equipment.js';
import { getPactPool, getSlotPools, slotLevelOf } from '../entities/SpellSlots.js';
import { sideOf } from './CombatView.js';

/** @typedef {import('./CombatView.js').ResolvedCombatant} ResolvedCombatant */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * One slot pool: its spell level, whether it is pact magic (which refreshes on a
 * short rest and is worth telling apart), and how much of it is unspent.
 * @typedef {{ level: number, pact: boolean, remaining: number, max: number }} SlotLine
 */

/**
 * @typedef {{
 *   armor: string[],
 *   weapons: { name: string, damage: string }[],
 *   spells: { cantrips: number, leveled: number },
 *   slots: SlotLine[],
 * }} Loadout
 */

/**
 * How much of a combatant's loadout a viewer may see. `full` is everything,
 * `public` is armor and weapons only, `none` draws nothing at all.
 * @typedef {'full' | 'public' | 'none'} LoadoutAccess
 */

/** A combatant carrying nothing worth showing. */
const EMPTY = { armor: [], weapons: [], spells: { cantrips: 0, leveled: 0 }, slots: [] };

/**
 * What a viewer may see of a combatant's loadout. The GM sees all of it. A
 * player sees their own character whole, another party member's armor and
 * weapons only (their spell list and slots are that player's business), and
 * nothing at all of a foe, whose sheet is the GM's to reveal.
 * @param {ResolvedCombatant | null} found
 * @param {{ gm: boolean, boundCharacterId?: string | null }} viewer
 * @param {string} id the participant being looked at
 * @returns {LoadoutAccess}
 */
export function loadoutAccess(found, viewer, id) {
  if (viewer.gm) return 'full';
  if (!found || sideOf(found) === 'foe') return 'none';
  return viewer.boundCharacterId === id ? 'full' : 'public';
}

/**
 * Assemble as much of a combatant's loadout as `access` allows.
 * @param {ResolvedCombatant | null} found
 * @param {Spell[]} [spells] the castable list, already resolved
 * @param {LoadoutAccess} [access]
 * @returns {Loadout}
 */
export function buildLoadout(found, spells = [], access = 'full') {
  if (!found || access === 'none') return EMPTY;
  const shared = { armor: armorOf(found), weapons: weaponsOf(found) };
  if (access === 'public') return { ...shared, spells: { cantrips: 0, leveled: 0 }, slots: [] };
  return { ...shared, spells: countSpells(spells), slots: slotsOf(found) };
}

/**
 * Whether a loadout has nothing to draw, so a card can leave the block out
 * rather than render an empty one.
 * @param {Loadout} loadout
 * @returns {boolean}
 */
export function isEmptyLoadout(loadout) {
  return (
    loadout.armor.length === 0 &&
    loadout.weapons.length === 0 &&
    loadout.slots.length === 0 &&
    loadout.spells.cantrips === 0 &&
    loadout.spells.leveled === 0
  );
}

/**
 * The protective pieces worn, named: a character's body armor and shield, a
 * foe's authored armor. NPCs record none.
 * @param {ResolvedCombatant} found
 * @returns {string[]}
 */
function armorOf(found) {
  if (found.kind === 'character') {
    const chest = getEquipped(found.entity, 'chest');
    const offHand = getEquipped(found.entity, 'offHand');
    return [chest?.name, offHand?.type === 'shield' ? offHand.name : null].filter(
      /** @returns {name is string} */ (name) => Boolean(name),
    );
  }
  if (found.kind === 'encounter') return found.entity.armor ? [found.entity.armor.name] : [];
  return [];
}

/**
 * The weapons available, each with its damage written out: a character's
 * equipped weapons in slot order, a foe's single weapon. Same lists the action
 * bar offers, so a card and the bar cannot disagree.
 * @param {ResolvedCombatant} found
 * @returns {{ name: string, damage: string }[]}
 */
function weaponsOf(found) {
  /** @type {{ name: string, damage?: import('../types/entities.js').DamagePart[] }[]} */
  let weapons = [];
  if (found.kind === 'character') weapons = equippedWeapons(found.entity);
  else if (found.kind === 'encounter' && found.entity.weapon) weapons = [found.entity.weapon];
  return weapons.map((weapon) => ({
    name: weapon.name,
    damage: formatDamage(weapon.damage ?? []),
  }));
}

/**
 * Split a castable list into cantrips and leveled spells, which is what a card
 * can say in one line without listing a caster's whole book.
 * @param {Spell[]} spells
 */
function countSpells(spells) {
  let cantrips = 0;
  for (const spell of spells) if (spell.level === 0) cantrips += 1;
  return { cantrips, leveled: spells.length - cantrips };
}

/**
 * The slot pools with anything left in them, leveled first and pact magic
 * after, each labelled by its spell level. Pools already spent to zero are kept
 * so a player can see the whole shape of what they started the fight with.
 * @param {ResolvedCombatant} found
 * @returns {SlotLine[]}
 */
function slotsOf(found) {
  const holder = { resources: found.entity.resources ?? [] };
  const lines = getSlotPools(holder).map((pool) => ({
    level: slotLevelOf(pool),
    pact: false,
    remaining: pool.current,
    max: pool.max,
  }));
  const pact = getPactPool(holder);
  if (pact) {
    lines.push({
      level: slotLevelOf(pact),
      pact: true,
      remaining: pact.current,
      max: pact.max,
    });
  }
  return lines;
}
