/**
 * The shared building blocks of the class catalog: the level curves, the
 * shared feature entries, the multiclass grant builder, the catalog
 * subclasses that have their own fields, and the class skill lists.
 * `classCatalog.js` and `arcaneClasses.js` build the class entries from them.
 */

import { FIGHTING_STYLES } from './fightingStyles.js';

/**
 * Expand a sparse {level: count} breakpoint map into a 20-entry per-level
 * curve (index 0 = level 1), each entry carrying forward until the next
 * breakpoint. Lookups past level 20 read the last entry.
 * @param {Record<number, number>} breakpoints
 * @returns {number[]}
 */
export function curve(breakpoints) {
  const out = [];
  let value = 0;
  for (let level = 1; level <= 20; level++) {
    if (breakpoints[level] !== undefined) value = breakpoints[level];
    out.push(value);
  }
  return out;
}

/** The standard ability-score-improvement levels most classes share. */
export const ASI = [4, 8, 12, 16, 19];

/** The Expertise feature the Bard and the Rogue grant twice each: double
 * proficiency on two skills the character is already proficient in. The
 * empty `from` means any proficient skill; the grant flow narrows the pool. */
export const EXPERTISE = {
  name: 'Expertise',
  effects: [{ kind: /** @type {const} */ ('proficiency'), expertise: { choose: 2, from: [] } }],
};

/** The Fighting Style feature of one class: a pick of one style from the
 * styles that class offers (see data/fightingStyles.js).
 * @param {string} classId */
export const fightingStyleFeature = (classId) => ({
  name: 'Fighting Style',
  effects: [
    {
      kind: /** @type {const} */ ('fightingStyle'),
      from: FIGHTING_STYLES.filter((style) => style.classes.includes(classId)).map((s) => s.id),
    },
  ],
});

/** @param {Partial<import('../types/class.js').MulticlassGrant>} [grant]
 * @returns {import('../types/class.js').MulticlassGrant} */
export function multiclassGrant(grant = {}) {
  return { armor: [], weaponCategories: [], weaponNamed: [], tools: [], ...grant };
}

/** The Fighter subclass that crits more often and adds half proficiency to
 * physical checks. `Features.critRange` reads the two crit features, and
 * `Checks.halfProficiency` reads Remarkable Athlete. */
export const CHAMPION = {
  id: 'champion',
  name: 'Champion',
  features: {
    3: ['Improved Critical'],
    7: ['Remarkable Athlete'],
    15: ['Superior Critical'],
  },
};

/** The Fighter subclass that casts from the wizard list with INT, on the
 * third-caster slot table. */
export const ELDRITCH_KNIGHT = {
  id: 'eldritch-knight',
  name: 'Eldritch Knight',
  casting: {
    casterType: /** @type {const} */ ('third'),
    spellAbility: /** @type {const} */ ('INT'),
    spellListId: 'wizard',
    knownRule: /** @type {const} */ ('known'),
    cantripsKnown: curve({ 3: 2, 10: 3 }),
  },
};

/** The Rogue subclass that casts from the wizard list with INT, on the
 * third-caster slot table. It knows one more cantrip than the Eldritch
 * Knight, because Mage Hand is always one of them. */
export const ARCANE_TRICKSTER = {
  id: 'arcane-trickster',
  name: 'Arcane Trickster',
  casting: {
    casterType: /** @type {const} */ ('third'),
    spellAbility: /** @type {const} */ ('INT'),
    spellListId: 'wizard',
    knownRule: /** @type {const} */ ('known'),
    cantripsKnown: curve({ 3: 3, 10: 4 }),
  },
};

export const RANGER_SKILLS = [
  'animal-handling',
  'athletics',
  'insight',
  'investigation',
  'nature',
  'perception',
  'stealth',
  'survival',
];

export const ROGUE_SKILLS = [
  'acrobatics',
  'athletics',
  'deception',
  'insight',
  'intimidation',
  'investigation',
  'perception',
  'performance',
  'persuasion',
  'sleight-of-hand',
  'stealth',
];
