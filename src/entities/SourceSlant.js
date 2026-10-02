/**
 * A chip that slants its holder's attack rolls against the caster who wrote
 * it. Chill Touch leaves one on an undead target: the target attacks the
 * caster at disadvantage until the end of the caster's next turn. The chip
 * keeps the caster in `source.casterId`, so the rule needs no other state.
 * Every function is pure.
 */

/** @typedef {import('../types/entities.js').Condition} Condition */

/**
 * The slant that the attacker's chips put on an attack against this
 * defender, or null when none does.
 * @param {Condition[] | undefined} attackerChips
 * @param {string | undefined} defenderId
 * @returns {'disadvantage' | null}
 */
export function sourceSlant(attackerChips, defenderId) {
  if (!defenderId) return null;
  const slanted = (attackerChips ?? []).some(
    (chip) => chip.mods?.disadvantageVsSource && chip.source?.casterId === defenderId,
  );
  return slanted ? 'disadvantage' : null;
}
