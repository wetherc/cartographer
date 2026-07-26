import {
  getSpellbook,
  learnCantrip,
  unlearnCantrip,
  learnSpell,
  unlearnSpell,
  prepareSpell,
  unprepareSpell,
} from '../entities/Character.js';
import {
  getClass,
  cantripLimit,
  preparedLimit,
  casterClassRefs,
  primaryCasterClass,
} from '../entities/Classes.js';
import { primaryClass } from '../entities/Multiclass.js';
import { groupSpellsByLevel, spellStatus } from '../entities/SpellView.js';
import { emptyState } from './buttons.js';
import { promptModal } from './Modal.js';
import { promptSpellDetail } from './SpellDetail.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * Mount the Spellbook tab: a browsable, per-level list of every spell the
 * character's class can learn, merged with any spell it already knows. Each
 * entry shows its known/prepared standing and opens a detail modal whose
 * actions manage the book — Learn a new spell, Prepare/Unprepare a known
 * leveled one, or Forget it. Non-casters (and any character with no spells to
 * show) get an empty state. Editing is gated by `getPermissions().play`; a
 * spectator sees details but no management actions.
 *
 * The panel owns no character state: every action produces a new character via
 * the pure spellbook helpers and hands it to `onChange`, then re-renders from
 * the value the host writes back through `setCharacter`.
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * @param {(character: Character) => void} onChange
 * @param {() => { play: boolean }} getPermissions
 * @param {{ learnable: (character: Character) => Spell[], resolveSpells: (ids: string[]) => Spell[] }} opts
 *   `learnable` returns every spell the class may learn (cantrips and leveled);
 *   `resolveSpells` maps stored ids to Spell objects, so known spells outside
 *   the learnable set (e.g. from an import) still appear.
 * @returns {{ setCharacter: (character: Character | null) => void }}
 */
