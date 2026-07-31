import { el } from './dom.js';
import { chip } from './buttons.js';

/** @typedef {import('../combat/Loadout.js').Loadout} Loadout */

/**
 * A combatant's loadout as a short block of labelled lines: what they are
 * wearing, what they can swing, how many spells they have, and what is left in
 * their slot pools. Shared by the board's cards and the active-combatant column,
 * so the two cannot describe the same combatant differently.
 *
 * `detailed` is the column's fuller form: weapons print their damage roll and
 * the slot pools each get a chip. A card gets names and a compact slot summary
 * instead, since a card sits next to five others.
 *
 * The block draws exactly what it is handed. Whether the viewer may see a
 * combatant's spells at all is decided before this point (see
 * `combat/Loadout.js`), which is why an empty list here means nothing to draw
 * rather than nothing to know.
 * @param {Loadout} loadout
 * @param {{ detailed?: boolean }} [options]
 * @returns {HTMLElement | null}
 */
export function loadoutBlock(loadout, { detailed = false } = {}) {
  /** @type {HTMLElement[]} */
  const lines = [];

  if (loadout.armor.length > 0) lines.push(line('Wearing', loadout.armor.join(', ')));

  if (loadout.weapons.length > 0) {
    const weapons = loadout.weapons.map((w) => (detailed ? `${w.name} (${w.damage})` : w.name));
    lines.push(line('Weapons', weapons.join(', ')));
  }

  const spells = spellSummary(loadout.spells);
  if (spells) lines.push(line('Spells', spells));

  if (loadout.slots.length > 0) {
    lines.push(
      detailed
        ? el(
            'div',
            'loadout__line loadout__line--slots',
            el('span', 'loadout__label', 'Slots'),
            el(
              'span',
              'loadout__chips u-row u-wrap u-g1',
              ...loadout.slots.map((slot) =>
                chip(`${slotLabel(slot)}: ${slot.remaining}/${slot.max}`),
              ),
            ),
          )
        : line('Slots', loadout.slots.map(compactSlot).join(', ')),
    );
  }

  if (lines.length === 0) return null;
  return el('div', `loadout${detailed ? ' loadout--detailed' : ''}`, ...lines);
}

/**
 * One labelled line.
 * @param {string} label
 * @param {string} value
 */
function line(label, value) {
  return el(
    'div',
    'loadout__line',
    el('span', 'loadout__label', label),
    el('span', 'loadout__value', value),
  );
}

/**
 * The spell counts in words, or null for a combatant with none. Cantrips are
 * counted apart from leveled spells because a cantrip costs nothing to cast and
 * a leveled spell spends a slot.
 * @param {Loadout['spells']} spells
 * @returns {string | null}
 */
function spellSummary(spells) {
  /** @type {string[]} */
  const parts = [];
  if (spells.cantrips > 0) parts.push(`${spells.cantrips} cantrip${plural(spells.cantrips)}`);
  if (spells.leveled > 0) parts.push(`${spells.leveled} spell${plural(spells.leveled)}`);
  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * A slot pool's name in the column: the spellbook's wording.
 * @param {Loadout['slots'][number]} slot
 */
function slotLabel(slot) {
  return slot.pact ? `Pact (level ${slot.level})` : `Level ${slot.level}`;
}

/**
 * A slot pool on one line: "L2 1/3". A card has no room for the full label.
 * @param {Loadout['slots'][number]} slot
 */
function compactSlot(slot) {
  return `${slot.pact ? 'Pact' : `L${slot.level}`} ${slot.remaining}/${slot.max}`;
}

/** @param {number} n */
function plural(n) {
  return n === 1 ? '' : 's';
}
