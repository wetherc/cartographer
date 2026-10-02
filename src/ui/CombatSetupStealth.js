import { sideContests, sneakingSides, stealthLine } from '../combat/Stealth.js';
import { setTip } from './Tooltip.js';
import { textButton } from './buttons.js';
import { el } from './dom.js';
import { labeled, numberField, select } from './formFields.js';

/** @typedef {import('../types/combat.js').Participant} Participant */
/** @typedef {import('../combat/Stealth.js').Side} Side */

/**
 * @typedef {object} StealthHooks
 * @property {(participant: Participant) => number} rollStealth one
 *   Dexterity (Stealth) total
 * @property {(participant: Participant) => number} passivePerception
 */

/**
 * The optional Stealth contest of the combat setup dialog. A picker names the
 * side that sneaks, or both sides. Each row of a sneaking side shows a Stealth
 * total, which Roll Stealth fills and the GM can type over. Each row that
 * watches a sneaking side shows its passive Perception. When both sides sneak,
 * every row shows both. Every change to a total runs the contests again. Each
 * contest ticks the Surprised box of each watcher that notices no one and
 * clears it on each watcher that notices, and one outcome line per sneaking
 * side under the picker says who is surprised. The GM can still change any
 * Surprised box by hand afterward.
 * @param {Participant[]} roster
 * @param {(participant: Participant) => { name: string, side: Side }} describe
 * @param {Map<string, HTMLInputElement>} surprised the Surprised box of each row
 * @param {StealthHooks} hooks
 */
export function stealthStep(roster, describe, surprised, hooks) {
  /** @type {Map<string, HTMLInputElement>} */
  const totals = new Map();
  /** @type {Map<string, HTMLElement>} */
  const cells = new Map();
  /** @type {Map<string, HTMLElement>} */
  const passives = new Map();
  /** @type {Map<string, HTMLElement>} */
  const groups = new Map();
  /** @type {Map<string, number>} */
  const passiveOf = new Map();
  const side = select(
    [
      { value: '', label: 'No one' },
      { value: 'party', label: 'The party' },
      { value: 'foe', label: 'The foes' },
      { value: 'both', label: 'Both sides' },
    ],
    '',
  );
  const outcome = el('div', 'combat-setup__stealth-outcome u-muted');
  outcome.setAttribute('aria-live', 'polite');
  /** @type {string[]} */
  let lines = [];

  const choice = () => /** @type {Side | 'both' | ''} */ (side.value);
  const sneaks = (/** @type {Participant} */ p) =>
    sneakingSides(choice()).includes(describe(p).side);
  const valueOf = (/** @type {Participant} */ p) => {
    const raw = totals.get(p.id)?.value ?? '';
    return raw === '' || Number.isNaN(Number(raw)) ? null : Number(raw);
  };

  // Show a total on each sneaker row and a passive score on each row that
  // watches a sneaking side. A row can show both, or neither when no one
  // sneaks.
  const layout = () => {
    const sides = sneakingSides(choice());
    for (const p of roster) {
      const own = describe(p).side;
      /** @type {HTMLElement} */ (cells.get(p.id)).hidden = !sides.includes(own);
      /** @type {HTMLElement} */ (passives.get(p.id)).hidden = !sides.some((s) => s !== own);
      /** @type {HTMLElement} */ (groups.get(p.id)).hidden = sides.length === 0;
    }
    roll.hidden = sides.length === 0;
  };

  const judge = () => {
    const results = sideContests(
      roster.map((p) => ({
        id: p.id,
        side: describe(p).side,
        total: valueOf(p),
        passive: /** @type {number} */ (passiveOf.get(p.id)),
      })),
      choice(),
    );
    const nameOf = (/** @type {string} */ id) => describe(byId(id)).name;
    lines = [];
    for (const result of results) {
      for (const id of result.surprised) setBox(id, true);
      for (const id of result.noticed) setBox(id, false);
      if (result.rolled.length === 0) continue;
      lines.push(
        stealthLine(
          result.side,
          result.rolled.map((r) => ({ name: nameOf(r.id), total: r.total })),
          result.surprised.map(nameOf),
        ),
      );
    }
    outcome.replaceChildren(...lines.map((line) => el('p', '', line)));
  };

  const byId = (/** @type {string} */ id) =>
    /** @type {Participant} */ (roster.find((p) => p.id === id));
  const setBox = (/** @type {string} */ id, /** @type {boolean} */ on) => {
    const box = surprised.get(id);
    if (box) box.checked = on;
  };

  const roll = textButton(
    'Roll Stealth',
    () => {
      for (const p of roster.filter(sneaks)) {
        /** @type {HTMLInputElement} */ (totals.get(p.id)).value = String(hooks.rollStealth(p));
      }
      judge();
    },
    { icon: 'dice' },
  );
  side.addEventListener('change', () => {
    layout();
    judge();
  });

  return {
    section: el(
      'div',
      'combat-setup__stealth u-stack u-g1',
      el('div', 'u-row u-g2', labeled('Who sneaks', side), roll),
      outcome,
    ),
    /**
     * The Stealth total and passive Perception cells of one row, in one
     * group that wraps below the row on a narrow screen. Either, both, or
     * neither show, to match the picker.
     * @param {Participant} participant
     * @returns {HTMLElement}
     */
    cells(participant) {
      const name = describe(participant).name;
      const total = numberField('', {
        className: 'combat-setup__stealth-field',
        ariaLabel: `Stealth total for ${name}`,
        placeholder: 'Stealth',
      });
      total.addEventListener('input', judge);
      totals.set(participant.id, total);
      // A visible word names the box, because a filled box loses its
      // placeholder and looks like a second initiative box.
      const cell = el(
        'label',
        'combat-setup__stealth-total',
        el('span', 'u-muted', 'Stealth'),
        total,
      );
      cells.set(participant.id, cell);
      const passive = hooks.passivePerception(participant);
      passiveOf.set(participant.id, passive);
      const shown = el('span', 'combat-setup__passive u-muted', `PP ${passive}`);
      setTip(shown, 'Passive Perception, compared with each Stealth total of the other side');
      passives.set(participant.id, shown);
      const group = el('span', 'combat-setup__sneak u-row u-g2', cell, shown);
      groups.set(participant.id, group);
      return group;
    },
    /** Hide the cells to match the picker. Call once the rows exist. */
    layout,
    /** The outcome line of each contest that ran, party first. */
    lines: () => lines,
  };
}
