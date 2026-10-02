import { classLevelOf } from '../entities/Multiclass.js';
import { hasFeature } from '../entities/Features.js';
import { CHANNEL_DIVINITY_ID } from '../entities/PoolIds.js';

/**
 * Pure rules of the cleric's Channel Divinity options in a fight. Turn Undead
 * needs cleric level 2. Preserve Life needs the feature of that name, which
 * the Life Domain entry in `data/classes.js` grants at cleric level 2. Both
 * spend one use of the Channel Divinity pool and the action. The wiring in
 * `app/channelDivinity.js` opens the dialog and rolls the saves.
 */

/** @typedef {import('./TurnActions.js').TurnAction} TurnAction */
/** @typedef {import('../entities/Features.js').Featured} Featured */

/** The group label of the Channel Divinity buttons. */
export const CHANNEL_GROUP = 'Channel Divinity';

/** The name of the Life Domain option that heals allies. */
export const PRESERVE_LIFE = 'Channel Divinity: Preserve Life';

/**
 * Destroy Undead: the highest CR that a failed save destroys, by cleric level
 * (5e SRD table). Each row is [cleric level, CR].
 */
const DESTROY_UNDEAD = /** @type {const} */ ([
  [17, 4],
  [14, 3],
  [11, 2],
  [8, 1],
  [5, 0.5],
]);

/**
 * The highest CR of undead that Destroy Undead destroys at this cleric level,
 * or null below level 5.
 * @param {number} clericLevel
 * @returns {number | null}
 */
export function destroyUndeadCR(clericLevel) {
  return DESTROY_UNDEAD.find(([level]) => clericLevel >= level)?.[1] ?? null;
}

/**
 * The Channel Divinity buttons of a character, or none without the pool or
 * below cleric level 2. A pool at 0 still gets its buttons, and the press says
 * that no use is left.
 * @param {Featured} character
 * @param {number | undefined} uses the uses left in the pool
 * @returns {TurnAction[]}
 */
export function channelActions(character, uses) {
  if (uses === undefined || classLevelOf(asCharacter(character), 'cleric') < 2) return [];
  const left = `${uses} ${uses === 1 ? 'use' : 'uses'} left`;
  /** @type {TurnAction[]} */
  const list = [
    {
      id: 'turn-undead',
      name: 'Turn Undead',
      cost: 'action',
      group: CHANNEL_GROUP,
      title: `Turn Undead: each undead that fails a WIS save is turned for 1 minute (${left})`,
      ariaLabel: 'Use Channel Divinity: Turn Undead',
      poolId: CHANNEL_DIVINITY_ID,
    },
  ];
  if (hasFeature(character, PRESERVE_LIFE)) {
    list.push({
      id: 'preserve-life',
      name: 'Preserve Life',
      cost: 'action',
      group: CHANNEL_GROUP,
      title: `Preserve Life: share out HP among allies, up to half their max HP (${left})`,
      ariaLabel: 'Use Channel Divinity: Preserve Life',
      poolId: CHANNEL_DIVINITY_ID,
    });
  }
  return list;
}

/**
 * The HP that Preserve Life shares out: 5 times the cleric level.
 * @param {number} clericLevel
 * @returns {number}
 */
export function preserveLifeBudget(clericLevel) {
  return 5 * Math.max(0, clericLevel);
}

/**
 * How much Preserve Life can heal one target: up to half its max HP, so the
 * cap is `max(0, floor(max / 2) - current)`. An undead or a construct gets 0.
 * @param {{ current: number, max: number }} hp
 * @param {string | undefined} creatureType
 * @returns {number}
 */
export function preserveLifeCap(hp, creatureType) {
  if (creatureType === 'undead' || creatureType === 'construct') return 0;
  return Math.max(0, Math.floor(hp.max / 2) - hp.current);
}

/**
 * Check a Preserve Life share-out against the caps and the budget. Each
 * amount is a whole number from 0 to its target's cap, and the sum is at most
 * the budget.
 * @param {Record<string, number>} amounts by target id
 * @param {Record<string, number>} caps by target id
 * @param {number} budget
 * @returns {{ ok: true, total: number } | { ok: false, message: string }}
 */
export function checkAllocation(amounts, caps, budget) {
  let total = 0;
  for (const [id, amount] of Object.entries(amounts)) {
    const cap = caps[id] ?? 0;
    if (!Number.isInteger(amount) || amount < 0 || amount > cap) {
      return { ok: false, message: `Each amount is a whole number from 0 to its limit (${cap}).` };
    }
    total += amount;
  }
  if (total > budget)
    return { ok: false, message: `The amounts add up to ${total}, over ${budget}.` };
  return { ok: true, total };
}

/**
 * The verdict of Turn Undead on one undead after its save. A made save leaves
 * it alone. A failed save turns it, or destroys it when Destroy Undead
 * reaches its CR.
 * @param {boolean} saved
 * @param {number | undefined} cr the creature's CR, absent when unrated
 * @param {number} clericLevel
 * @returns {'unaffected' | 'turned' | 'destroyed'}
 */
export function turnVerdict(saved, cr, clericLevel) {
  if (saved) return 'unaffected';
  const top = destroyUndeadCR(clericLevel);
  return top !== null && cr !== undefined && cr <= top ? 'destroyed' : 'turned';
}

/** @param {Featured} c @returns {import('../types/entities.js').Character} */
function asCharacter(c) {
  return /** @type {import('../types/entities.js').Character} */ (/** @type {unknown} */ (c));
}
