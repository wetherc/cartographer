import { getSpellbook } from '../entities/Character.js';
import { getClass, casterClassRefs, primaryCasterClass } from '../entities/Classes.js';
import { emptyState, textButton } from './buttons.js';
import { el } from './dom.js';
import { promptSpellDetail } from './SpellDetail.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The character-sheet spellbook: a read-only view of the spells the character
 * can cast right now — cantrips and prepared leveled spells. Clicking a spell
 * opens its detail, which offers Cast (in play) and Close; there is no
 * learn/prepare/forget here, that lives in the Spellbook tab. A character with
 * no caster class and an empty spellbook renders nothing (returns null).
 * @param {Character} character
 * @param {{
 *   play: boolean,
 *   resolveSpells: (ids: string[]) => Spell[],
 *   onCast: (spell: Spell) => void,
 * }} opts
 *   `resolveSpells` maps stored ids to Spell objects (unknown ids drop out);
 *   `onCast` opens the cast dialog for a chosen spell.
 * @returns {HTMLElement | null}
 */
export function buildSpellsSection(character, opts) {
  const book = getSpellbook(character);
  const hasEntries = book.cantrips.length > 0 || book.known.length > 0;
  if (casterClassRefs(character).length === 0 && !hasEntries) return null;

  const className = getClass(primaryCasterClass(character)?.classId)?.name;
  return el(
    'div',
    'character-sheet__spells u-col u-g2',
    el('span', 'section-label', className ? `Spells (${className})` : 'Spells'),
    buildGroup('Cantrips', opts.resolveSpells(book.cantrips), opts),
    buildGroup('Prepared', opts.resolveSpells(book.prepared), opts),
  );
}

/**
 * A titled row of castable spell chips. Each chip opens the spell's detail on
 * click; the detail offers Cast (when the viewer may play the character).
 * @param {string} title
 * @param {Spell[]} spells
 * @param {{ play: boolean, onCast: (spell: Spell) => void }} opts
 * @returns {HTMLElement}
 */
function buildGroup(title, spells, opts) {
  const list = el('div', 'u-row u-wrap u-g1');
  if (spells.length === 0) list.appendChild(emptyState('None'));
  for (const spell of spells) {
    list.appendChild(
      textButton(
        spell.name,
        async () => {
          const action = await promptSpellDetail(
            spell,
            opts.play ? [{ id: 'cast', label: 'Cast', variant: 'primary' }] : [],
          );
          if (action === 'cast') opts.onCast(spell);
        },
        {
          icon: 'sparkles',
          className: 'character-sheet__spell-chip',
          title: `${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`})`,
        },
      ),
    );
  }
  return el('div', 'u-col u-g1', el('span', 'section-label', title), list);
}
