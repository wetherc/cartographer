import { carriesSpellFocus } from './Equipment.js';

/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * Whether the caster must hold a spell's material component, and which
 * inventory stack it comes from. A material that the cast destroys must be
 * in the inventory. So must one that carries a gp cost,
 * because the SRD says a pouch or a focus never covers a costed component.
 * Anything else is covered, but only while the caster carries a pouch or a
 * focus. A caster with neither has to hold the printed material itself.
 *
 * `required` and `consumes` are separate answers. Chromatic Orb's 50 gp
 * diamond must be in hand and stays there. Only a destroyed material comes
 * off the stack.
 *
 * The match is deliberately loose, because the material is printed prose and
 * an inventory stack is a name. A stack satisfies the spell when either name
 * contains the other, case-insensitively, so "Diamond" covers "diamonds
 * worth 300 gp". A material with no printed text names nothing to look for,
 * so it is never required. A combatant with no inventory at all, such as a
 * creature, is never required to hold anything, because it has nowhere to
 * hold it.
 * @param {{ inventory?: import('../types/entities.js').InventoryItem[] }} caster
 * @param {Spell} spell
 * @returns {{
 *   required: boolean,
 *   satisfied: boolean,
 *   item: import('../types/entities.js').InventoryItem | null,
 *   consumes: boolean,
 * }}
 */
export function materialCheck(caster, spell) {
  const materials = spell.materials;
  const inventory = caster.inventory;
  const exempt = { required: false, satisfied: true, item: null, consumes: false };
  if (!materials?.text || !Array.isArray(inventory)) return exempt;
  const consumes = !!materials.consumed;
  const costed = (materials.costGP ?? 0) > 0;
  if (!consumes && !costed && carriesSpellFocus(inventory)) return exempt;
  const wanted = materials.text.toLowerCase();
  const item =
    inventory.find((i) => {
      const name = i.name?.trim().toLowerCase();
      return !!name && (wanted.includes(name) || name.includes(wanted));
    }) ?? null;
  return { required: true, satisfied: item !== null, item, consumes };
}
