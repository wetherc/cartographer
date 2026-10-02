import { deepFreeze } from '../util/deepFreeze.js';

/**
 * The 5e SRD fighting styles. `classes` lists the classes whose Fighting
 * Style feature offers the style. `text` is the rule as the sheet shows it.
 * `entities/FightingStyle.js` applies the numbers of Archery, Defense,
 * Dueling, Great Weapon Fighting, and Two-Weapon Fighting. Protection uses a
 * reaction and a position, which the app does not model, so it shows as text
 * only.
 * @type {readonly { id: string, name: string, classes: string[], text: string }[]}
 */
export const FIGHTING_STYLES = deepFreeze([
  {
    id: 'archery',
    name: 'Archery',
    classes: ['fighter', 'ranger'],
    text: '+2 to attack rolls with ranged weapons.',
  },
  {
    id: 'defense',
    name: 'Defense',
    classes: ['fighter', 'paladin', 'ranger'],
    text: '+1 AC while wearing armor.',
  },
  {
    id: 'dueling',
    name: 'Dueling',
    classes: ['fighter', 'paladin', 'ranger'],
    text: '+2 damage with a melee weapon held in one hand, with no other weapon.',
  },
  {
    id: 'great-weapon',
    name: 'Great Weapon Fighting',
    classes: ['fighter', 'paladin'],
    text: 'Reroll a 1 or 2 on a damage die of a melee weapon held in two hands.',
  },
  {
    id: 'protection',
    name: 'Protection',
    classes: ['fighter', 'paladin'],
    text: 'With a shield, use a reaction to impose disadvantage on an attack against an ally within 5 feet.',
  },
  {
    id: 'two-weapon',
    name: 'Two-Weapon Fighting',
    classes: ['fighter', 'ranger'],
    text: 'Add the ability modifier to the damage of the off-hand attack.',
  },
]);

/**
 * @param {string} id
 * @returns {{ id: string, name: string, classes: string[], text: string } | undefined}
 */
export function fightingStyle(id) {
  return FIGHTING_STYLES.find((style) => style.id === id);
}
