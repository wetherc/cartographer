import {
  getSpellbook,
  learnCantrip,
  unlearnCantrip,
  learnSpell,
  unlearnSpell,
  prepareSpell,
  unprepareSpell,
} from '../entities/Character.js';
import { cantripLimit, preparedLimit, isCasterClass, getClass } from '../entities/Classes.js';
import { icon } from './icons.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * The character-sheet spellbook: cantrips and prepared spells as one-click Cast
 * buttons, plus (when the viewer may play the character) learn/prepare/forget
 * controls that respect the class's cantrip and prepared limits. The section is
 * built from the character's stored spell ids resolved against the active spell
 * library; a character with no caster class and an empty spellbook renders
 * nothing (returns null).
 * @param {Character} character
 * @param {{
 *   play: boolean,
 *   commit: (next: Character) => void,
 *   resolveSpells: (ids: string[]) => Spell[],
 *   learnable: (character: Character) => Spell[],
 *   onCast: (spell: Spell) => void,
 * }} opts
 *   `resolveSpells` maps stored ids to Spell objects (unknown ids drop out);
 *   `learnable` returns every spell the character's class may learn (cantrips
 *   and leveled); `onCast` opens the cast dialog for a chosen spell.
 * @returns {HTMLElement | null}
 */
export function buildSpellsSection(character, opts) {
  const book = getSpellbook(character);
  const hasEntries = book.cantrips.length > 0 || book.known.length > 0;
  if (!isCasterClass(character.class) && !hasEntries) return null;

  const section = document.createElement('div');
  section.className = 'character-sheet__spells';

  const label = document.createElement('span');
  label.className = 'character-sheet__section-label';
  const className = getClass(character.class)?.name;
  label.textContent = className ? `Spells (${className})` : 'Spells';
  section.appendChild(label);

  const cantrips = opts.resolveSpells(book.cantrips);
  const prepared = opts.resolveSpells(book.prepared);
  const known = opts.resolveSpells(book.known);
  const learnable = opts.learnable(character);

  // Cantrips: always castable, no slot spent. A picker adds one up to the
  // class's cantrip limit; each known cantrip carries a forget control.
  section.appendChild(
    buildGroup('Cantrips', cantrips, {
      play: opts.play,
      onCast: opts.onCast,
      onForget: (spell) => opts.commit(unlearnCantrip(character, spell.id)),
      picker: opts.play
        ? {
            label: 'Learn cantrip',
            atLimit: book.cantrips.length >= cantripLimit(character),
            options: learnable.filter((s) => s.level === 0 && !book.cantrips.includes(s.id)),
            onPick: (spell) => opts.commit(learnCantrip(character, spell.id)),
          }
        : null,
    }),
  );

  // Prepared spells: the leveled set the caster can actually cast right now.
  const prepLimit = preparedLimit(character);
  section.appendChild(
    buildGroup(
      opts.play ? `Prepared (${book.prepared.length}/${prepLimit})` : 'Prepared',
      prepared,
      {
        play: opts.play,
        onCast: opts.onCast,
        onForget: opts.play ? (spell) => opts.commit(unprepareSpell(character, spell.id)) : null,
        forgetLabel: 'Unprepare',
        forgetIcon: 'minus',
      },
    ),
  );

  // The known list drives preparation: a checkbox prepares/unprepares (bounded
  // by the prepared limit), and a forget control drops the spell entirely. A
  // picker learns new leveled spells from the class list.
  if (opts.play) {
    section.appendChild(buildKnownList(character, known, book, prepLimit, opts, learnable));
  }

  return section;
}

/**
 * A titled row of spell chips. Each chip casts on click; with `onForget` it
 * carries a trailing remove button. An optional `picker` adds a learn select.
 * @param {string} title
 * @param {Spell[]} spells
 * @param {{
 *   play: boolean,
 *   onCast: (spell: Spell) => void,
 *   onForget?: ((spell: Spell) => void) | null,
 *   forgetLabel?: string,
 *   forgetIcon?: import('./icons.js').IconName,
 *   picker?: {
 *     label: string,
 *     atLimit: boolean,
 *     options: Spell[],
 *     onPick: (spell: Spell) => void,
 *   } | null,
 * }} opts
 * @returns {HTMLElement}
 */
