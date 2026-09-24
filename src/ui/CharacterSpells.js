import { getSpellbook } from '../entities/Character.js';
import { getClass, casterClassRefs, primaryCasterClass } from '../entities/Classes.js';
import { groupSpellsByLevel, castableLeveledIds, isRitualOnly } from '../entities/SpellView.js';
import { emptyState, sectionLabel, textButton } from './buttons.js';
import { el } from './dom.js';
import { promptSpellDetail } from './SpellDetail.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * This builds the character-sheet spellbook: a read-only view of the
 * spells the character can cast right now, grouped by spell level. It
 * shows cantrips plus the leveled spells that the known-rule makes
 * castable, prepared ones under a prepared-rule class, and every known
 * one under a known-rule class. A Wizard's unprepared rituals list too,
 * titled as rituals, because the Wizard casts them from the book. A click
 * on a spell opens its detail, which offers Cast, in play, and Close.
 * Learning, preparing, and
 * forgetting a spell live in the Spellbook tab, not here. A character
 * with no caster class and an empty spellbook renders nothing and returns null.
 * @param {Character} character
 * @param {{
 *   play: boolean,
 *   resolveSpells: (ids: string[]) => Spell[],
 *   onCast: (spell: Spell) => void,
 * }} opts
 *   `resolveSpells` maps stored ids to Spell objects. An unknown id drops
 *   out. `onCast` opens the cast dialog for a chosen spell.
 * @returns {HTMLElement | null}
 */
export function buildSpellsSection(character, opts) {
  const book = getSpellbook(character);
  const hasEntries = book.cantrips.length > 0 || book.known.length > 0;
  if (casterClassRefs(character).length === 0 && !hasEntries) return null;

  const className = getClass(primaryCasterClass(character)?.classId)?.name;
  const section = el(
    'div',
    'character-sheet__spells u-col u-g2',
    sectionLabel(className ? `Spells (${className})` : 'Spells'),
  );

  // This makes one group per spell level the character can cast from, in
  // ascending order: cantrips first, then each level with something
  // castable. The heading tells a caster with a wide spread which slot
  // level a spell costs.
  const groups = groupSpellsByLevel([
    ...opts.resolveSpells(book.cantrips),
    ...opts.resolveSpells(castableLeveledIds(character)),
    ...opts.resolveSpells(book.known).filter((spell) => isRitualOnly(character, spell)),
  ]);
  if (groups.length === 0) {
    section.appendChild(emptyState('Nothing castable'));
    return section;
  }
  // The groups sit side by side across the full width of the section and
  // wrap. A caster with several levels prepared does not turn into one
  // long column.
  const levels = el('div', 'character-sheet__spell-levels');
  for (const group of groups) {
    levels.appendChild(buildGroup(character, group.label, group.spells, opts));
  }
  section.appendChild(levels);
  return section;
}

/**
 * One spell level's row of castable chips, under its level heading. A
 * click on a chip opens the spell's detail, which offers Cast when the
 * viewer can play the character. This runs only for a level that has spells.
 * @param {Character} character
 * @param {string} title
 * @param {Spell[]} spells
 * @param {{ play: boolean, onCast: (spell: Spell) => void }} opts
 * @returns {HTMLElement}
 */
function buildGroup(character, title, spells, opts) {
  const list = el('div', 'u-row u-wrap u-g1');
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
          title: `${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`}${
            isRitualOnly(character, spell) ? ', ritual only' : ''
          })`,
        },
      ),
    );
  }
  return el('div', 'u-col u-g1', sectionLabel(title), list);
}
