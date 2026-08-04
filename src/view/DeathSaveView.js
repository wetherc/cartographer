/**
 * What a death-save tracker reads as on screen. The rules live in
 * `entities/DeathSaves.js`. This module turns one tracker into the words and
 * the pip counts that a surface draws, so the combat screen and the character
 * sheet cannot describe the same state differently.
 */

import { DEATH_SAVE_LIMIT } from '../entities/DeathSaves.js';

/** @typedef {import('../types/entities.js').DeathSaveState} DeathSaveState */

/**
 * Which of the three positions a tracker is in. A character with no tracker
 * has no readout at all, so `null` is the fourth answer.
 * @typedef {'dying' | 'stable' | 'dead'} DeathSaveStatus
 */

/**
 * @param {DeathSaveState | null | undefined} state
 * @returns {DeathSaveStatus | null}
 */
export function deathSaveStatus(state) {
  if (!state) return null;
  if (state.failures >= DEATH_SAVE_LIMIT) return 'dead';
  return state.stable ? 'stable' : 'dying';
}

/**
 * The whole readout for one tracker, or null when there is nothing to show.
 * `pips` is the row a surface draws: `DEATH_SAVE_LIMIT` successes followed by
 * `DEATH_SAVE_LIMIT` failures, each marked filled or empty. A stable or dead
 * character has no pips, because its counters no longer mean anything.
 * `rollable` says whether a Roll control belongs beside it, and `stabilizable`
 * the same for a Stabilize control.
 *
 * `label` is what a sighted reader sees. `ariaLabel` says the counts in words,
 * because a row of filled and empty circles does not read aloud.
 * @param {DeathSaveState | null | undefined} state
 * @returns {{
 *   status: DeathSaveStatus,
 *   label: string,
 *   ariaLabel: string,
 *   pips: { kind: 'success' | 'failure', filled: boolean }[],
 *   rollable: boolean,
 *   stabilizable: boolean,
 * } | null}
 */
export function deathSaveReadout(state) {
  const status = deathSaveStatus(state);
  if (!status || !state) return null;
  if (status === 'dead') {
    return {
      status,
      label: 'Dead',
      ariaLabel: 'Dead, three death saves failed',
      pips: [],
      rollable: false,
      stabilizable: false,
    };
  }
  if (status === 'stable') {
    return {
      status,
      label: 'Stable at 0 HP',
      ariaLabel: 'Stable at 0 HP, no more death saves',
      pips: [],
      rollable: false,
      stabilizable: false,
    };
  }
  /** @type {{ kind: 'success' | 'failure', filled: boolean }[]} */
  const pips = [];
  for (let i = 0; i < DEATH_SAVE_LIMIT; i += 1) {
    pips.push({ kind: 'success', filled: i < state.successes });
  }
  for (let i = 0; i < DEATH_SAVE_LIMIT; i += 1) {
    pips.push({ kind: 'failure', filled: i < state.failures });
  }
  return {
    status,
    label: 'Death saves',
    ariaLabel:
      `Death saves: ${state.successes} of ${DEATH_SAVE_LIMIT} successes, ` +
      `${state.failures} of ${DEATH_SAVE_LIMIT} failures`,
    pips,
    rollable: true,
    stabilizable: true,
  };
}
