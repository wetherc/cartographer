import { statBreakdown } from '../entities/Equipment.js';
import { abilityModifier, formatModifier } from '../entities/Modifiers.js';
import { textButton } from './buttons.js';
import { classNames, el, setAttrs } from './dom.js';
import { openDialog } from './Modal.js';

/** @typedef {import('../types/entities.js').Character} Character */

/**
 * Open a popover breaking one ability score into its parts: the base value,
 * each equipped item that shifts it (with its signed delta), and the resulting
 * total and modifier. This is where the base score lives now that the badge
 * shows only the effective total. Duration is not modeled yet — item buffs read
 * "while equipped"; a future condition/spell source can add a real duration.
 * @param {string} key
 * @param {{ base: number, total: number, sources: { source: string, delta: number }[] }} breakdown
 */
function openStatBreakdown(key, breakdown) {
  const { base, total, sources } = breakdown;
  openDialog({
    className: 'modal stat-breakdown',
    title: `${key} ${total}`,
    build: (close) => {
      const mod = el(
        'p',
        'stat-breakdown__mod',
        `Modifier ${formatModifier(abilityModifier(total))}`,
      );

      const rows = el('dl', 'stat-breakdown__rows');
      /** @param {string} label @param {string} value @param {string} [ddCls] @param {string} [rowCls] */
      const addRow = (label, value, ddCls, rowCls) => {
        rows.append(el('dt', rowCls, label), el('dd', classNames([ddCls, rowCls]), value));
      };
      addRow('Base', String(base));
      for (const { source, delta } of sources) {
        addRow(
          `${source} (while equipped)`,
          `${delta > 0 ? '+' : ''}${delta}`,
          delta < 0 ? 'stat-breakdown__debuff' : 'stat-breakdown__buff',
        );
      }
      addRow('Total', String(total), undefined, 'stat-breakdown__total');

      const dismiss = textButton('Close', () => close(), { variant: 'primary' });

      return { body: [mod, rows], actions: [dismiss], initialFocus: dismiss };
    },
  });
}

/**
 * Draw the face-on d20 wireframe behind an ability score: the hexagonal
 * silhouette, the central point-down face the score sits in, and the facet
 * edges out to the remaining corners. Strokes inherit currentColor so the
 * buffed/debuffed tint colors the whole die.
 * @returns {SVGSVGElement}
 */
function d20Face() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = /** @type {SVGSVGElement} */ (
    setAttrs(document.createElementNS(NS, 'svg'), {
      class: 'stat-badge__d20',
      viewBox: '0 0 100 100',
      'aria-hidden': 'true',
    })
  );
  // Point-up hexagon corners; the central face joins the two upper-side
  // corners to the bottom point, so its centroid is the badge's midpoint.
  const A = '50,3';
  const B = '90.7,26.5';
  const C = '90.7,73.5';
  const D = '50,97';
  const E = '9.3,73.5';
  const F = '9.3,26.5';
  /** @param {string} tag @param {Record<string, string>} attrs */
  const shape = (tag, attrs) => svg.appendChild(setAttrs(document.createElementNS(NS, tag), attrs));
  shape('polygon', { class: 'stat-badge__d20-hull', points: `${A} ${B} ${C} ${D} ${E} ${F}` });
  shape('path', {
    class: 'stat-badge__d20-facets',
    d: `M${A} L${F} M${A} L${B} M${C} L${B} M${C} L${D} M${E} L${F} M${E} L${D}`,
  });
  shape('polygon', { class: 'stat-badge__d20-face', points: `${F} ${B} ${D}` });
  return svg;
}

/**
 * Build one ability-score badge: a d20-style die showing the effective score
 * (base + equipped buffs) over its derived modifier, labeled with the ability
 * key. The whole badge is a button opening {@link openStatBreakdown}. A buffed
 * or debuffed total is tinted so a modified score is obvious at a glance.
 * @param {Character} character
 * @param {string} key
 * @returns {HTMLElement}
 */
export function statBadge(character, key) {
  const breakdown = statBreakdown(character, key);
  const { base, total } = breakdown;
  const modText = formatModifier(abilityModifier(total));

  const badge = el(
    'button',
    classNames([
      'stat-badge',
      total > base && 'stat-badge--buffed',
      total < base && 'stat-badge--debuffed',
    ]),
    el('span', 'stat-badge__key', key),
    el('span', 'stat-badge__die', d20Face(), el('span', 'stat-badge__score', String(total))),
    el('span', 'stat-badge__mod u-muted', modText),
  );
  badge.type = 'button';
  const note = total !== base ? ` (base ${base})` : '';
  badge.setAttribute('aria-label', `${key} ${total}, modifier ${modText}${note}. Show breakdown.`);
  badge.title = 'Show breakdown';
  badge.addEventListener('click', () => openStatBreakdown(key, breakdown));
  return badge;
}
