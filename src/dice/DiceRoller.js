/** @typedef {import('../types/dice.js').DieType} DieType */
/** @typedef {import('../types/dice.js').DiceCounts} DiceCounts */
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
 * Roll a structured dice selection: counts per die type plus a flat modifier.
 * Counts come from UI state, not text parsing. If advantage or disadvantage
 * is set, each d20 rolls twice. The roll keeps the higher die (advantage) or
 * the lower die (disadvantage) and records the other die in `dropped`. Other
 * die types are not affected. This matches the 5e rule.
 * @param {DiceSelection} selection
 * @param {RandomFn} [rng] Test RNG. Defaults to Math.random.
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

  // The result carries a copy of the selection, not the live object. The
  // dice tray reuses its selection across rolls, and a result must keep the
  // values it was rolled with.
  return {
    selection: {
      counts: { ...selection.counts },
      modifier,
      ...(selection.mode !== undefined ? { mode: selection.mode } : {}),
    },
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
 * Resolve a pre-roll attack tweak (bonus or penalty dice plus a flat bonus,
 * for example Bless's +1d4 or Bane's -1d4) into pieces that a d20 attack
 * roll can use. Bonus dice stay in the returned counts, so the roll shows
 * them directly. Penalty dice cannot go in the counts, because selection
 * counts must not be negative. This function rolls penalty dice here and
 * folds the result into the modifier, and keeps the rolled values in the
 * note. The note reads like "+1d4" or "-1d4 [3] +2". The note is empty when
 * there is nothing to apply.
 * @param {number} count bonus (positive) or penalty (negative) dice
 * @param {DieType} die
 * @param {number} flat
 * @param {RandomFn} [rng]
 * @returns {{ counts: DiceCounts, modifier: number, note: string }}
 */
export function attackTweak(count, die, flat, rng = Math.random) {
  /** @type {DiceCounts} */
  const counts = {};
  const notes = [];
  let modifier = flat;
  if (count > 0) {
    counts[die] = count;
    notes.push(`+${count}${die}`);
  } else if (count < 0) {
    /** @type {number[]} */
    const rolls = [];
    for (let i = 0; i < -count; i++) rolls.push(Math.floor(rng() * DIE_SIDES[die]) + 1);
    modifier -= rolls.reduce((sum, value) => sum + value, 0);
    notes.push(`-${-count}${die} [${rolls.join(',')}]`);
  }
  if (flat !== 0) notes.push(`${flat > 0 ? '+' : ''}${flat}`);
  return { counts, modifier, note: notes.join(' ') };
}

/**
 * One damage group. It holds every term of one damage type: the raw dice,
 * the flat amount added to them, and the total of both. The total cannot go
 * below zero.
 * @typedef {{ damageType: string, rolls: number[], bonus: number, subtotal: number }} DamageGroup
 */

/**
 * A damage result has two readouts, built from its groups. `text` is the
 * short line per type, for example "7 slashing + 3 fire". `detail` also
 * shows each group's raw dice and its flat amount, for example
 * "7 slashing [2,3 +2] + 3 fire [3]", for logs that must keep the individual
 * rolls. This function is shared so a merged result reads the same as a
 * single result.
 * @param {DamageGroup[]} groups
 * @returns {{ total: number, byType: DamageGroup[], text: string, detail: string }}
 */
export function damageReadout(groups) {
  return {
    total: groups.reduce((sum, g) => sum + g.subtotal, 0),
    byType: groups,
    text: groups.map((g) => `${g.subtotal} ${g.damageType}`).join(' + '),
    detail: groups
      .map((g) => {
        const sign = `${g.bonus > 0 ? '+' : '-'}${Math.abs(g.bonus)}`;
        // A group with no dice shows only the flat amount, with no leading
        // separator.
        const bonus = g.bonus === 0 ? '' : `${g.rolls.length > 0 ? ' ' : ''}${sign}`;
        return `${g.subtotal} ${g.damageType} [${g.rolls.join(',')}${bonus}]`;
      })
      .join(' + '),
  };
}

/**
 * Roll a weapon's damage terms. Each term has a `count` of dice with `sides`
 * sides, for one damage type. The function folds a flat modifier into the
 * first term's type: the ability modifier boosts the weapon's own damage,
 * not its riders (5e rule). A term can also carry its own `bonus`, which
 * stays with that term's damage type wherever it sits, for example Magic
 * Missile's 1d4+1. Terms that share a damage type merge into one group. No
 * group total can go below zero, even with a large negative flat amount.
 * @param {import('../types/entities.js').DamagePart[]} parts
 * @param {number} [modifier]
 * @param {RandomFn} [rng]
 * @returns {ReturnType<typeof damageReadout>}
 */
export function rollDamage(parts, modifier = 0, rng = Math.random) {
  /** @type {Map<string, DamageGroup>} */
  const byType = new Map();
  for (const part of parts) {
    const bonus = part.bonus ?? 0;
    if (part.count <= 0 && bonus === 0) continue;
    const group = byType.get(part.damageType) ?? {
      damageType: part.damageType,
      rolls: [],
      bonus: 0,
      subtotal: 0,
    };
    for (let i = 0; i < part.count; i++) {
      const value = Math.floor(rng() * part.sides) + 1;
      group.rolls.push(value);
      group.subtotal += value;
    }
    group.bonus += bonus;
    group.subtotal += bonus;
    byType.set(part.damageType, group);
  }
  const groups = [...byType.values()];
  // The ability modifier boosts the first group only. It joins that group's
  // flat amount so the readout shows one number, not two.
  if (groups.length > 0) {
    groups[0].bonus += modifier;
    groups[0].subtotal += modifier;
  }
  for (const group of groups) group.subtotal = Math.max(0, group.subtotal);
  return damageReadout(groups);
}

/**
 * Render a roll result as one line, for example
 * "d20[14]=14 + modifier=2 -> total: 16". A roll made at advantage or
 * disadvantage names the mode and shows the discarded d20 too, for example
 * "d20[17]=17 -> total: 17 (advantage, dropped 5)".
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
