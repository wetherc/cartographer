import { clamp } from '../util/num.js';

/**
 * The normalizers of written spell fields that the authoring form and the
 * library share: the target count, the projectile block, and the material
 * block. Each one takes untrusted input and returns a clean value. Every
 * function here is pure.
 */

/** The most creatures a spell can name as a fixed target count. Past this
 * limit, a spell describes an area, and `targetCount: 0` states this
 * directly. */
export const MAX_TARGET_COUNT = 20;

/**
 * A written target count, read as a number. It is floored and held to the
 * range 0 to 20. Blank or unparsable input falls back to a default, 1 for
 * the authoring form, because a spell that says nothing about its targets
 * hits one creature. The authoring form and the library normalizer share
 * this function, so both agree that 0 means an area. The general `clampInt`
 * function cannot express this, because its missing-value fallback treats a
 * deliberate 0 as nothing written.
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function normalizeTargetCount(value, fallback = 1) {
  if (value === '' || value === null || value === undefined) return fallback;
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count)) return fallback;
  return clamp(count, 0, MAX_TARGET_COUNT);
}

/**
 * Coerce a written projectile block into a clean one, or return null when the
 * value says nothing usable. An absent block is what makes an attack spell
 * roll once. A count below 1 is not a projectile spell, so it reads as
 * absent. The authoring form and the library normalizer share this function.
 * @param {unknown} value
 * @returns {import('../types/spell.js').SpellProjectiles | null}
 */
export function normalizeProjectiles(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const count = Math.floor(Number(raw.count));
  if (!Number.isFinite(count) || count < 1) return null;
  const perStep = Math.floor(Number(raw.perStep));
  return {
    count: Math.min(MAX_TARGET_COUNT, count),
    ...(Number.isFinite(perStep) && perStep > 0
      ? { perStep: Math.min(MAX_TARGET_COUNT, perStep) }
      : {}),
    ...(raw.autoHit ? { autoHit: true } : {}),
  };
}

/**
 * Coerce a written material-component block into a clean one, or return null
 * when the value names nothing. An absent block leaves the component letters
 * as the whole story. A block with no text, no cost, and no consumption says
 * nothing the letters do not already say, so it reads as absent. The
 * authoring form and the library normalizer share this function.
 * @param {unknown} value
 * @returns {import('../types/spell.js').SpellMaterials | null}
 */
export function normalizeMaterials(value) {
  if (!value || typeof value !== 'object') return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const cost = Math.floor(Number(raw.costGP));
  const costGP = Number.isFinite(cost) && cost > 0 ? cost : 0;
  const consumed = !!raw.consumed;
  if (!text && costGP === 0 && !consumed) return null;
  return { text, ...(costGP > 0 ? { costGP } : {}), consumed };
}
