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
import { sameDeps } from '../view/SheetStructure.js';
import { emptyState } from './buttons.js';
import { el } from './dom.js';
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
 * @param {{ learnable: (character: Character) => Spell[],
 *   resolveSpells: (ids: string[]) => Spell[],
 *   catalogStamp: () => unknown }} opts
 *   `learnable` returns every spell the class may learn (cantrips and leveled);
 *   `resolveSpells` maps stored ids to Spell objects, so known spells outside
 *   the learnable set (e.g. from an import) still appear; `catalogStamp` returns
 *   a value that changes whenever the spell catalog behind those two does, which
 *   is how the panel knows a library edit means a rebuild.
 * @returns {{ setCharacter: (character: Character | null) => void }}
 */
export function mountSpellbookPanel(container, initial, onChange, getPermissions, opts) {
  let current = initial;

  const root = el('div', 'spellbook u-col u-g3');
  container.appendChild(root);

  /** Restate what a spellbook change shows, one closure per row plus one for
   * the prepared/cantrip counts. @type {(() => void)[]} */
  let writers = [];
  /** @type {unknown[] | null} what the list on screen was built from */
  let shownDeps = null;
  /** @type {Set<string>} the ids the classes offer, from the last build */
  let learnableIds = new Set();

  /** @param {Character} character @returns {string[]} */
  function knownIds(character) {
    const book = getSpellbook(character);
    return [...book.cantrips, ...book.known];
  }

  /**
   * What decides which rows exist. The learnable set covers most of it, but a
   * known spell the classes do not offer is listed only because the character
   * knows it, so learning or forgetting one of those adds or removes a row.
   * @param {Character} character
   * @returns {unknown[]}
   */
  function listDeps(character) {
    const outsiders = knownIds(character)
      .filter((id) => !learnableIds.has(id))
      .sort()
      .join(',');
    return [
      character.id,
      getPermissions().play,
      character.level,
      character.classes,
      outsiders,
      // The catalog the learnable list is drawn from: editing a spell in the
      // Library changes the rows without touching the character.
      opts.catalogStamp(),
    ];
  }

  /**
   * Show the current spellbook. Learning, preparing, and forgetting change
   * badges and counts but leave the rows themselves alone, so the usual case
   * writes into the list already on screen instead of rebuilding a class-wide
   * spell list that can run to a few hundred rows.
   */
  function refresh() {
    const character = current;
    if (!character || !sameDeps(shownDeps, listDeps(character))) {
      render();
      return;
    }
    for (const writer of writers) writer();
  }

  /** @param {Character} next */
  function commit(next) {
    current = next;
    onChange(next);
    refresh();
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
    writers = [];
    shownDeps = null;
    const character = current;
    if (!character) {
      root.appendChild(emptyState('No character selected.'));
      return;
    }

    // The browsable list: learnable spells (by class) plus any already-known
    // spell that falls outside it, so imports and out-of-class grants still show.
    const known = opts.resolveSpells(knownIds(character));
    const learnable = opts.learnable(character);
    learnableIds = new Set(learnable.map((spell) => spell.id));
    shownDeps = listDeps(character);
    const groups = groupSpellsByLevel([...learnable, ...known]);

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

    const casterNames = casterClassRefs(character)
      .map((ref) => getClass(ref.classId)?.name)
      .filter(Boolean);
    const heading = el(
      'div',
      'spellbook__heading',
      el(
        'span',
        'spellbook__class',
        casterNames.length > 0 ? `${casterNames.join(' / ')} spells` : 'Spells',
      ),
    );
    if (primaryCasterClass(character)) {
      const prep = el('span', 'u-muted');
      const writeCounts = () => {
        const live = current;
        if (!live) return;
        const counts = getSpellbook(live);
        prep.textContent = `Prepared ${counts.prepared.length}/${preparedLimit(live)} · Cantrips ${counts.cantrips.length}/${cantripLimit(live)}`;
      };
      writeCounts();
      writers.push(writeCounts);
      heading.appendChild(prep);
    }
    root.appendChild(heading);

    for (const group of groups) {
      root.appendChild(
        el(
          'div',
          'u-col u-g1',
          el('span', 'section-label', group.label),
          el('div', 'spellbook__list u-col', ...group.spells.map(buildRow)),
        ),
      );
    }
  }

  /**
   * One spell row: a name button (opens the detail) with known/prepared badges.
   * The badges and the click both read the live character, since the row stays
   * on screen across the changes made through it.
   * @param {Spell} spell
   * @returns {HTMLElement}
   */
  function buildRow(spell) {
    const badges = el('span', 'spellbook__row-badges');
    const row = el(
      'button',
      'spellbook__row u-row u-g2',
      el('span', 'spellbook__row-name', spell.name),
      badges,
    );
    row.type = 'button';

    const writeStatus = () => {
      const live = current;
      if (!live) return;
      const status = spellStatus(live, spell);
      row.classList.toggle('spellbook__row--known', status.known);
      badges.innerHTML = '';
      if (status.prepared) badges.appendChild(badge('Prepared', 'prepared'));
      else if (status.known) badges.appendChild(badge('Known', 'known'));
    };
    writeStatus();
    writers.push(writeStatus);

    row.addEventListener('click', () => {
      if (current) openSpell(current, spell);
    });
    return row;
  }

  render();
  return {
    setCharacter: (next) => {
      current = next;
      refresh();
    },
  };
}

/** @param {string} text @param {string} kind @returns {HTMLElement} a status badge. */
function badge(text, kind) {
  return el('span', `badge spellbook__badge spellbook__badge--${kind}`, text);
}
