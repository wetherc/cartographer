import { promptModal } from './Modal.js';
import { STAT_KEYS, normalizeStatBlock } from '../entities/Modifiers.js';

/** @typedef {import('../types/entities.js').StatModifier} StatModifier */

/**
 * A row of stat chips ("STR 14", "AC 13") covering the fixed stat set (the six
 * ability scores plus AC) — stats can't be added or removed, only changed.
 * The bar runs in one of two modes:
 *
 * - `base` (Build authoring): clicking a chip sets the stat's base value.
 * - `temp` (Play): chips show the effective value (base plus active timed
 *   modifiers, with the remaining rounds); clicking one adds a +/- adjustment
 *   for a number of combat rounds. Base values aren't editable here.
 *
 * Reads current values via callbacks and reports each change through the
 * matching `on*` callback, so the owner only has to persist it.
 * @param {HTMLElement} container
 * @param {{
 *   mode: 'base' | 'temp',
 *   getStatBlock: () => Record<string, number>,
 *   getStatMods?: () => StatModifier[],
 *   onSetStat?: (name: string, value: number) => void,
 *   onAddModifier?: (name: string, delta: number, rounds: number) => void,
 * }} callbacks
 * @returns {{ update: () => void }}
 */
export function mountStatBlockBar(container, callbacks) {
  const root = document.createElement('div');
  root.className = 'statblock-bar';
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
    const rounds = Math.max(1, Number(values.rounds) || 1);
    if (delta !== 0) callbacks.onAddModifier?.(name, delta, rounds);
    render();
  }

  function render() {
    root.innerHTML = '';
    const base = normalizeStatBlock(callbacks.getStatBlock());
    const mods = callbacks.mode === 'temp' ? (callbacks.getStatMods?.() ?? []) : [];
    for (const name of STAT_KEYS) {
      const active = mods.filter((m) => m.stat === name);
      const effective = base[name] + active.reduce((sum, m) => sum + m.delta, 0);
      const modified = effective !== base[name];

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'statblock-bar__chip';
      if (modified) chip.classList.add('statblock-bar__chip--modified');
      if (callbacks.mode === 'base') {
        chip.textContent = `${name} ${base[name]}`;
        chip.setAttribute('aria-label', `Set ${name} (currently ${base[name]})`);
        chip.title = `Set ${name}`;
        chip.addEventListener('click', () => editBase(name, base[name]));
      } else {
        // Show the value combat actually uses; a modified stat also shows its
        // base and how long the adjustment lasts.
        const rounds = Math.max(0, ...active.map((m) => m.rounds));
        chip.textContent = modified
          ? `${name} ${base[name]}→${effective} (${rounds}r)`
          : `${name} ${effective}`;
        chip.setAttribute(
          'aria-label',
          modified
            ? `Modify ${name} (base ${base[name]}, currently ${effective} for ${rounds} more rounds)`
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
