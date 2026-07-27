import { statBreakdown } from '../entities/Equipment.js';
import { abilityModifier, formatModifier } from '../entities/Modifiers.js';
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
      const mod = document.createElement('p');
      mod.className = 'stat-breakdown__mod';
      mod.textContent = `Modifier ${formatModifier(abilityModifier(total))}`;

      const rows = document.createElement('dl');
      rows.className = 'stat-breakdown__rows';
      /** @param {string} label @param {string} value @param {string} [ddCls] @param {string} [rowCls] */
      const addRow = (label, value, ddCls, rowCls) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        if (rowCls) dt.className = rowCls;
        dd.className = [ddCls, rowCls].filter(Boolean).join(' ');
        rows.append(dt, dd);
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

      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.className = 'btn btn--primary';
      dismiss.textContent = 'Close';
      dismiss.addEventListener('click', () => close());

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
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'stat-badge__d20');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  // Point-up hexagon corners; the central face joins the two upper-side
  // corners to the bottom point, so its centroid is the badge's midpoint.
  const A = '50,3';
  const B = '90.7,26.5';
  const C = '90.7,73.5';
  const D = '50,97';
  const E = '9.3,73.5';
  const F = '9.3,26.5';
  /** @param {string} tag @param {Record<string, string>} attrs */
  const shape = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
    return el;
  };
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

  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'stat-badge';
  if (total > base) badge.classList.add('stat-badge--buffed');
  else if (total < base) badge.classList.add('stat-badge--debuffed');
  const note = total !== base ? ` (base ${base})` : '';
  badge.setAttribute('aria-label', `${key} ${total}, modifier ${modText}${note}. Show breakdown.`);
  badge.title = 'Show breakdown';

  const keyEl = document.createElement('span');
  keyEl.className = 'stat-badge__key';
  keyEl.textContent = key;

  const die = document.createElement('span');
  die.className = 'stat-badge__die';
  die.appendChild(d20Face());
  const score = document.createElement('span');
  score.className = 'stat-badge__score';
  score.textContent = String(total);
  die.appendChild(score);

  const modEl = document.createElement('span');
  modEl.className = 'stat-badge__mod';
  modEl.textContent = modText;

  badge.append(keyEl, die, modEl);
  badge.addEventListener('click', () => openStatBreakdown(key, breakdown));
  return badge;
}
