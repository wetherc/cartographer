import { el } from './dom.js';
import { icon } from './icons.js';
import { chip } from './buttons.js';
import { hpBand } from '../view/ViewRole.js';

/** @typedef {import('../combat/CombatView.js').CombatantRow} CombatantRow */

/**
 * One combatant on the combat board: name, HP, AC, initiative, and condition
 * chips, built from a {@link CombatantRow} and rebuilt whole on every refresh
 * (a fight holds a handful of cards, so there is nothing worth diffing). Foes
 * carry a sword icon beside the name so the side never rests on color alone,
 * and a defeated combatant keeps its card, struck through, so the order on
 * screen keeps matching the initiative order.
 * @param {CombatantRow} row
 * @param {{ gm: boolean }} viewer the GM reads exact HP, a player the band
 * @returns {HTMLElement}
 */
export function combatantCard(row, viewer) {
  const classes = [
    'combatant-card',
    `combatant-card--${row.side}`,
    row.defeated ? 'combatant-card--defeated' : '',
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

  const card = el('article', classes, header);
  if (row.defeated) {
    // The struck-through name says it by eye; this says it out loud.
    card.setAttribute('aria-label', `${row.name ?? 'Unknown combatant'}, defeated`);
  }

  if (row.hp) card.appendChild(hpLine(row.hp, viewer.gm));

  if (row.ac !== null) {
    card.appendChild(el('div', 'combatant-card__meta', `AC ${row.ac}`));
  }

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

/** The foe marker beside the name; decorative, the group heading names the side. */
function foeMark() {
  const mark = el('span', 'combatant-card__foe-mark', icon('sword'));
  mark.setAttribute('aria-hidden', 'true');
  return mark;
}

/**
 * The card's HP line. The GM gets the exact numbers over the shared stat-bar
 * track; a player gets the coarse band the rest of the player view uses.
 * @param {{ current: number, max: number }} hp
 * @param {boolean} gm
 */
function hpLine(hp, gm) {
  if (!gm) return el('div', 'combatant-card__hp-band', hpBand(hp.current, hp.max));
  const fraction = hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;
  const fill = el('span', `stat-bar__fill${fraction <= 0.25 ? ' stat-bar__fill--critical' : ''}`);
  fill.style.width = `${fraction * 100}%`;
  return el(
    'div',
    'combatant-card__hp stat-bar u-row u-g2',
    el('span', 'stat-bar__track', fill),
    el('span', 'stat-bar__text', `${hp.current}/${hp.max}`),
  );
}
