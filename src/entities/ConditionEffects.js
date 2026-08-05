/**
 * What a status condition does to a roll. `Conditions.js` owns the pick-list
 * and the list algebra. This module owns the rules: which chips give
 * advantage, which take a turn away, and which make a melee hit a critical
 * one.
 *
 * Every function is pure and reads chip lists only. Nothing here rolls a die
 * or touches a character. The roll sites ask `rollMode` for a mode and pass
 * it to whatever throws the d20.
 */

/** @typedef {import('../types/entities.js').Condition} Condition */
/** @typedef {import('../types/dice.js').RollMode} RollMode */
/** @typedef {'advantage' | 'disadvantage'} Slant */

/**
 * One condition's rules.
 *
 * `attacksAgainst` is what an attacker gains when it swings at the holder. It
 * is a single slant, or a melee and ranged pair when the two differ. Prone is
 * the one condition in the SRD that helps a melee attacker and hurts a ranged
 * one, and invisible is the one that gives its holder the advantage instead of
 * the attacker.
 *
 * `saves` names the abilities whose saving throws the holder rolls at
 * disadvantage. `autoFailSaves` names the abilities that fail with no roll at
 * all, which is what being unable to move does to a Strength or Dexterity
 * save.
 * @typedef {{
 *   attacks?: Slant,
 *   attacksAgainst?: Slant | { melee: Slant, ranged: Slant },
 *   checks?: Slant,
 *   saves?: string[],
 *   autoFailSaves?: string[],
 *   meleeAutoCrit?: boolean,
 *   noActions?: boolean,
 * }} ConditionEffect
 */

/** The abilities a creature that cannot move fails automatically. */
const BODY_SAVES = ['STR', 'DEX'];

/**
 * The rules per condition, keyed by the lowercased name. A chip whose name is
 * not a key here has no mechanical effect, which is how a GM's free-text chip
 * stays legal.
 *
 * Charmed and grappled hold no row. Charmed needs a charmer to point at, and
 * the app models no relationship between two combatants. Grappled sets speed
 * to zero, and no part of the app tracks movement yet. Deafened costs only
 * hearing, which is narrative here. Exhaustion scales by level and belongs
 * with the exhaustion track, not with a flat row.
 * @type {Record<string, ConditionEffect>}
 */
export const CONDITION_EFFECTS = {
  blinded: { attacks: 'disadvantage', attacksAgainst: 'advantage' },
  frightened: { attacks: 'disadvantage', checks: 'disadvantage' },
  incapacitated: { noActions: true },
  invisible: { attacks: 'advantage', attacksAgainst: 'disadvantage' },
  paralyzed: {
    noActions: true,
    attacksAgainst: 'advantage',
    meleeAutoCrit: true,
    autoFailSaves: BODY_SAVES,
  },
  petrified: { noActions: true, attacksAgainst: 'advantage', autoFailSaves: BODY_SAVES },
  poisoned: { attacks: 'disadvantage', checks: 'disadvantage' },
  prone: {
    attacks: 'disadvantage',
    attacksAgainst: { melee: 'advantage', ranged: 'disadvantage' },
  },
  restrained: { attacks: 'disadvantage', attacksAgainst: 'advantage', saves: ['DEX'] },
  stunned: { noActions: true, attacksAgainst: 'advantage', autoFailSaves: BODY_SAVES },
  unconscious: {
    noActions: true,
    attacksAgainst: 'advantage',
    meleeAutoCrit: true,
    autoFailSaves: BODY_SAVES,
  },
};

/**
 * The rules one condition name carries, or null when the name has none.
 * @param {string | undefined | null} name
 * @returns {ConditionEffect | null}
 */
export function conditionEffect(name) {
  if (typeof name !== 'string') return null;
  return CONDITION_EFFECTS[name.trim().toLowerCase()] ?? null;
}

/**
 * Every chip in a list that carries rules, paired with them. A chip the table
 * does not know drops out, so a caller can iterate without checking.
 * @param {Condition[] | undefined | null} conditions
 * @returns {{ condition: Condition, effect: ConditionEffect }[]}
 */
export function effectsOf(conditions) {
  if (!Array.isArray(conditions)) return [];
  /** @type {{ condition: Condition, effect: ConditionEffect }[]} */
  const found = [];
  for (const condition of conditions) {
    const effect = conditionEffect(condition?.name);
    if (effect) found.push({ condition, effect });
  }
  return found;
}

/**
 * Fold a set of slants into one verdict, by the 5e rule: any number of
 * advantages and any number of disadvantages cancel to a normal roll, and
 * otherwise the one kind present wins. Counting instead of pairing makes the
 * order the sources arrive in irrelevant.
 *
 * The result is null rather than `'normal'` when nothing applies. The dice
 * tray keeps a standing advantage toggle and injects it whenever a caller
 * names no mode. A helper that answered `'normal'` would silently cancel that
 * toggle on every roll, so "the game state says nothing" and "the game state
 * says roll straight" have to read differently.
 * @param {(Slant | RollMode | null | undefined)[]} slants
 * @returns {RollMode | null}
 */
export function combineModes(slants) {
  let up = false;
  let down = false;
  for (const slant of slants) {
    if (slant === 'advantage') up = true;
    else if (slant === 'disadvantage') down = true;
  }
  if (up && down) return 'normal';
  if (up) return 'advantage';
  if (down) return 'disadvantage';
  return null;
}

