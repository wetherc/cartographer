import { promptModal } from './Modal.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import {
  TOME_CANTRIPS,
  addTomeRituals,
  hasAncientSecrets,
  maxRitualLevel,
  setTomeCantrips,
  tomeCantrips,
  tomeOptions,
  tomeRituals,
} from '../entities/PactTome.js';
import { getPactBoon } from '../entities/Invocations.js';
import { activeSpellIndex, activeSpells } from '../library/Library.js';
import { splitList } from '../util/text.js';

/**
 * The Book of Shadows dialogs and rows of a Pact of the Tome warlock: the
 * three cantrips from any class list, and the rituals of Book of Ancient
 * Secrets. `entities/PactTome.js` keeps the rules. This file is DOM wiring
 * over it, verified visually.
 */

/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/spell.js').Spell} Spell */

/**
 * Ask for the Book of Shadows cantrips, from the cantrips of every class.
 * @param {Character} character
 * @returns {Promise<string[]>} the picked ids, empty for a cancel
 */
export async function askTomeCantrips(character) {
  const values = await promptModal(
    'Book of Shadows',
    [
      {
        name: 'cantrips',
        label: `Choose ${TOME_CANTRIPS} cantrips from any class`,
        type: 'multiselect',
        options: tomeOptions(activeSpells(), 'cantrip').map((s) => ({
          value: s.id,
          label: s.name,
        })),
        max: TOME_CANTRIPS,
        value: tomeCantrips(character).join(','),
      },
    ],
    { submitLabel: 'Choose' },
  );
  return values ? splitList(values.cantrips).slice(0, TOME_CANTRIPS) : [];
}

/**
 * Ask for rituals to copy into the book, from the rituals of every class up
 * to `maxLevel`, leaving out the ones already in it.
 * @param {Character} character
 * @param {number} count the most to pick
 * @param {number} maxLevel
 * @returns {Promise<Spell[]>} the picked spells, empty for a cancel
 */
export async function askTomeRituals(character, count, maxLevel) {
  const have = tomeRituals(character);
  const options = tomeOptions(activeSpells(), 'ritual', maxLevel).filter(
    (s) => !have.includes(s.id),
  );
  if (options.length === 0) return [];
  const values = await promptModal(
    'Book of Ancient Secrets',
    [
      {
        name: 'rituals',
        label: `Choose ${count} ritual${count === 1 ? '' : 's'} from any class`,
        type: 'multiselect',
        options: options.map((s) => ({ value: s.id, label: `${s.name} (level ${s.level})` })),
        max: count,
        value: '',
      },
    ],
    { submitLabel: 'Choose' },
  );
  const ids = values ? splitList(values.rituals).slice(0, count) : [];
  return options.filter((s) => ids.includes(s.id));
}

/**
 * The Book of Shadows rows of the progression section: the book cantrips
 * with a Choose button, and with Book of Ancient Secrets the rituals with an
 * Add ritual button. A warlock without the Pact of the Tome gets no rows.
 * @param {() => Character} getCharacter
 * @param {{ editBase: boolean, onCommit: (character: Character) => void }} opts
 * @returns {HTMLElement[]}
 */
export function buildTomeRows(getCharacter, opts) {
  const character = getCharacter();
  if (getPactBoon(character) !== 'tome') return [];
  const index = activeSpellIndex();
  /** @param {string[]} ids */
  const names = (ids) => ids.map((id) => index.get(id)?.name ?? id).join(', ') || 'none';
  const rows = [
    progressRow(
      `Book of Shadows cantrips: ${names(tomeCantrips(character))}`,
      opts.editBase && [
        'Choose',
        async () => {
          const ids = await askTomeCantrips(getCharacter());
          if (ids.length === 0) return;
          const live = getCharacter();
          const next = setTomeCantrips(live, ids);
          if (next !== live) opts.onCommit(next);
        },
        'Choose the Book of Shadows cantrips',
      ],
    ),
  ];
  if (hasAncientSecrets(character)) {
    rows.push(
      progressRow(
        `Book rituals: ${names(tomeRituals(character))}`,
        opts.editBase && [
          'Add ritual',
          async () => {
            const from = getCharacter();
            const spells = await askTomeRituals(from, 1, maxRitualLevel(from));
            const live = getCharacter();
            const next = addTomeRituals(live, spells);
            if (next !== live) opts.onCommit(next);
          },
          'Copy a ritual into the Book of Shadows',
        ],
      ),
    );
  }
  return rows;
}

/**
 * One progression row: its text and an optional button.
 * @param {string} text
 * @param {false | [string, () => void, string]} button label, handler, and
 *   accessible label, or false for none
 * @returns {HTMLElement}
 */
export function progressRow(text, button) {
  const line = el(
    'div',
    'character-sheet__progress-row u-row u-g2 u-muted',
    el('span', 'character-sheet__progress-text', text),
  );
  if (button) line.appendChild(textButton(button[0], button[1], { ariaLabel: button[2] }));
  return line;
}
