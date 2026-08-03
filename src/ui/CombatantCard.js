import { el } from './dom.js';
import { icon } from './icons.js';
import { bareButton, chip } from './buttons.js';
import { hpBand } from '../view/ViewRole.js';
import { loadoutBlock } from './LoadoutBlock.js';
import { buildStatBar } from './CharacterBars.js';

/** @typedef {import('../combat/CombatView.js').CombatantRow} CombatantRow */
/** @typedef {import('../combat/Loadout.js').Loadout} Loadout */

/**
 * This card shows one combatant on the combat board: name, HP, AC, initiative,
 * and condition chips. It builds from a {@link CombatantRow} and rebuilds
 * whole on every refresh, because a fight holds only a few cards and nothing
 * is worth a diff. A foe carries a sword icon beside the name, so the side
 * never depends on color alone. A defeated combatant keeps its card, struck
 * through, so the order on screen still matches the initiative order.
 *
 * With `onSelect`, the card acts as the board's target picker: a toggle button
 * whose `aria-pressed` marks the current selection. The card only announces
 * the pick. The screen decides which action the target feeds.
 *
 * `loadout` is the armor, weapons, spells, and slots block, already trimmed to
 * what this viewer can see. The card draws whatever survives that trim and
 * leaves out the block when nothing survives.
 *
 * HP shows exact where the viewer can act for the combatant (`row.mayAct`):
 * the GM sees exact HP everywhere, and a player sees exact HP for their own
 * character, matching the sheet they can already read. Everywhere else, HP
 * shows as a coarse band. AC is public information: every viewer sees the
 * exact value.
 * @param {CombatantRow} row
 * @param {{
 *   selected?: boolean,
 *   onSelect?: (id: string) => void,
 *   loadout?: Loadout | null,
 * }} [selection]
 * @returns {HTMLElement}
 */
export function combatantCard(row, selection = {}) {
  const selectable = Boolean(selection.onSelect);
  const classes = [
    'combatant-card',
    `combatant-card--${row.side}`,
    row.defeated ? 'combatant-card--defeated' : '',
    selectable ? 'combatant-card--selectable' : '',
    selection.selected ? 'combatant-card--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const name = el('span', 'combatant-card__name', row.name ?? 'Unknown combatant');
  const header = el(
    'header',
    'combatant-card__header u-row u-g2',
    row.side === 'foe' ? foeMark() : null,
    name,
    el('span', 'combatant-card__init', `Init ${row.initiative}`),
  );

  /** @type {HTMLElement} */
  let card;
  if (selectable) {
    card = bareButton([header], () => selection.onSelect?.(row.id), {
      className: classes,
      title: `Target ${row.name ?? 'Unknown combatant'}`,
    });
    card.setAttribute('aria-pressed', String(Boolean(selection.selected)));
    card.dataset.combatantId = row.id;
  } else {
    card = el('article', classes, header);
  }
  if (row.defeated) {
    // The strikethrough shows this visually. This label states it for a screen reader.
    card.setAttribute('aria-label', `${row.name ?? 'Unknown combatant'}, defeated`);
  }

  if (row.hp) card.appendChild(hpLine(row.hp, row.mayAct));

  if (row.ac !== null) {
    card.appendChild(el('div', 'combatant-card__meta', `AC ${row.ac}`));
  }

  const loadout = selection.loadout ? loadoutBlock(selection.loadout) : null;
  if (loadout) card.appendChild(loadout);

  if (row.conditions.length > 0) {
    card.appendChild(
      el(
        'div',
        'combatant-card__conditions u-row u-wrap u-g1',
        ...row.conditions.map((c) =>
          chip(c.rounds !== null && c.rounds !== undefined ? `${c.name} (${c.rounds})` : c.name),
        ),
      ),
    );
  }

  return card;
}

/** The foe marker beside the name. It is decorative. The group heading names the side. */
function foeMark() {
  const mark = el('span', 'combatant-card__foe-mark', icon('sword'));
  mark.setAttribute('aria-hidden', 'true');
  return mark;
}

/**
 * The card's HP line. A viewer who can act for the combatant sees exact
 * numbers over the shared stat-bar track. Every other viewer sees the coarse
 * band used in the rest of the player view.
 * @param {{ current: number, max: number }} hp
 * @param {boolean} exact
 */
function hpLine(hp, exact) {
  if (!exact) return el('div', 'combatant-card__hp-band', hpBand(hp.current, hp.max));
  // No label: the card has one bar, and the name above it says whose.
  return buildStatBar(hp, {
    modifier: 'hp',
    label: 'HP',
    critical: true,
    showLabel: false,
    className: 'combatant-card__hp',
  }).element;
}
