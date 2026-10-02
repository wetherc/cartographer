/**
 * The damage type that a reaction spell would resist in one hit, for the
 * pause after a damage roll (`app/damageWard.js`). A buff whose chip resists
 * types in `mods.resist`, or lets the caster pick one from `resistChoice`,
 * qualifies. Every function here is pure.
 */

/** @typedef {import('../types/spell.js').Spell} Spell */
/** @typedef {import('../dice/DiceRoller.js').DamageGroup} DamageGroup */
/** @typedef {import('../types/creature.js').DamageDefenses} DamageDefenses */

/**
 * The damage types a buff spell's chip can resist: its fixed list and its
 * pick list together. Any other spell resists nothing.
 * @param {Spell} spell
 * @returns {string[]}
 */
export function wardTypes(spell) {
  if (spell.effect.kind !== 'buff') return [];
  return [...(spell.effect.mods?.resist ?? []), ...(spell.effect.resistChoice ?? [])];
}

/**
 * The type in the hit that the spell would resist, or null when it would
 * change nothing. A type that the defender already resists or is immune to
 * gains nothing, so it does not count. With more than one type, the one that
 * deals the most damage wins, because the pick resists one type only.
 * @param {Spell} spell
 * @param {DamageGroup[]} groups the hit's damage, one group per type
 * @param {DamageDefenses} defenses what the defender already has
 * @returns {string | null}
 */
export function wardType(spell, groups, defenses) {
  const types = wardTypes(spell);
  const covered = new Set([...(defenses.resist ?? []), ...(defenses.immune ?? [])]);
  const best = groups
    .filter((g) => g.subtotal > 0 && types.includes(g.damageType) && !covered.has(g.damageType))
    .sort((a, b) => b.subtotal - a.subtotal)[0];
  return best ? best.damageType : null;
}

/**
 * The damage that one outcome of an attack or save spell is about to deal,
 * before the target's defenses, for the damage reaction question. An attack
 * hit deals its damage, a miss that splashes deals half, and a multi-shot
 * outcome adds up the rays that hit, per type. A save outcome deals its
 * damage, or half on a success, and nothing when the save negates it or the
 * spell passes the target over. Halving floors each type and the total, the
 * same way `applyDefenses` halves a save.
 * @param {string} kind the spell effect's kind
 * @param {any} o one outcome of the cast
 * @returns {{ groups: DamageGroup[], total: number }}
 */
export function landingDamage(kind, o) {
  /** @type {DamageGroup[]} */
  let groups = [];
  let halve = false;
  if (kind === 'attack' && o.shots) {
    /** @type {Map<string, DamageGroup>} */
    const byType = new Map();
    for (const s of o.shots) {
      for (const g of s.damage?.byType ?? []) {
        const had = byType.get(g.damageType);
        byType.set(
          g.damageType,
          had
            ? {
                ...had,
                rolls: [...had.rolls, ...g.rolls],
                bonus: had.bonus + g.bonus,
                subtotal: had.subtotal + g.subtotal,
              }
            : g,
        );
      }
    }
    groups = [...byType.values()];
  } else if (kind === 'attack') {
    groups = o.hit || o.halved ? (o.damage?.byType ?? []) : [];
    halve = !o.hit;
  } else if (kind === 'save' && !o.unaffectedBy && o.taken > 0) {
    groups = o.damage?.byType ?? [];
    halve = !!o.saved;
  }
  const sum = groups.reduce((n, g) => n + g.subtotal, 0);
  if (!halve) return { groups, total: sum };
  return {
    groups: groups.map((g) => ({ ...g, subtotal: Math.floor(g.subtotal / 2) })),
    total: Math.floor(sum / 2),
  };
}
