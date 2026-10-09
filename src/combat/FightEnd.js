import { buildCombatView, fightOutcome } from './CombatView.js';
import { crXP } from '../data/challenge.js';
import { isDead } from '../entities/DeathSaves.js';

/** @typedef {import('./CombatView.js').ResolvedCombatant} ResolvedCombatant */
/** @typedef {import('../types/combat.js').CombatState} CombatState */

/**
 * A hostile creature still up when the fight ends, with the points it is
 * worth if the GM counts it as overcome.
 * @typedef {{ id: string, name: string, xp: number }} StandingFoe
 */

/**
 * @typedef {{
 *   outcome: 'victory' | 'defeat' | null,
 *   standing: number,
 *   standingFoes: StandingFoe[],
 *   xp: number,
 *   earners: string[],
 *   share: number,
 *   loot: LootPick[],
 * }} FightEnd
 */

/**
 * One piece of gear that a defeated foe drops: the option value of the loot
 * list, its caption, and the inventory item it becomes.
 * @typedef {{ value: string, label: string, item: Omit<InventoryItem, 'id'> }} LootPick
 */
/** @typedef {import('../types/entities.js').InventoryItem} InventoryItem */
/** @typedef {import('../types/creature.js').Creature} Creature */

/**
 * The weapon and the armor of a defeated foe, as inventory items. A natural
 * weapon, such as a bite, has no category and drops nothing.
 * @param {Creature} foe
 * @returns {Omit<InventoryItem, 'id'>[]}
 */
export function foeGear(foe) {
  /** @type {Omit<InventoryItem, 'id'>[]} */
  const gear = [];
  const w = foe.weapon;
  if (w && w.category) {
    gear.push({
      name: w.name,
      quantity: 1,
      notes: '',
      type: w.kind === 'ranged' && !w.properties?.includes('thrown') ? 'bow' : 'weapon',
      kind: w.kind,
      category: w.category,
      damage: w.damage.map((p) => ({ ...p })),
      ...(w.properties?.length ? { properties: [...w.properties] } : {}),
      ...(w.range ? { range: { ...w.range } } : {}),
      ...(w.versatileDamage?.length
        ? { versatileDamage: w.versatileDamage.map((p) => ({ ...p })) }
        : {}),
      ...(w.magical ? { magical: true } : {}),
    });
  }
  const a = foe.armor;
  if (a) {
    gear.push({
      name: a.name,
      quantity: 1,
      notes: '',
      type: 'armor',
      armorWeight: a.armorWeight,
      baseAC: a.baseAC,
    });
  }
  return gear;
}

/**
 * What the End combat control needs to know about a fight: its outcome, the
 * hostile creatures that still stand, and the experience points that the
 * defeated ones are worth. The points go to the characters in the order who
 * are still alive, a dying one included, split evenly and rounded down. A
 * foe with no challenge rating is worth nothing. `labels` gives the display
 * names of the standing foes, as in `buildCombatView`.
 * @param {CombatState} combat
 * @param {(id: string) => ResolvedCombatant | null} resolve
 * @param {ReadonlyMap<string, string>} [labels]
 * @returns {FightEnd}
 */
export function fightEnd(combat, resolve, labels) {
  const view = buildCombatView(combat, resolve, { gm: true, labels });
  const foes = view.rows.filter((row) => row.side === 'foe' && row.counted);
  let xp = 0;
  /** @type {StandingFoe[]} */
  const standingFoes = [];
  /** @type {LootPick[]} */
  const loot = [];
  for (const row of foes) {
    const found = resolve(row.id);
    if (found?.kind !== 'creature') continue;
    const worth = crXP(found.entity.cr ?? -1);
    if (row.defeated) {
      xp += worth;
      for (const item of foeGear(found.entity)) {
        const from = row.name ?? found.entity.name;
        loot.push({ value: `loot-${loot.length}`, label: `${item.name} (${from})`, item });
      }
    } else standingFoes.push({ id: row.id, name: row.name ?? found.entity.name, xp: worth });
  }
  const earners = view.rows.flatMap((row) => {
    const found = resolve(row.id);
    return found?.kind === 'character' && !isDead(found.entity) ? [row.id] : [];
  });
  return {
    outcome: fightOutcome(view),
    standing: foes.filter((row) => !row.defeated).length,
    standingFoes,
    xp,
    earners,
    share: xpSplit(xp, earners.length).share,
    loot,
  };
}