export function mountSpellbookPanel(container, initial, onChange, getPermissions, opts) {
  let current = initial;

  const root = document.createElement('div');
  root.className = 'spellbook';
  container.appendChild(root);

  /** @param {Character} next */
  function commit(next) {
    current = next;
    onChange(next);
    render();
  }

  /**
   * The class a learn is recorded under: for a multiclass caster, a picker
   * over the caster classes whose spell list carries the spell (all of them
   * when none does — an out-of-class grant still needs an ability to cast
   * with); a lone candidate is used silently. Null when the picker is
   * cancelled, which aborts the learn.
   * @param {Character} character
   * @param {Spell} spell
   * @returns {Promise<string | null | undefined>} undefined = no caster class.
   */
  async function pickSourceClass(character, spell) {
    const refs = casterClassRefs(character);
    const eligible = refs.filter((ref) => spell.classes.includes(ref.classId));
    const pool = eligible.length > 0 ? eligible : refs;
    if (pool.length <= 1) return pool[0]?.classId;
    const values = await promptModal(
      `Learn ${spell.name} as`,
      [
        {
          name: 'class',
          label: 'Class',
          type: 'select',
          options: pool.map((ref) => ({
            value: ref.classId,
            label: getClass(ref.classId)?.name ?? ref.classId,
          })),
          value: pool[0].classId,
        },
      ],
      { submitLabel: 'Learn' },
    );
    return values ? values.class : null;
  }

  /**
   * The detail modal for one spell, with the management actions its current
   * standing allows, then applies the chosen one.
   * @param {Character} character
   * @param {Spell} spell
   */
  async function openSpell(character, spell) {
    const status = spellStatus(character, spell);
    const book = getSpellbook(character);
    /** @type {import('./SpellDetail.js').SpellAction[]} */
    const actions = [];
    if (getPermissions().play) {
      if (!status.known) {
        const atCantripLimit = status.cantrip && book.cantrips.length >= cantripLimit(character);
        if (!atCantripLimit) actions.push({ id: 'learn', label: 'Learn', variant: 'primary' });
      } else {
        if (!status.cantrip) {
          const atPrepLimit = book.prepared.length >= preparedLimit(character);
          if (status.prepared) actions.push({ id: 'unprepare', label: 'Unprepare' });
          else if (!atPrepLimit)
            actions.push({ id: 'prepare', label: 'Prepare', variant: 'primary' });
        }
        actions.push({ id: 'forget', label: 'Forget', variant: 'danger' });
      }
    }
    const choice = await promptSpellDetail(spell, actions);
    if (!choice) return;
    if (choice === 'learn') {
      const classId = await pickSourceClass(character, spell);
      if (classId === null) return;
      commit(
        status.cantrip
          ? learnCantrip(character, spell.id, classId)
          : learnSpell(character, spell.id, classId),
      );
    } else if (choice === 'forget')
      commit(
        status.cantrip ? unlearnCantrip(character, spell.id) : unlearnSpell(character, spell.id),
      );
    else if (choice === 'prepare') commit(prepareSpell(character, spell.id));
    else if (choice === 'unprepare') commit(unprepareSpell(character, spell.id));
  }

  function render() {
    root.innerHTML = '';
    const character = current;
    if (!character) {
      root.appendChild(emptyState('No character selected.'));
      return;
    }

    // The browsable list: learnable spells (by class) plus any already-known
    // spell that falls outside it, so imports and out-of-class grants still show.
    const book = getSpellbook(character);
    const known = opts.resolveSpells([...book.cantrips, ...book.known]);
    const spells = [...opts.learnable(character), ...known];
    const groups = groupSpellsByLevel(spells);

    if (groups.length === 0) {
      const className = getClass(primaryClass(character)?.classId)?.name;
      root.appendChild(
        emptyState(
          casterClassRefs(character).length > 0
            ? 'No spells available.'
            : `${className ? `${className} is not a spellcaster` : 'Not a spellcaster'} — spells granted by class or equipment appear here.`,
        ),
      );
      return;
    }

    const heading = document.createElement('div');
    heading.className = 'spellbook__heading';
    const title = document.createElement('span');
    title.className = 'spellbook__class';
    const casterNames = casterClassRefs(character)
      .map((ref) => getClass(ref.classId)?.name)
      .filter(Boolean);
    title.textContent = casterNames.length > 0 ? `${casterNames.join(' / ')} spells` : 'Spells';
    heading.appendChild(title);
    if (primaryCasterClass(character)) {
      const prep = document.createElement('span');
      prep.className = 'spellbook__prepared-count';
      prep.textContent = `Prepared ${book.prepared.length}/${preparedLimit(character)} · Cantrips ${book.cantrips.length}/${cantripLimit(character)}`;
      heading.appendChild(prep);
    }
    root.appendChild(heading);

    for (const group of groups) {
      const section = document.createElement('div');
      section.className = 'spellbook__group';
      const label = document.createElement('span');
      label.className = 'section-label';
      label.textContent = group.label;
      section.appendChild(label);

      const list = document.createElement('div');
      list.className = 'spellbook__list';
      for (const spell of group.spells) {
        list.appendChild(buildRow(character, spell));
      }
      section.appendChild(list);
      root.appendChild(section);
    }
  }

  /**
   * One spell row: a name button (opens the detail) with known/prepared badges.
   * @param {Character} character
   * @param {Spell} spell
   * @returns {HTMLElement}
   */
  function buildRow(character, spell) {
    const status = spellStatus(character, spell);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'spellbook__row';
    if (status.known) row.classList.add('spellbook__row--known');

    const name = document.createElement('span');
    name.className = 'spellbook__row-name';
    name.textContent = spell.name;
    row.appendChild(name);

    const badges = document.createElement('span');
    badges.className = 'spellbook__row-badges';
    if (status.prepared) badges.appendChild(badge('Prepared', 'prepared'));
    else if (status.known) badges.appendChild(badge('Known', 'known'));
    row.appendChild(badges);

    row.addEventListener('click', () => openSpell(character, spell));
    return row;
  }

  render();
  return {
    setCharacter: (next) => {
      current = next;
      render();
    },
  };
}

/** @param {string} text @param {string} kind @returns {HTMLElement} a status badge. */
function badge(text, kind) {
  const el = document.createElement('span');
  el.className = `spellbook__badge spellbook__badge--${kind}`;
  el.textContent = text;
  return el;
}
