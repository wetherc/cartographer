import { getSpellbook } from '../entities/Character.js';
import { isCasterClass, getClass } from '../entities/Classes.js';
import { icon } from './icons.js';
import { emptyState } from './buttons.js';
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
  if (!isCasterClass(character.class) && !hasEntries) return null;

  const section = document.createElement('div');
  section.className = 'character-sheet__spells';

  const label = document.createElement('span');
  label.className = 'section-label';
  const className = getClass(character.class)?.name;
  label.textContent = className ? `Spells (${className})` : 'Spells';
  section.appendChild(label);

  const cantrips = opts.resolveSpells(book.cantrips);
  const prepared = opts.resolveSpells(book.prepared);

  section.appendChild(buildGroup('Cantrips', cantrips, opts));
  section.appendChild(buildGroup('Prepared', prepared, opts));
  return section;
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
  const group = document.createElement('div');
  group.className = 'character-sheet__spell-group';

  const heading = document.createElement('span');
  heading.className = 'section-label';
  heading.textContent = title;
  group.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'character-sheet__spell-chips';
  if (spells.length === 0) list.appendChild(emptyState('None'));
  for (const spell of spells) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'btn character-sheet__spell-chip';
    chip.title = `${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`})`;
    chip.append(icon('sparkles'), document.createTextNode(spell.name));
    chip.addEventListener('click', async () => {
      const action = await promptSpellDetail(
        spell,
        opts.play ? [{ id: 'cast', label: 'Cast', variant: 'primary' }] : [],
      );
      if (action === 'cast') opts.onCast(spell);
    });
    list.appendChild(chip);
  }
  group.appendChild(list);
  return group;
}
