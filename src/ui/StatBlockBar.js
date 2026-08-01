import { promptModal } from './Modal.js';
import { STAT_KEYS } from '../entities/Modifiers.js';
import { effectiveStat } from '../entities/Stats.js';
import { clampInt } from '../util/num.js';
import { classNames, el } from './dom.js';

/**
 * A row of stat chips, for example "STR 14" or "AC 13", covering the fixed
 * stat set: the six ability scores plus AC. A stat can only change value,
 * never be added or removed. The bar runs in one of two modes.
 *
 * - `base` (Build authoring): a click on a chip sets the stat's base value.
 * - `temp` (Play): a chip shows the effective value, base plus active
 *   timed modifiers, with the remaining rounds. A click on a chip adds a
 *   plus or minus adjustment for a number of combat rounds. Base values
 *   are not editable here.
 *
 * The bar reads the entity through a callback, so each render sees the values
 * as they now stand, and reports each change through the matching `on*`
 * callback. The owner only has to persist the change.
 * @param {HTMLElement} container
 * @param {{
 *   mode: 'base' | 'temp',
 *   getEntity: () => import('../types/entities.js').Character | import('../types/entities.js').Encounter,
 *   onSetStat?: (name: string, value: number) => void,
 *   onAddModifier?: (name: string, delta: number, rounds: number) => void,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountStatBlockBar(container, callbacks) {
  const root = el('div', 'statblock-bar');
  container.appendChild(root);

  /** @param {string} name @param {number} base */
  async function editBase(name, base) {
    const values = await promptModal(
      `Set ${name}`,
      [{ name: 'value', label: `${name} value`, type: 'number', value: base }],
      { submitLabel: 'Save' },
    );
    if (!values) return;
    callbacks.onSetStat?.(name, Number(values.value) || 0);
    render();
  }

  /** @param {string} name */
  async function addModifier(name) {
    const values = await promptModal(
      `Modify ${name}`,
      [
        { name: 'delta', label: 'Adjustment (+/-)', type: 'number', value: 1 },
        { name: 'rounds', label: 'For rounds', type: 'number', value: 1, min: 1 },
      ],
      { submitLabel: 'Apply' },
    );
    if (!values) return;
    const delta = Number(values.delta) || 0;
    const rounds = clampInt(values.rounds, 1);
    if (delta !== 0) callbacks.onAddModifier?.(name, delta, rounds);
    render();
  }

  function render() {
    root.innerHTML = '';
    const entity = callbacks.getEntity();
    for (const name of STAT_KEYS) {
      // Build authors the base values, so its chips ignore any source layered
      // over them.
      const { base, total, rounds } = effectiveStat(entity, name);
      const effective = callbacks.mode === 'temp' ? total : base;
      const modified = effective !== base;

      const chip = el(
        'button',
        classNames(['chip statblock-bar__chip', modified && 'statblock-bar__chip--modified']),
      );
      chip.type = 'button';
      if (callbacks.mode === 'base') {
        chip.textContent = `${name} ${base}`;
        chip.setAttribute('aria-label', `Set ${name} (currently ${base})`);
        chip.title = `Set ${name}`;
        chip.addEventListener('click', () => editBase(name, base));
      } else {
        // This shows the value combat uses. A modified stat also shows its
        // base value and how long the adjustment lasts.
        chip.textContent = modified
          ? `${name} ${base}→${effective} (${rounds}r)`
          : `${name} ${effective}`;
        chip.setAttribute(
          'aria-label',
          modified
            ? `Modify ${name} (base ${base}, currently ${effective} for ${rounds} more rounds)`
            : `Modify ${name} (currently ${effective})`,
        );
        chip.title = `Modify ${name} for a number of rounds`;
        chip.addEventListener('click', () => addModifier(name));
      }
      root.appendChild(chip);
    }
  }

  render();
  return { update: render };
}
