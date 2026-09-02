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
  hasPreparedCaster,
} from '../entities/Classes.js';
import { primaryClass } from '../entities/Multiclass.js';
import { groupSpellsByLevel, spellStatus } from '../entities/SpellView.js';
import { sameDeps, spellListDeps } from '../view/SheetStructure.js';
import { badge, bareButton, emptyState, sectionLabel } from './buttons.js';
import { el } from './dom.js';
import { promptModal } from './Modal.js';
import { promptSpellDetail } from './SpellDetail.js';

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * Mount the Spellbook tab: a browsable, per-level list of every spell the
 * character's class can learn, merged with any spell the character already
 * knows. Each entry shows its known or prepared standing and opens a detail
 * modal whose actions manage the book: Learn a new spell, Prepare or
 * Unprepare a known leveled spell, or Forget it. A non-caster, and any
 * character with no spells to show, gets an empty state. `getPermissions().play`
 * gates editing. A spectator sees details but no management actions.
 *
 * The panel owns no character state. Every action produces a new character
 * through the pure spellbook helpers and hands the new character to
 * `onChange`. The panel then re-renders from the value the host writes back
 * through `setCharacter`.
 * @param {HTMLElement} container
 * @param {Character | null} initial
 * @param {(character: Character) => void} onChange
 * @param {() => { play: boolean }} getPermissions
 * @param {{ learnable: (character: Character) => Spell[],
 *   resolveSpells: (ids: string[]) => Spell[],
 *   catalogStamp: () => unknown }} opts
 *   `learnable` returns every spell the class can learn, both cantrips and
 *   leveled spells. `resolveSpells` maps stored ids to Spell objects, so a
 *   known spell outside the learnable set, for example one from an import,
 *   still appears. `catalogStamp` returns a value that changes whenever the
 *   spell catalog behind those two functions changes. This is how the panel
 *   knows that a library edit means a rebuild.
 * @returns {{ setCharacter: (character: Character | null) => void }}
 */
export function mountSpellbookPanel(container, initial, onChange, getPermissions, opts) {
  let current = initial;

  const root = el('div', 'spellbook u-col u-g3');
  container.appendChild(root);

  /** Restate what a spellbook change shows: one closure per row, plus one for
   * the prepared and cantrip counts. @type {(() => void)[]} */
  let writers = [];
  /** @type {unknown[] | null} What the list on screen was built from. */
  let shownDeps = null;
  /** @type {Set<string>} The ids the classes offer, from the last build. */
  let learnableIds = new Set();

  /** @param {Character} character @returns {string[]} */
  function knownIds(character) {
    const book = getSpellbook(character);
    return [...book.cantrips, ...book.known];
  }

  /** What decides which rows exist.
   * @param {Character} character
   * @returns {unknown[]} */
  function listDeps(character) {
    return spellListDeps(
      character,
      knownIds(character),
      learnableIds,
      getPermissions().play,
      // The catalog the learnable list draws from. An edit to a spell in the
      // Library changes the rows without a change to the character.
      opts.catalogStamp(),
    );
  }

  /**
   * Show the current spellbook. Learning, preparing, and forgetting change
   * badges and counts, but leave the rows alone. The usual case writes into
   * the list already on screen, instead of rebuilding a class-wide spell
   * list that can run to a few hundred rows.
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
   * The class a learn records under. For a multiclass caster, this shows a
   * picker over the caster classes whose spell list carries the spell, or
   * over every caster class when none carries it, because an out-of-class
   * grant still needs an ability to cast with. A lone candidate class is used
   * without a picker. A cancelled picker returns null, which aborts the
   * learn.
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
   * Show the detail modal for one spell, with the management actions its
   * current standing allows, then apply the chosen action.
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
        if (status.preparable) {
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

    // The browsable list: the class's learnable spells, plus any already-known
    // spell outside that set. This keeps imports and out-of-class grants
    // visible.
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
        // A caster with no prepared-rule class never prepares, so the
        // prepared count always reads 0/0. Show cantrips alone.
        const prepared = hasPreparedCaster(live)
          ? `Prepared ${counts.prepared.length}/${preparedLimit(live)} · `
          : '';
        prep.textContent = `${prepared}Cantrips ${counts.cantrips.length}/${cantripLimit(live)}`;
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
          sectionLabel(group.label),
          el('div', 'spellbook__list u-col', ...group.spells.map(buildRow)),
        ),
      );
    }
  }

  /**
   * One spell row: a name button that opens the detail, with known or
   * prepared badges. The badges and the click both read the live character,
   * because the row stays on screen across the changes made through it.
   *
   * The badge is the visible state label, and it is hidden from the
   * accessible name so the button stays "Cure Wounds" as its standing
   * changes. The standing itself is reported through `aria-pressed`: prepared
   * under a prepared-rule class, known otherwise.
   * @param {Spell} spell
   * @returns {HTMLElement}
   */
  function buildRow(spell) {
    const badges = el('span', 'spellbook__row-badges');
    badges.setAttribute('aria-hidden', 'true');
    const row = bareButton(
      [el('span', 'spellbook__row-name', spell.name), badges],
      () => {
        if (current) openSpell(current, spell);
      },
      { className: 'spellbook__row u-row u-g2' },
    );

    const writeStatus = () => {
      const live = current;
      if (!live) return;
      const status = spellStatus(live, spell);
      row.classList.toggle('spellbook__row--known', status.known);
      const pressed = status.preparable ? status.prepared : status.known;
      row.setAttribute('aria-pressed', String(pressed));
      badges.innerHTML = '';
      if (status.prepared) badges.appendChild(statusBadge('Prepared', 'prepared'));
      else if (status.known) badges.appendChild(statusBadge('Known', 'known'));
    };
    writeStatus();
    writers.push(writeStatus);
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

/**
 * A known-or-prepared marker. The two states carry the spellbook's own colours
 * rather than a shared variant: prepared is the mana colour, and known is a
 * muted grey.
 * @param {string} text
 * @param {'known' | 'prepared'} kind
 * @returns {HTMLElement}
 */
function statusBadge(text, kind) {
  return badge(text, { className: `spellbook__badge spellbook__badge--${kind}` });
}
