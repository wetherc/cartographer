import { levelUpText } from './CharacterLevelBanner.js';
import { bareButton, iconButton, iconLink, textButton, emptyState } from './buttons.js';
import { classNames, el } from './dom.js';
import { captureFocus, restoreFocus } from './focusMemory.js';
import { repaintNeeded } from './listPanel.js';
import { getHP } from '../entities/Character.js';
import { buildStatBar, emptyStatBar } from './CharacterBars.js';
import { markMenuButton, toggleMenuFrom } from './ContextMenu.js';
import { setTip } from './Tooltip.js';

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
    return emptyStatBar();
  }
  return buildStatBar(hp, { modifier: 'hp', label: 'HP', compact: true, band: true }).element;
}

/**
 * Mount the party roster: one row per character, with select and delete,
 * and a New character button. This is pure DOM wiring. Callbacks supply
 * the creation and deletion logic, for example modals, id generation, and
 * list updates, so the roster stays as thin as the other panels.
 * @param {HTMLElement} container
 * If onAwardXP is set, a non-empty roster also offers an Award Party XP
 * action.
 * This grants the same amount to every party member at once, with the
 * caller prompting for the amount, so leveling after an encounter does not
 * mean a visit to each sheet. If canManage returns false, the roster is
 * browse-only. Rows still select, since any viewer can look at a sheet,
 * but the add, delete, and award controls disappear. Roster membership
 * belongs to the GM to manage.
 * If onEditVitals is set, each managed row offers an Edit vitals action for
 * the numbers the GM sets rather than the character earns: maximum HP, bonus
 * HP, and unarmored base AC. If onGrantXP is set, each managed row offers an
 * XP action that grants a one-off amount to that character alone, which is
 * the per-character counterpart of Award Party XP below the list.
 * Both open a dialog through the caller. They live here, not on the character
 * sheet, so the GM can adjust anyone without selecting them first.
 * @param {{
 *   getCharacters: () => Character[],
 *   getSelectedId: () => string | null,
 *   onSelect: (id: string) => void,
 *   onAdd: () => void,
 *   onDelete: (id: string) => void,
 *   onAwardXP?: () => void,
 *   onEditVitals?: (id: string) => void,
 *   onGrantXP?: (id: string) => void,
 *   onOpenSheet?: (id: string) => void,
 *   onPlace?: (id: string) => void,
 *   playerTabHref?: (id: string | null) => string,
 *   canManage?: () => boolean,
 *   canPlace?: () => boolean,
 * }} options
 * If onPlace is set, each managed row also offers a Place on map action.
 * This lets the GM move one character to any node or tile, or back to the
 * party, without changing the rest of the party. canPlace, checked per
 * paint like canManage, hides that action while splitting the party is
 * not allowed.
 * If playerTabHref is set, each managed row also offers a link that opens a
 * player tab bound to that character, and the actions below the list offer
 * a Spectator tab button. Each row link is a real link, so the GM can also
 * middle-click it or copy the URL. The spectator control sits among the
 * other action buttons, so it is a button too, and it opens the same URL in
 * a new browser tab.
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

  /**
   * The row's "More" button, which opens a menu with Open full sheet and
   * Grant XP, when the caller offers them, and Delete.
   * @param {Character} character
   * @returns {HTMLButtonElement}
   */
  function moreButton(character) {
    const { onGrantXP, onOpenSheet } = options;
    const items = [
      ...(onOpenSheet
        ? [{ label: 'Open full sheet', onSelect: () => onOpenSheet(character.id) }]
        : []),
      ...(onGrantXP ? [{ label: 'Grant XP', onSelect: () => onGrantXP(character.id) }] : []),
      {
        label: `Delete ${character.name}`,
        danger: true,
        onSelect: () => options.onDelete(character.id),
      },
    ];
    const button = iconButton(
      'more',
      `More actions for ${character.name}`,
      () => toggleMenuFrom(button, items),
      { className: 'character-roster__more', title: 'Grant XP or delete' },
    );
    markMenuButton(button);
    return button;
  }

  /**
   * A badge on the row of a character with a level-up step left. A click on
   * the row opens the sheet, where the level-up banner leads.
   * @param {Character} character
   * @returns {HTMLElement | null}
   */
  function levelUpBadge(character) {
    const text = levelUpText(character);
    if (!text) return null;
    const mark = el('span', 'character-roster__level-up', 'Level up');
    setTip(mark, text);
    return mark;
  }

  /** @param {boolean} manage @param {Character[]} characters @param {string | null} selectedId */
  function paint(manage, characters, selectedId) {
    // Clearing the root drops focus to the document body, the same hazard
    // the list panels have, so the keyboard position is noted and put back.
    const memo = captureFocus(root, document.activeElement);
    root.innerHTML = '';

    if (characters.length === 0) {
      root.appendChild(emptyState('No characters yet.'));
    }

    for (const character of characters) {
      const current = character.id === selectedId;
      const select = bareButton(
        [
          el(
            'span',
            'character-roster__label',
            `${character.name} `,
            el('span', 'character-roster__level', `(Lv ${character.level})`),
          ),
          levelUpBadge(character),
          hpMeter(character),
        ],
        () => options.onSelect(character.id),
        {
          className: classNames([
            'row-select character-roster__select u-row u-g2',
            current && 'row-select--current',
          ]),
        },
      );
      if (current) select.setAttribute('aria-current', 'true');

      const row = el('div', 'character-roster__row u-row u-g1', select);
      if (manage && options.onEditVitals) {
        row.appendChild(
          iconButton(
            'edit',
            `Edit the vitals of ${character.name}`,
            () => options.onEditVitals?.(character.id),
            { className: 'character-roster__vitals', title: 'Edit HP and AC' },
          ),
        );
      }
      if (manage && options.playerTabHref) {
        row.appendChild(
          iconLink(
            'external',
            `Open a player tab for ${character.name}`,
            options.playerTabHref(character.id),
            { className: 'character-roster__tab', title: 'Open player tab', newTab: true },
          ),
        );
      }
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
      // Grant XP and Delete sit in a menu behind one "More" button, so a
      // click in a busy Play list does not delete a character by mistake.
      if (manage) row.appendChild(moreButton(character));
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
            textButton('Award Party XP', () => options.onAwardXP?.(), {
              icon: 'sparkles',
              className: 'character-roster__award',
            }),
          options.playerTabHref &&
            textButton(
              'Spectator tab',
              () => window.open(options.playerTabHref?.(null), '_blank', 'noopener'),
              {
                icon: 'eye',
                title: 'Open a player tab that plays no character',
                className: 'character-roster__spectator',
              },
            ),
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
    // One read of the selection feeds both the guard and the paint, so the
    // rows can never show a selection the guard did not compare.
    const selectedId = options.getSelectedId();
    /** @type {import('./listPanel.js').PaintState<Character>} */
    const next = {
      gm: canManage(),
      rows: options.getCharacters(),
      dependsOn: rosterDependsOn(selectedId, placeShown()),
    };
    if (!repaintNeeded(last, next)) return;
    last = next;
    paint(next.gm, next.rows, selectedId);
  }

  update();
  return { update };
}
