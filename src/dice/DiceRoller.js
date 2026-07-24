/** @typedef {import('../types/dice.js').DieType} DieType */
/** @typedef {import('../types/dice.js').DiceSelection} DiceSelection */
/** @typedef {import('../types/dice.js').DieTypeResult} DieTypeResult */
/** @typedef {import('../types/dice.js').DiceResult} DiceResult */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/** @type {Record<DieType, number>} */
export const DIE_SIDES = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
};

/** @type {DieType[]} */
export const DIE_TYPES = /** @type {DieType[]} */ (Object.keys(DIE_SIDES));

/**
 * Roll a structured dice selection (counts per die type + flat modifier).
 * No text parsing — counts come from UI state.
 * @param {DiceSelection} selection
 * @param {RandomFn} [rng] injectable RNG for testing, defaults to Math.random
 * @returns {DiceResult}
 */
export function roll(selection, rng = Math.random) {
  /** @type {DieTypeResult[]} */
  const results = [];

  for (const die of DIE_TYPES) {
    const count = selection.counts[die] ?? 0;
    if (count <= 0) continue;
    const sides = DIE_SIDES[die];
    const rolls = Array.from({ length: count }, () => Math.floor(rng() * sides) + 1);
    const subtotal = rolls.reduce((sum, value) => sum + value, 0);
    results.push({ die, rolls, subtotal });
  }

  const diceTotal = results.reduce((sum, result) => sum + result.subtotal, 0);
  const modifier = selection.modifier ?? 0;

  return {
    selection,
    results,
    modifier,
    total: diceTotal + modifier,
  };
}

/**
 * Create an empty dice selection.
 * @returns {DiceSelection}
 */
export function emptySelection() {
  return { counts: {}, modifier: 0 };
}

/**
 * Roll a weapon's damage terms (each `count` dice of `sides` per damage type)
 * with a flat modifier folded into the first term's type, 5e-style — the
 * ability modifier boosts the weapon's own damage, not its riders. Terms
 * sharing a damage type merge into one group; a negative modifier can't take
 * the base group below zero.
 * @param {{ count: number, sides: number, damageType: string }[]} parts
 * @param {number} [modifier]
 * @param {RandomFn} [rng]
 * @returns {{ total: number, byType: { damageType: string, rolls: number[], subtotal: number }[], text: string }}
 */
export function rollDamage(parts, modifier = 0, rng = Math.random) {
  /** @type {Map<string, { damageType: string, rolls: number[], subtotal: number }>} */
  const byType = new Map();
  for (const part of parts) {
    if (part.count <= 0) continue;
    const group = byType.get(part.damageType) ?? { damageType: part.damageType, rolls: [], subtotal: 0 };
    for (let i = 0; i < part.count; i++) {
      const value = Math.floor(rng() * part.sides) + 1;
      group.rolls.push(value);
      group.subtotal += value;
    }
    byType.set(part.damageType, group);
  }
  const groups = [...byType.values()];
  if (groups.length > 0) groups[0].subtotal = Math.max(0, groups[0].subtotal + modifier);
  return {
    total: groups.reduce((sum, g) => sum + g.subtotal, 0),
    byType: groups,
    text: groups.map((g) => `${g.subtotal} ${g.damageType}`).join(' + '),
  };
}

/**
 * Render a roll result as a one-line readout, e.g.
 * "d20[14]=14 + modifier=2 -> total: 16".
 * @param {import('../types/dice.js').DiceResult} result
 * @returns {string}
 */
export function formatResult(result) {
  const parts = result.results.map((r) => `${r.die}[${r.rolls.join(',')}]=${r.subtotal}`);
  if (result.modifier !== 0) parts.push(`modifier=${result.modifier}`);
  return `${parts.join(' + ')} -> total: ${result.total}`;
}
