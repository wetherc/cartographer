/** @typedef {import('../types/entities.js').Character} Character */
/** @typedef {import('../types/entities.js').Purse} Purse */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */

/**
 * The five 5e coins, from the most valuable to the least, with the value of
 * each in copper pieces.
 * @type {readonly { key: keyof Purse, label: string, cp: number }[]}
 */
export const COINS = Object.freeze([
  { key: 'pp', label: 'Platinum (pp)', cp: 1000 },
  { key: 'gp', label: 'Gold (gp)', cp: 100 },
  { key: 'ep', label: 'Electrum (ep)', cp: 50 },
  { key: 'sp', label: 'Silver (sp)', cp: 10 },
  { key: 'cp', label: 'Copper (cp)', cp: 1 },
]);

/** @returns {Purse} */
export const emptyPurse = () => ({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });

/** A whole count of zero or more, from any value a save can hold. @param {unknown} v */
const coinCount = (v) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * A purse from any value a save can hold. A missing coin, a negative count,
 * or text reads as 0, and a fraction rounds down.
 * @param {unknown} raw
 * @returns {Purse}
 */
export function coercePurse(raw) {
  const source = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const purse = emptyPurse();
  for (const { key } of COINS) purse[key] = coinCount(source[key]);
  return purse;
}

/**
 * The purse of a character. A character with no purse has no coins.
 * @param {Character} character
 * @returns {Purse}
 */
export const purseOf = (character) => character.purse ?? emptyPurse();

/**
 * Whether an inventory item is the gold stack of a save made before coins
 * had their own purse: the item with id `gold`, or a gear item named
 * "Gold (gp)".
 * @param {InventoryItem} item
 */
const isGoldStack = (item) =>
  item.id === 'gold' || /^gold \(gp\)$/i.test(String(item.name ?? '').trim());

/**
 * Move a gold stack of the inventory into the gold pieces of the purse.
 * A load runs this, so the coins of an older save appear in the purse and
 * leave the item list. A character with no such stack keeps its inventory
 * array.
 * @template {{ inventory: InventoryItem[], purse?: unknown }} T
 * @param {T} character
 * @returns {T & { purse: Purse }}
 */
export function migrateGoldStack(character) {
  const purse = coercePurse(character.purse);
  const stacks = character.inventory.filter(isGoldStack);
  if (stacks.length === 0) return { ...character, purse };
  for (const stack of stacks) purse.gp += coinCount(stack.quantity);
  return { ...character, purse, inventory: character.inventory.filter((i) => !isGoldStack(i)) };
}

/**
 * Add coins to a character's purse. A count of zero or less, or a coin
 * that is not one of the five, changes nothing. With nothing to add, the
 * same character comes back.
 * @param {Character} character
 * @param {Partial<Record<keyof Purse, number>>} coins
 * @returns {Character}
 */
export function addCoins(character, coins) {
  const purse = { ...purseOf(character) };
  let changed = false;
  for (const { key } of COINS) {
    const n = coinCount(coins[key]);
    if (n === 0) continue;
    purse[key] += n;
    changed = true;
  }
  return changed ? { ...character, purse } : character;
}

/**
 * Add gold pieces to a character's purse. A quest reward and a share of
 * fight loot pay through this.
 * @param {Character} character
 * @param {number} gp
 * @returns {Character}
 */
export const addGold = (character, gp) => addCoins(character, { gp });

/**
 * Replace the purse of a character, for the coin fields of the inventory.
 * @param {Character} character
 * @param {unknown} purse
 * @returns {Character}
 */
export function setPurse(character, purse) {
  const next = coercePurse(purse);
  const now = purseOf(character);
  return COINS.every(({ key }) => next[key] === now[key])
    ? character
    : { ...character, purse: next };
}

/**
 * The purse as short text, "12 gp, 5 sp", most valuable coin first, or
 * "No coins" for an empty purse.
 * @param {Purse} purse
 * @returns {string}
 */
export function formatPurse(purse) {
  const parts = COINS.filter(({ key }) => purse[key] > 0).map(({ key }) => `${purse[key]} ${key}`);
  return parts.length ? parts.join(', ') : 'No coins';
}