function buildGroup(title, spells, opts) {
  const group = document.createElement('div');
  group.className = 'character-sheet__spell-group';

  const heading = document.createElement('span');
  heading.className = 'character-sheet__spell-group-title';
  heading.textContent = title;
  group.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'character-sheet__spell-chips';
  if (spells.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'character-sheet__spell-empty';
    empty.textContent = 'None';
    list.appendChild(empty);
  }
  for (const spell of spells) {
    const chip = document.createElement('span');
    chip.className = 'character-sheet__spell-chip';

    const cast = document.createElement('button');
    cast.type = 'button';
    cast.className = 'btn character-sheet__spell-cast';
    cast.disabled = !opts.play;
    cast.setAttribute('aria-label', `Cast ${spell.name}`);
    cast.title = `Cast ${spell.name} (${spell.level === 0 ? 'cantrip' : `level ${spell.level}`})`;
    cast.append(icon('sparkles'), document.createTextNode(spell.name));
    cast.addEventListener('click', () => opts.onCast(spell));
    chip.appendChild(cast);

    if (opts.play && opts.onForget) {
      const forget = document.createElement('button');
      forget.type = 'button';
      forget.className = 'btn btn--icon character-sheet__spell-forget';
      forget.setAttribute('aria-label', `${opts.forgetLabel ?? 'Forget'} ${spell.name}`);
      forget.title = opts.forgetLabel ?? 'Forget';
      forget.appendChild(icon(opts.forgetIcon ?? 'remove'));
      forget.addEventListener('click', () => opts.onForget?.(spell));
      chip.appendChild(forget);
    }
    list.appendChild(chip);
  }
  group.appendChild(list);

  if (opts.picker) group.appendChild(buildPicker(opts.picker));
  return group;
}

/**
 * A "learn a spell" select: a placeholder option plus one per learnable spell.
 * Picking fires `onPick` and resets to the placeholder. Disabled at the limit.
 * @param {{ label: string, atLimit: boolean, options: Spell[], onPick: (spell: Spell) => void }} picker
 * @returns {HTMLElement}
 */
function buildPicker(picker) {
  const select = document.createElement('select');
  select.className = 'field character-sheet__spell-picker';
  select.setAttribute('aria-label', picker.label);
  select.disabled = picker.atLimit || picker.options.length === 0;

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = picker.atLimit ? 'At limit' : `+ ${picker.label}`;
  select.appendChild(placeholder);

  for (const spell of picker.options) {
    const option = document.createElement('option');
    option.value = spell.id;
    option.textContent = spell.level === 0 ? spell.name : `${spell.name} (lvl ${spell.level})`;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    const spell = picker.options.find((s) => s.id === select.value);
    select.value = '';
    if (spell) picker.onPick(spell);
  });
  return select;
}

/**
 * The known-spell manager: every known leveled spell with a prepare checkbox
 * (bounded by the prepared limit) and a forget control, plus a learn picker for
 * new spells from the class list.
 * @param {Character} character
 * @param {Spell[]} known
 * @param {import('../types/entities.js').Spellbook} book
 * @param {number} prepLimit
 * @param {{ commit: (next: Character) => void }} opts
 * @param {Spell[]} learnable
 * @returns {HTMLElement}
 */
function buildKnownList(character, known, book, prepLimit, opts, learnable) {
  const group = document.createElement('div');
  group.className = 'character-sheet__spell-group';

  const heading = document.createElement('span');
  heading.className = 'character-sheet__spell-group-title';
  heading.textContent = 'Known';
  group.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'character-sheet__spell-known';
  const atPrepLimit = book.prepared.length >= prepLimit;
  for (const spell of known) {
    const prepared = book.prepared.includes(spell.id);
    const row = document.createElement('label');
    row.className = 'character-sheet__spell-known-row';

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = prepared;
    check.disabled = !prepared && atPrepLimit;
    check.setAttribute('aria-label', `Prepare ${spell.name}`);
    check.addEventListener('change', () =>
      opts.commit(
        check.checked ? prepareSpell(character, spell.id) : unprepareSpell(character, spell.id),
      ),
    );
    row.appendChild(check);

    const name = document.createElement('span');
    name.className = 'character-sheet__spell-known-name';
    name.textContent = `${spell.name} (lvl ${spell.level})`;
    row.appendChild(name);

    const forget = document.createElement('button');
    forget.type = 'button';
    forget.className = 'btn btn--icon character-sheet__spell-forget';
    forget.setAttribute('aria-label', `Forget ${spell.name}`);
    forget.title = 'Forget';
    forget.appendChild(icon('remove'));
    forget.addEventListener('click', () => opts.commit(unlearnSpell(character, spell.id)));
    row.appendChild(forget);

    list.appendChild(row);
  }
  group.appendChild(list);

  group.appendChild(
    buildPicker({
      label: 'Learn spell',
      atLimit: false,
      options: learnable.filter((s) => s.level > 0 && !book.known.includes(s.id)),
      onPick: (spell) => opts.commit(learnSpell(character, spell.id)),
    }),
  );
  return group;
}
