/**
 * Chips that end at a turn boundary, instead of after a count of rounds.
 * Sunbeam blinds a creature until the start of the caster's next turn, and
 * Acid Arrow burns a creature at the end of that creature's next turn. A
 * round tick cannot express either one, because a round starts at the top of
 * the order and a turn starts wherever its combatant sits in it.
 *
 * A chip of this kind has `expires`: the combatant whose turn ends it,
 * the start or the end of that turn, and how many such boundaries are left.
 * Every function here is pure, and each one returns the list it received
 * when nothing in it changes, so an untouched entity keeps its identity.
 */

/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/entities.js').ChipExpiry} ChipExpiry */
/** @typedef {import('../types/spell.js').ChipUntil} ChipUntil */

/**
 * The timing of a chip that should end at a turn boundary. `until` names the
 * boundary relative to the cast (see `ChipUntil`). The chip ends at a turn of
 * the caster or of the target, and only a combatant in the running order has
 * turns. A chip keyed to anyone else, or written outside a fight, lasts one
 * round instead, which is the length of time the boundary stands for.
 *
 * "The end of your next turn" skips the end of the turn that is running now.
 * So a chip that ends at the end of a turn, keyed to the combatant whose turn
 * is running, waits for two such boundaries. Every other chip waits for one.
 * @param {ChipUntil} until
 * @param {{
 *   casterId: string,
 *   targetId: string,
 *   actingId: string | null,
 *   inOrder: (id: string) => boolean,
 * }} cast `actingId` is the combatant whose turn is running, or null
 *   outside a fight
 * @returns {{ rounds: number | null, expires?: ChipExpiry }}
 */
export function chipTiming(until, { casterId, targetId, actingId, inOrder }) {
  const who = until === 'target-end' ? targetId : casterId;
  const at = until === 'caster-start' ? 'start' : 'end';
  if (actingId === null || !inOrder(who)) return { rounds: 1 };
  return { rounds: null, expires: { who, at, count: at === 'end' && who === actingId ? 2 : 1 } };
}

/**
 * The list after one turn boundary of `who`. Every chip keyed to that
 * boundary counts it, and a chip with none left ends. The ended chips come
 * back apart, so the caller can say what each creature is free of.
 * @param {Condition[]} list
 * @param {string} who
 * @param {'start' | 'end'} at
 * @returns {{ conditions: Condition[], ended: Condition[] }}
 */
export function passBoundary(list, who, at) {
  if (!list.some((c) => c.expires?.who === who && c.expires.at === at)) {
    return { conditions: list, ended: [] };
  }
  /** @type {Condition[]} */
  const ended = [];
  /** @type {Condition[]} */
  const conditions = [];
  for (const chip of list) {
    const expires = chip.expires;
    if (!expires || expires.who !== who || expires.at !== at) conditions.push(chip);
    else if (expires.count <= 1) ended.push(chip);
    else conditions.push({ ...chip, expires: { ...expires, count: expires.count - 1 } });
  }
  return { conditions, ended };
}

/**
 * The list without the chips that wait on a turn boundary. With `who`, only
 * the chips keyed to that combatant go. This is what happens when that
 * combatant leaves the fight, because its turns will not come again. Without
 * `who`, every such chip goes, which is what the end of a fight does.
 * @param {Condition[]} list
 * @param {string} [who]
 * @returns {{ conditions: Condition[], ended: Condition[] }}
 */
export function dropBoundaryChips(list, who) {
  const keyed = (/** @type {Condition} */ c) =>
    !!c.expires && (who === undefined || c.expires.who === who);
  if (!list.some(keyed)) return { conditions: list, ended: [] };
  return { conditions: list.filter((c) => !keyed(c)), ended: list.filter(keyed) };
}

/**
 * The chips whose damage rolls at the end of the holder's turn with no save
 * in the way. A chip that allows a repeated save deals its damage only when
 * that save fails, so the retry deals it instead of this sweep.
 * @param {Condition[]} list
 * @returns {Condition[]}
 */
export function ongoingChips(list) {
  return list.filter((c) => c.ongoing && c.ongoing.damage.length > 0 && !c.source?.saveEnds);
}
