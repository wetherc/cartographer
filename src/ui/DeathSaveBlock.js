import { el } from './dom.js';
import { textButton } from './buttons.js';
import { deathSaveReadout } from '../view/DeathSaveView.js';

/** @typedef {import('../types/entities.js').DeathSaveState} DeathSaveState */

/**
 * The death-save line, shared by the combat screen and the character sheet so
 * both describe a dying character the same way. It shows three success pips
 * and three failure pips, with Roll and Stabilize controls beside them. A
 * stable character shows "Stable at 0 HP" and a dead one "Dead", with no
 * controls, because neither rolls again.
 *
 * The function returns null when the character holds no tracker, which is the
 * usual case. A caller appends whatever comes back and needs no test of its
 * own.
 *
 * `canAct` decides whether the controls appear. On the combat screen that is
 * the viewer who may act for the combatant. On the sheet it is the play
 * permission. A viewer without it still reads the pips.
 * @param {DeathSaveState | null | undefined} state
 * @param {{
 *   name: string,
 *   canAct: boolean,
 *   onRoll: () => void,
 *   onStabilize: () => void,
 * }} opts
 * @returns {HTMLElement | null}
 */
export function deathSaveBlock(state, { name, canAct, onRoll, onStabilize }) {
  const readout = deathSaveReadout(state);
  if (!readout) return null;
  const line = el('div', `death-saves death-saves--${readout.status} u-row u-wrap u-g1`);
  // Dead is the loudest thing in the column, so its label leaves the muted
  // voice that the other two positions keep.
  const labelClass =
    readout.status === 'dead' ? 'death-saves__label' : 'death-saves__label u-muted';
  line.appendChild(el('span', labelClass, readout.label));
  if (readout.pips.length > 0) {
    const pips = el('span', 'death-saves__pips u-row u-g1');
    pips.setAttribute('role', 'img');
    pips.setAttribute('aria-label', readout.ariaLabel);
    // The successes and the failures run together as one row of circles
    // otherwise. The first failure takes a wider gap, which splits the row
    // into its two halves without a second element around each half.
    let firstFailure = true;
    for (const pip of readout.pips) {
      const split = pip.kind === 'failure' && firstFailure;
      if (pip.kind === 'failure') firstFailure = false;
      pips.appendChild(
        el(
          'span',
          `death-saves__pip death-saves__pip--${pip.kind}${split ? ' death-saves__pip--split' : ''}`,
          pip.filled ? '●' : '○',
        ),
      );
    }
    line.appendChild(pips);
  } else {
    line.setAttribute('aria-label', readout.ariaLabel);
  }
  if (canAct && readout.rollable) {
    line.appendChild(
      textButton('Roll death save', onRoll, {
        ariaLabel: `Roll a death save for ${name}`,
      }),
    );
  }
  if (canAct && readout.stabilizable) {
    line.appendChild(
      textButton('Stabilize', onStabilize, { ariaLabel: `Stabilize ${name} at 0 HP` }),
    );
  }
  return line;
}
