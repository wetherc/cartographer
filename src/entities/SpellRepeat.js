/**
 * Spells that a caster uses again on later turns without a new slot. The
 * first cast of Spiritual Weapon costs a slot and a bonus action, and each
 * later turn of its minute costs only the bonus action for another attack.
 * Witch Bolt's arc stays on the creature it hit and deals its damage again
 * each turn for the caster's action.
 *
 * The caster keeps a chip named after the spell while the repeat is open. The
 * chip names the cast as its source, with `repeat` holding the slot level of
 * the first cast and, for a locked spell, the creatures it hit. The chip ticks
 * down with the spell's duration, and a concentration spell loses it when the
 * caster stops concentrating, the same way every other chip of that cast goes.
 * Every function here is pure.
 */

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/entities.js').RepeatHold} RepeatHold */

/**
 * The repeat a caster keeps open for one spell, or null when it keeps none.
 * @param {{ id: string, conditions?: Condition[] }} caster
 * @param {string} spellId
 * @returns {RepeatHold | null}
 */
export function heldRepeat(caster, spellId) {
  const chip = (caster.conditions ?? []).find(
    (c) => c.source?.repeat && c.source.spellId === spellId && c.source.casterId === caster.id,
  );
  return chip?.source?.repeat ?? null;
}

/**
 * The spell that one repeat resolves. A repeat with fixed damage becomes an
 * attack that hits on its own, with no scaling, because Witch Bolt's later
 * damage is 1d12 whatever slot the first cast used. Any other repeat resolves
 * the spell's own effect again.
 * @param {Spell} spell
 * @returns {Spell}
 */
export function repeatedSpell(spell) {
  const damage = spell.repeat?.damage;
  if (!damage || damage.length === 0) return spell;
  const { scaling: _scaling, ...rest } = spell;
  return {
    ...rest,
    targetCount: 1,
    effect: { kind: 'attack', damage, projectiles: { count: 1, autoHit: true } },
  };
}

/**
 * Whether the first cast of a spell opens a repeat. A spell that locks its
 * repeat onto the creatures it hit opens one only when it hit something.
 * @param {Spell} spell
 * @param {string[]} hitIds the creatures the first cast hit
 * @returns {boolean}
 */
export function opensRepeat(spell, hitIds) {
  if (!spell.repeat) return false;
  return !spell.repeat.damage || hitIds.length > 0;
}

/**
 * The caster without the repeat it keeps open for one spell. A fresh cast of
 * the spell calls this, because the chip of the old repeat can outlast the
 * new one, and the caster would then keep repeating at the old slot level.
 * @template {{ id: string, conditions?: Condition[] }} T
 * @param {T} caster
 * @param {string} spellId
 * @returns {T}
 */
export function dropRepeat(caster, spellId) {
  const conditions = (caster.conditions ?? []).filter(
    (c) => !(c.source?.repeat && c.source.spellId === spellId && c.source.casterId === caster.id),
  );
  return { ...caster, conditions };
}
