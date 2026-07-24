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
 * No text parsing — counts come from UI state. With advantage or
 * disadvantage set, each d20 rolls twice and keeps the higher (or lower)
 * die, recording the discarded one in `dropped`; other die types are
 * unaffected, matching the 5e rule.
 * @param {DiceSelection} selection
 * @param {RandomFn} [rng] injectable RNG for testing, defaults to Math.random
 * @returns {DiceResult}
 */
export function roll(selection, rng = Math.random) {
  const mode = selection.mode ?? 'normal';
  /** @type {DieTypeResult[]} */
  const results = [];

  for (const die of DIE_TYPES) {
    const count = selection.counts[die] ?? 0;
    if (count <= 0) continue;
    const sides = DIE_SIDES[die];
    /** @type {number[]} */
    const rolls = [];
    /** @type {number[]} */
    const dropped = [];
    for (let i = 0; i < count; i++) {
      const first = Math.floor(rng() * sides) + 1;
      if (die !== 'd20' || mode === 'normal') {
        rolls.push(first);
        continue;
      }
      const second = Math.floor(rng() * sides) + 1;
      const kept = mode === 'advantage' ? Math.max(first, second) : Math.min(first, second);
      rolls.push(kept);
      dropped.push(kept === first ? second : first);
    }
    const subtotal = rolls.reduce((sum, value) => sum + value, 0);
    results.push(dropped.length > 0 ? { die, rolls, subtotal, dropped } : { die, rolls, subtotal });
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
  return { counts: {}, modifier: 0, mode: /** @type {const} */ ('normal') };
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
    const group = byType.get(part.damageType) ?? {
      damageType: part.damageType,
      rolls: [],
      subtotal: 0,
    };
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
 * "d20[14]=14 + modifier=2 -> total: 16". Rolls made at advantage or
 * disadvantage name the mode and the discarded d20s so the readout shows
 * both dice, e.g. "d20[17]=17 -> total: 17 (advantage, dropped 5)".
 * @param {import('../types/dice.js').DiceResult} result
 * @returns {string}
 */
export function formatResult(result) {
  const parts = result.results.map((r) => `${r.die}[${r.rolls.join(',')}]=${r.subtotal}`);
  if (result.modifier !== 0) parts.push(`modifier=${result.modifier}`);
  const dropped = result.results.flatMap((r) => r.dropped ?? []);
  const suffix =
    dropped.length > 0 ? ` (${result.selection.mode}, dropped ${dropped.join(',')})` : '';
  return `${parts.join(' + ')} -> total: ${result.total}${suffix}`;
}
