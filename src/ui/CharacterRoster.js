import { iconButton, textButton, emptyState } from './buttons.js';
import { classNames, el } from './dom.js';
import { captureFocus, restoreFocus } from './focusMemory.js';
import { repaintNeeded } from './listPanel.js';
import { getHP } from '../entities/Character.js';
import { buildStatBar } from './CharacterBars.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * What the roster draws besides its rows: which row reads as the current
 * one, and whether the rows carry a place-on-map action. A change in either
 * has to repaint even when the characters are the same objects.
 * @param {string | null} selectedId
 * @param {boolean} placeShown
 * @returns {string}
 */
export function rosterDependsOn(selectedId, placeShown) {
  return `${placeShown ? 1 : 0}:${selectedId ?? ''}`;
}

/**
 * A roster row's HP pill: the shared stat bar in its compact, banded form,
 * so the row reads at a glance and matches the bar on the sheet. A character
 * with no HP pool authored yet gets an empty, unlabeled track.
 * @param {Character} character
 * @returns {HTMLElement}
 */
function hpMeter(character) {
  const hp = getHP(character);
  if (!hp || hp.max <= 0) {
    return el('span', 'stat-bar stat-bar--compact', el('span', 'stat-bar__track'));
  }
  return buildStatBar(hp, { modifier: 'hp', label: 'HP', compact: true, band: true }).element;
}

/**
 * Mount the party roster: one row per character, with select and delete,
 * and a New character button. This is pure DOM wiring. Callbacks supply
 * the creation and deletion logic, for example modals, id generation, and
 * list updates, so the roster stays as thin as the other panels.
 * @param {HTMLElement} container
 * If onAwardXP is set, a non-empty roster also offers an Award XP action.
 * This grants the same amount to every party member at once, with the
 * caller prompting for the amount, so leveling after an encounter does not
 * mean a visit to each sheet. If canManage returns false, the roster is
 * browse-only. Rows still select, since any viewer can look at a sheet,
 * but the add, delete, and award controls disappear. Roster membership
 * belongs to the GM to manage.
 * @param {{
 *   getCharacters: () => Character[],
 *   getSelectedId: () => string | null,
 *   onSelect: (id: string) => void,
 *   onAdd: () => void,
 *   onDelete: (id: string) => void,
 *   onAwardXP?: () => void,
 *   onPlace?: (id: string) => void,
 *   canManage?: () => boolean,
 *   canPlace?: () => boolean,
 * }} options
 * If onPlace is set, each managed row also offers a Place on map action.
 * This lets the GM move one character to any node or tile, or back to the
 * party, without changing the rest of the party. canPlace, checked per
 * paint like canManage, hides that action while splitting the party is
 * not allowed.
 *
 * `update` carries the same guard the list panels carry, through
 * `repaintNeeded` from `listPanel.js`: it repaints when the manage gate
 * flipped, when `rosterDependsOn` reports a different value, or when the
 * characters are not the same objects in the same order. A repaint keeps
 * the keyboard position through `focusMemory.js`.
 * @returns {{ update: () => void }}
 */
export function mountCharacterRoster(container, options) {
  const canManage = options.canManage ?? (() => true);
  const root = el('div', 'character-roster');
  container.appendChild(root);

  /**
   * The rows the DOM currently holds, or null before the first paint.
   * @type {import('./listPanel.js').PaintState<Character> | null}
   */
  let last = null;

  /** Whether a row gets the place-on-map action. */
  const placeShown = () => Boolean(options.onPlace) && (options.canPlace?.() ?? true);

  /** @param {boolean} manage @param {Character[]} characters */
  function paint(manage, characters) {
    // Clearing the root drops focus to the document body, the same hazard
    // the list panels have, so the keyboard position is noted and put back.
    const memo = captureFocus(root, document.activeElement);
    root.innerHTML = '';

    const selectedId = options.getSelectedId();

    if (characters.length === 0) {
      root.appendChild(emptyState('No characters yet.'));
    }

    for (const character of characters) {
      const current = character.id === selectedId;
      const select = el(
        'button',
        classNames([
          'row-select character-roster__select u-row u-g2',
          current && 'row-select--current',
        ]),
        el('span', 'character-roster__label', `${character.name} (Lv ${character.level})`),
        hpMeter(character),
      );
      select.type = 'button';
      if (current) select.setAttribute('aria-current', 'true');
      select.addEventListener('click', () => options.onSelect(character.id));

      const row = el('div', 'character-roster__row u-row u-g1', select);
      if (manage && placeShown()) {
        row.appendChild(
          iconButton(
            'map',
            `Place ${character.name} on the map`,
            () => options.onPlace?.(character.id),
            { className: 'character-roster__place', title: 'Place on map' },
          ),
        );
      }
      if (manage) {
        row.appendChild(
          iconButton('remove', `Delete ${character.name}`, () => options.onDelete(character.id), {
            variant: 'danger',
            className: 'character-roster__delete',
          }),
        );
      }
      root.appendChild(row);
    }

    if (manage) {
      root.appendChild(
        el(
          'div',
          'panel-actions',
          textButton('New character', () => options.onAdd(), {
            icon: 'add',
            className: 'character-roster__add',
          }),
          options.onAwardXP &&
            characters.length > 0 &&
            textButton('Award XP', () => options.onAwardXP?.(), {
              icon: 'sparkles',
              className: 'character-roster__award',
            }),
        ),
      );
    }

    restoreFocus(root, memo);
  }

  /**
   * Repaint only when something the rows show has changed. Every refresh of
   * the party panels reaches the roster, and a cross-tab adoption fires one
   * every few seconds, so an unguarded rebuild threw away the keyboard
   * position and the row elements on a save that changed nothing.
   */
  function update() {
    /** @type {import('./listPanel.js').PaintState<Character>} */
    const next = {
      gm: canManage(),
      rows: options.getCharacters(),
      dependsOn: rosterDependsOn(options.getSelectedId(), placeShown()),
    };
    if (!repaintNeeded(last, next)) return;
    last = next;
    paint(next.gm, next.rows);
  }

  update();
  return { update };
}
