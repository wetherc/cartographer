/**
 * The outcomes of a buff cast. A buff rolls no attack and no save. Each
 * target takes the chip the spell names, with what that chip adds to its
 * later rolls and what it changes besides a roll, and the temporary HP the
 * spell grants at the cast. `Casting.castSpell` calls this for a buff, and
 * `app/spellOutcomes.js` writes the result. Every function here is pure.
 */

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/spell.js').SpellBuffEffect} SpellBuffEffect */
/** @typedef {import('../types/spell.js').SpellTempHP} SpellTempHP */
/** @typedef {import('../types/entities.js').ChipMods} ChipMods */
/** @typedef {import('../types/dice.js').RandomFn} RandomFn */

/**
 * What a buff spell's chip is called: the name the effect states, or the
 * spell's own name when it states none. The cast and the detail modal both
 * read this, so the chip a GM sees promised is the chip that lands.
 * @param {Spell} spell
 * @returns {string}
 */
export function buffCondition(spell) {
  const named = spell.effect.kind === 'buff' ? spell.effect.condition?.trim() : '';
  return named || spell.name;
}

/**
 * The mods a buff writes onto its chips, for a cast at `steps` scaling
 * increments. Aid's raise grows with the slot, and Heroism's temporary HP
 * each turn is the caster's spell modifier, which a modifier of 0 or less
 * makes nothing.
 * A spell with a `resistChoice` adds the damage type the caster picked to
 * `mods.resist`. A pick outside the list falls back to the first type, so a
 * cast from a dialog that sent no pick still resists something.
 * @param {SpellBuffEffect} effect
 * @param {number} steps
 * @param {number} spellModifier
 * @param {string} [resistPick]
 * @returns {ChipMods | null}
 */
export function castMods(effect, steps, spellModifier, resistPick) {
  /** @type {ChipMods} */
  const mods = { ...effect.mods };
  const choice = effect.resistChoice ?? [];
  if (choice.length > 0) {
    const picked = resistPick && choice.includes(resistPick) ? resistPick : choice[0];
    mods.resist = [...new Set([...(mods.resist ?? []), picked])];
  }
  const raise = (mods.maxHP ?? 0) + (effect.modsPerStep?.maxHP ?? 0) * steps;
  if (raise > 0) mods.maxHP = raise;
  if (effect.tempEachTurn && spellModifier > 0) mods.tempHPEachTurn = spellModifier;
  return Object.keys(mods).length > 0 ? mods : null;
}

/**
 * Roll a buff's temporary HP for one target.
 * @param {SpellTempHP} temp
 * @param {number} steps
 * @param {RandomFn} rng
 * @returns {{ total: number, text: string }}
 */
export function rollTempHP(temp, steps, rng) {
  const rolls = Array.from({ length: temp.count }, () => Math.floor(rng() * temp.sides) + 1);
  const flat = temp.flat + (temp.flatPerStep ?? 0) * steps;
  const total = rolls.reduce((sum, n) => sum + n, flat);
  const dice = temp.count > 0 ? `${temp.count}d${temp.sides} [${rolls.join(', ')}]` : '';
  const text = [dice, flat ? String(flat) : ''].filter(Boolean).join(' + ');
  return { total: Math.max(0, total), text };
}

/**
 * One outcome per target: the chip name, rider, and mods, and the rolled
 * temporary HP when the spell grants any.
 * @param {Spell} spell
 * @param {SpellBuffEffect} effect
 * @param {import('./Casting.js').CastTarget[]} targets
 * @param {{ steps: number, spellModifier: number, rng: RandomFn, resistPick?: string }} ctx
 */
export function buffOutcomes(spell, effect, targets, { steps, spellModifier, rng, resistPick }) {
  const condition = buffCondition(spell);
  const mods = castMods(effect, steps, spellModifier, resistPick);
  return targets.map((target) => ({
    target,
    condition,
    rider: effect.rider ?? null,
    mods,
    ...(effect.hit ? { hit: effect.hit } : {}),
    ...(effect.tempHP ? { tempHP: rollTempHP(effect.tempHP, steps, rng) } : {}),
  }));
}