/**
 * Split a total of experience points evenly among `count` characters. Each
 * gets the rounded-down share, and `remainder` is what the split leaves
 * over. With no characters, nobody gets a share and the whole total is left
 * over.
 * @param {number} total
 * @param {number} count
 * @returns {{ share: number, remainder: number }}
 */
export function xpSplit(total, count) {
  const whole = Math.max(0, Math.floor(total));
  if (count <= 0) return { share: 0, remainder: whole };
  const share = Math.floor(whole / count);
  return { share, remainder: whole - share * count };
}

/**
 * The words that explain a split: "250 XP split 4 ways, 2 XP left over".
 * The left-over part appears only when the split leaves some.
 * @param {number} total
 * @param {number} count
 * @returns {string}
 */
export function splitCaption(total, count) {
  const { remainder } = xpSplit(total, count);
  const ways = `${count} ${count === 1 ? 'way' : 'ways'}`;
  const left = remainder > 0 ? `, ${remainder} XP left over` : '';
  return `${Math.max(0, Math.floor(total))} XP split ${ways}${left}`;
}

/**
 * What an award of `amount` XP gives each of `count` characters. In `each`
 * mode every character gets the amount. In `total` mode the amount is split,
 * rounded down. The caption restates the result for the award dialog.
 * @param {'each' | 'total'} mode
 * @param {number} amount
 * @param {number} count
 * @returns {{ each: number, caption: string }}
 */
export function partyAward(mode, amount, count) {
  const whole = Math.max(0, Math.floor(amount));
  const who = `${count} ${count === 1 ? 'character' : 'characters'}`;
  if (mode === 'each') {
    return { each: whole, caption: `XP per character (${who}, ${whole * count} XP in all)` };
  }
  const { share } = xpSplit(whole, count);
  return { each: share, caption: `Total XP (${splitCaption(whole, count)}, ${share} each)` };
}

/**
 * What became of a foe still standing when the fight ends. A foe that still
 * fights stays hostile. A foe that surrendered or was captured turns neutral,
 * so a captive starts no new encounter each time the party steps onto its
 * tile. A foe that fled leaves the campaign, and Undo brings it back.
 * @typedef {'hostile' | 'surrendered' | 'fled'} FoeFate
 */

/** The choices of the fate select, in the order the dialog lists them. */
export const FOE_FATES = /** @type {{ value: FoeFate, label: string }[]} */ ([
  { value: 'hostile', label: 'Still hostile' },
  { value: 'surrendered', label: 'Surrendered or captured' },
  { value: 'fled', label: 'Fled (remove from the campaign)' },
]);

/**
 * Whether a foe with this fate counts as overcome. In 5e a foe that
 * surrenders, flees, or is captured is worth its experience points.
 * @param {string} fate
 * @returns {boolean}
 */
export function fateEarnsXP(fate) {
  return fate === 'surrendered' || fate === 'fled';
}

/**
 * Sort the standing foes by the fate the GM picked for each one.
 * @param {StandingFoe[]} foes
 * @param {(id: string) => string} fateOf the picked fate of one foe
 * @returns {{ surrendered: Set<string>, fled: StandingFoe[], xp: number }} the
 *   ids that turn neutral, the foes that leave, and the XP of both
 */
export function sortFates(foes, fateOf) {
  const surrendered = new Set(foes.filter((f) => fateOf(f.id) === 'surrendered').map((f) => f.id));
  const fled = foes.filter((f) => fateOf(f.id) === 'fled');
  const xp = foes.reduce((sum, f) => sum + (fateEarnsXP(fateOf(f.id)) ? f.xp : 0), 0);
  return { surrendered, fled, xp };
}
