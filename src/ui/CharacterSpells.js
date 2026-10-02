import { getSpellbook } from '../entities/Character.js';
import { casterClassRefs, primaryCasterClass } from '../entities/Classes.js';
import { casterName } from '../entities/ClassCasting.js';
import { groupSpellsByLevel, castableLeveledIds, isRitualOnly } from '../entities/SpellView.js';
import { invocationSpellIds, invokedSpell } from '../entities/Invocations.js';
import { arcanumSpellIds, warlockCast } from '../entities/MysticArcanum.js';
import { tomeRituals } from '../entities/PactTome.js';
import { thirdCasterSpellIssues } from '../entities/ThirdCasterSpells.js';
import { emptyState, sectionLabel, textButton } from './buttons.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { promptSpellDetail } from './SpellDetail.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */

/** The title of the group of Mystic Arcanum spells. */
const ARCANUM = 'Mystic Arcanum';
/** The groups whose spells a warlock casts through a class feature. */
const FEATURE_GROUPS = ['Invocations', ARCANUM];

/**
 * This builds the character-sheet spellbook: a read-only view of the
 * spells the character can cast right now, grouped by spell level. It
 * shows cantrips plus the leveled spells that the known-rule makes
 * castable, prepared ones under a prepared-rule class, and every known
 * one under a known-rule class. A Wizard's unprepared rituals list too,
 * titled as rituals, because the Wizard casts them from the book. The
 * rituals in the Book of Shadows of a warlock with Book of Ancient Secrets
 * list the same way. The spells
 * that a warlock casts through its invocations and not from the book list in
 * a group of their own, and every spell reads as the invocations change it
 * (Agonizing Blast on Eldritch Blast, for example). The Mystic Arcanum spells
 * list in a group of their own too, and a spent one reads struck through. A click
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

  const primary = primaryCasterClass(character);
  const className = primary ? casterName(primary) : undefined;
  const section = el(
    'div',
    'character-sheet__spells u-col u-g2',
    sectionLabel(className ? `Spells (${className})` : 'Spells'),
  );
  // The subclass spell rules warn and do not block, because the GM may
  // allow a spell list that the rules do not.
  const issues = thirdCasterSpellIssues(character, opts.resolveSpells);
  if (issues.length > 0) {
    section.appendChild(
      el(
        'ul',
        'character-sheet__spell-warnings u-col u-g1',
        ...issues.map((text) => el('li', 'u-row u-g1', icon('warning', { size: 14 }), text)),
      ),
    );
  }

  // This makes one group per spell level the character can cast from, in
  // ascending order: cantrips first, then each level with something
  // castable. The heading tells a caster with a wide spread which slot
  // level a spell costs.
  const fromBook = [
    ...opts.resolveSpells(book.cantrips),
    ...opts.resolveSpells(castableLeveledIds(character)),
    ...opts
      .resolveSpells([...new Set([...book.known, ...tomeRituals(character)])])
      .filter((spell) => isRitualOnly(character, spell)),
  ];
  const invoked = opts
    .resolveSpells(invocationSpellIds(character))
    .filter((spell) => !fromBook.some((s) => s.id === spell.id));
  const arcana = opts
    .resolveSpells(arcanumSpellIds(character))
    .filter((spell) => !fromBook.some((s) => s.id === spell.id));
  const groups = [
    // A book spell that an invocation also casts at will shows as the book
    // has it. The cast dialog offers the at-will cast as a choice.
    ...groupSpellsByLevel(
      fromBook.map((spell) => invokedSpell(character, spell, { atWill: false })),
    ),
    ...(invoked.length > 0
      ? [{ label: 'Invocations', spells: invoked.map((spell) => invokedSpell(character, spell)) }]
      : []),
    ...(arcana.length > 0 ? [{ label: ARCANUM, spells: arcana }] : []),
  ];
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
          className: spentInvocation(character, spell, title)
            ? 'character-sheet__spell-chip character-sheet__spell-chip--spent'
            : 'character-sheet__spell-chip',
          title: `${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`}${
            isRitualOnly(character, spell) ? ', ritual only' : ''
          }${viaText(character, spell, title)})`,
        },
      ),
    );
  }
  return el('div', 'u-col u-g1', sectionLabel(title), list);
}

/**
 * How a spell in the Invocations or Mystic Arcanum group is cast, for its chip tooltip, for
 * example ", Armor of Shadows, at will" or ", Mire the Mind, once per long
 * rest, spent". A spell in a level group reads as an empty string.
 * @param {Character} character
 * @param {Spell} spell
 * @param {string} group the group title
 * @returns {string}
 */
function viaText(character, spell, group) {
  const via = FEATURE_GROUPS.includes(group) ? warlockCast(character, spell.id) : null;
  if (!via) return '';
  const how = via.oncePerRest
    ? `once per long rest, ${via.spent ? 'spent' : 'available'}`
    : 'at will';
  return `, ${via.invocation.name}, ${how}`;
}

/**
 * Whether a spell in the Invocations or Mystic Arcanum group comes from a
 * once-per-rest feature that is spent until a long rest. Its chip reads muted and
 * struck through.
 * @param {Character} character
 * @param {Spell} spell
 * @param {string} group the group title
 * @returns {boolean}
 */
function spentInvocation(character, spell, group) {
  return FEATURE_GROUPS.includes(group) && !!warlockCast(character, spell.id)?.spent;
}