/**
 * An ability key in the spelling the table uses. The sheet sends `STR`, but a
 * cast dialog or a hand-written call can send `str`, and a save rule that
 * missed on case would silently stop applying.
 * @param {string | undefined | null} ability
 * @returns {string}
 */
function abilityKey(ability) {
  return typeof ability === 'string' ? ability.trim().toUpperCase() : '';
}

/**
 * Which slant a condition's `attacksAgainst` gives, once the melee and ranged
 * split is resolved.
 * @param {ConditionEffect} effect
 * @param {boolean} melee
 * @returns {Slant | undefined}
 */
function againstSlant(effect, melee) {
  const against = effect.attacksAgainst;
  if (!against) return undefined;
  if (typeof against === 'string') return against;
  return melee ? against.melee : against.ranged;
}

/**
 * The slants one roll collects from the chips on both sides.
 * @param {{
 *   roller?: Condition[] | null,
 *   target?: Condition[] | null,
 *   kind: 'attack' | 'check' | 'save',
 *   melee?: boolean,
 *   ability?: string,
 * }} query
 * @returns {{ condition: Condition, slant: Slant, from: 'roller' | 'target' }[]}
 */
function slantsFor({ roller, target, kind, melee = true, ability }) {
  const key = abilityKey(ability);
  /** @type {{ condition: Condition, slant: Slant, from: 'roller' | 'target' }[]} */
  const found = [];
  for (const { condition, effect } of effectsOf(roller)) {
    /** @type {Slant | undefined} */
    let slant;
    if (kind === 'attack') slant = effect.attacks;
    else if (kind === 'check') slant = effect.checks;
    else if (key && effect.saves?.includes(key)) slant = 'disadvantage';
    if (slant) found.push({ condition, slant, from: 'roller' });
  }
  // Only an attack reads the other side. A save or a check is rolled against
  // a number, and the creature that set the number does not slant it.
  if (kind !== 'attack') return found;
  for (const { condition, effect } of effectsOf(target)) {
    const slant = againstSlant(effect, melee);
    if (slant) found.push({ condition, slant, from: 'target' });
  }
  return found;
}

/**
 * The mode one roll takes from the game state, or null when the state says
 * nothing and the caller should leave the mode alone.
 *
 * `roller` is the chip list of whoever throws the die and `target` of whoever
 * is being attacked. `melee` decides the prone split and defaults to true,
 * since most attacks are melee and a caller with no weapon in hand is asking
 * about a melee reach. `ability` is the save's ability, which is what
 * restrained needs to know it applies.
 *
 * `extra` takes slants that come from outside the chips, such as the long
 * range of a ranged attack. They fold in before the count, so one advantage
 * chip and one extra disadvantage still cancel to a normal roll.
 * @param {{
 *   roller?: Condition[] | null,
 *   target?: Condition[] | null,
 *   kind: 'attack' | 'check' | 'save',
 *   melee?: boolean,
 *   ability?: string,
 * }} query
 * @param {(Slant | null)[]} [extra]
 * @returns {RollMode | null}
 */
export function rollMode(query, extra = []) {
  return combineModes([...slantsFor(query).map((entry) => entry.slant), ...extra]);
}

/**
 * The chips behind a mode, as a short phrase for a log line, or the empty
 * string when no chip slanted the roll. Each chip states its own slant, so a
 * cancelled roll still explains why it came out straight.
 * @param {Parameters<typeof rollMode>[0]} query
 * @returns {string}
 */
export function modeReasons(query) {
  const slants = slantsFor(query);
  if (slants.length === 0) return '';
  return slants.map((entry) => `${entry.condition.name} ${entry.slant}`).join(', ');
}

/**
 * Whether a creature holding these chips can take a turn. A stunned or
 * unconscious combatant keeps its place in the initiative order and loses the
 * turn itself.
 * @param {Condition[] | undefined | null} conditions
 * @returns {boolean}
 */
export function canAct(conditions) {
  return !effectsOf(conditions).some(({ effect }) => effect.noActions);
}

/**
 * Whether a hit on a creature holding these chips is automatically a critical
 * one. Only a melee hit crits: the printed rule is a hit from within 5 feet,
 * and a melee weapon is as close as the app can measure before map distance
 * exists.
 * @param {Condition[] | undefined | null} conditions
 * @param {{ melee?: boolean }} [options]
 * @returns {boolean}
 */
export function autoCrits(conditions, { melee = true } = {}) {
  if (!melee) return false;
  return effectsOf(conditions).some(({ effect }) => effect.meleeAutoCrit);
}

/**
 * How a creature's chips affect one saving throw: whether it fails with no
 * roll, the chip that decided that, and the mode the roll takes otherwise.
 * The caller checks `autoFail` first, because a failed save never reaches the
 * dice. `extra` takes slants from outside the chips, such as armor the roller
 * is not trained for, and they fold in the same way `rollMode` folds them.
 * @param {Condition[] | undefined | null} conditions
 * @param {string} ability
 * @param {(Slant | null)[]} [extra]
 * @returns {{ autoFail: boolean, failedBy: string | null, mode: RollMode | null }}
 */
export function saveOutcome(conditions, ability, extra = []) {
  const key = abilityKey(ability);
  for (const { condition, effect } of effectsOf(conditions)) {
    if (key && effect.autoFailSaves?.includes(key)) {
      return { autoFail: true, failedBy: condition.name, mode: null };
    }
  }
  return {
    autoFail: false,
    failedBy: null,
    mode: rollMode({ roller: conditions, kind: 'save', ability }, extra),
  };
}
