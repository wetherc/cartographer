import { CONSUMABLE_PRESETS } from './EquipmentPresets.js';

/**
 * The heal dice that a consumable item stores. This module has no imports
 * beyond the presets, so `Equipment.js` can use it on load without an
 * import cycle through the rules modules.
 */

/** @typedef {import('../types/entities.js').HealDice} HealDice */

/** The die sizes a heal can roll. */
const HEAL_SIDES = [4, 6, 8, 10, 12, 20];

/**
 * A heal dice record read from untrusted data, or null when the value is
 * not one. The count runs from 1 to 99 and the bonus from 0 to 999, and a
 * die size outside the heal sizes rejects the whole record.
 * @param {unknown} raw
 * @returns {HealDice | null}
 */
export function coerceHeals(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const { count, sides, bonus } = /** @type {Record<string, unknown>} */ (raw);
  const whole = (/** @type {unknown} */ v) => (Number.isFinite(v) ? Math.trunc(Number(v)) : NaN);
  const n = whole(count);
  const s = whole(sides);
  if (!(n >= 1) || !HEAL_SIDES.includes(s)) return null;
  const b = whole(bonus ?? 0);
  return { count: Math.min(n, 99), sides: s, bonus: Math.min(Math.max(b || 0, 0), 999) };
}

/**
 * The heal dice of the built-in potion with this name, or null. A save
 * written before items stored their own heal uses this to fill it.
 * @param {string} name
 * @returns {HealDice | null}
 */
export function presetHeals(name) {
  const heals = CONSUMABLE_PRESETS.find((p) => p.name === name)?.heals;
  return heals ? { ...heals } : null;
}

/**
 * An item with its heal field checked. A valid `heals` stays, and an invalid
 * one is dropped. A consumable with no `heals` whose name matches a built-in
 * potion gets that potion's dice, so an item from an older save still heals.
 * The same object comes back when nothing changes.
 * @template {{ name: string, type?: string, heals?: unknown }} T
 * @param {T} item
 * @returns {T}
 */
export function withHeals(item) {
  if (item.heals !== undefined) {
    const heals = coerceHeals(item.heals);
    if (heals) return { ...item, heals };
    const { heals: _dropped, ...rest } = item;
    return /** @type {T} */ (rest);
  }
  const preset = item.type === 'consumable' ? presetHeals(item.name) : null;
  return preset ? { ...item, heals: preset } : item;
}
