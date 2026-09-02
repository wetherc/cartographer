/**
 * The application's built-in creatures. The hostile entries are a small set
 * of 5e stock enemies, and the rest are stock townsfolk that a GM can place
 * without typing stats. The effective AC is the stat block's AC plus the
 * armor's bonus, the same rule that effectiveStatBlock uses. Each hostile
 * entry carries the challenge rating of its SRD counterpart. The townsfolk
 * stay unrated, because nothing fights them and the difficulty hint counts
 * hostile creatures only. A hostile entry whose SRD counterpart lists trained
 * skills carries those, and the bonus in each is derived rather than stored.
 * The derived number can sit below the printed one, because a stat block prints
 * the effect of traits this app does not model.
 *
 * A caster entry carries a class, a caster level, and a spellbook of ids
 * from the default spell list. Leveled picks sit in both `known` and
 * `prepared`, the same stamp the creature dialog writes, so the cast paths
 * list them whichever rule the class follows. Slot pools are not stored;
 * they rebuild from the class and the caster level on spawn, so a pool can
 * differ from the SRD print where the class table says otherwise. A spell
 * the catalog lacks is swapped for a near one from the same list, and the
 * swap is noted on the entry.
 *
 * @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate
 */

import { deepFreeze } from '../util/deepFreeze.js';

/** @type {CreatureTemplate[]} */
export const DEFAULT_CREATURES = deepFreeze([
  {
    id: 'goblin',
    name: 'Goblin',
    disposition: 'hostile',
    maxHP: 7,
    stats: { STR: 8, DEX: 14, CON: 10, INT: 10, WIS: 8, CHA: 8, AC: 14 },
    level: 1,
    tier: 'mob',
    cr: 0.25,
    proficiencies: { saves: [], skills: ['stealth'] },
    weapon: {
      name: 'Scimitar',
      kind: 'melee',
      category: 'martial',
      properties: ['finesse', 'light'],
      damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
    },
    armor: { name: 'Leather Armor', acBonus: 1 },
  },
  {
    id: 'wolf',
    name: 'Wolf',
    disposition: 'hostile',
    maxHP: 11,
    stats: { STR: 12, DEX: 15, CON: 12, INT: 3, WIS: 12, CHA: 6, AC: 13 },
    level: 1,
    tier: 'mob',
    cr: 0.25,
    proficiencies: { saves: [], skills: ['perception', 'stealth'] },
    // A natural weapon: no category, because it is neither simple nor
    // martial.
    weapon: {
      name: 'Bite',
      kind: 'melee',
      damage: [{ count: 2, sides: 4, damageType: 'piercing' }],
    },
    armor: null,
  },
  {
    id: 'bandit',
    name: 'Bandit',
    disposition: 'hostile',
    maxHP: 11,
    stats: { STR: 11, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10, AC: 11 },
    level: 1,
    tier: 'mob',
    cr: 0.125,
    weapon: {
      name: 'Shortsword',
      kind: 'melee',
      category: 'martial',
      properties: ['finesse', 'light'],
      damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
    },
    armor: { name: 'Leather Armor', acBonus: 1 },
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    disposition: 'hostile',
    maxHP: 13,
    stats: { STR: 10, DEX: 14, CON: 15, INT: 6, WIS: 8, CHA: 5, AC: 12 },
    level: 1,
    tier: 'mob',
    cr: 0.25,
    weapon: {
      name: 'Shortsword',
      kind: 'melee',
      category: 'martial',
      properties: ['finesse', 'light'],
      damage: [{ count: 1, sides: 6, damageType: 'piercing' }],
    },
    armor: { name: 'Armor Scraps', acBonus: 1 },
  },
  {
    id: 'orc',
    name: 'Orc',
    disposition: 'hostile',
    maxHP: 15,
    stats: { STR: 16, DEX: 12, CON: 16, INT: 7, WIS: 11, CHA: 10, AC: 11 },
    level: 2,
    tier: 'mob',
    cr: 0.5,
    proficiencies: { saves: [], skills: ['intimidation'] },
    weapon: {
      name: 'Greataxe',
      kind: 'melee',
      category: 'martial',
      properties: ['heavy', 'two-handed'],
      damage: [{ count: 1, sides: 12, damageType: 'slashing' }],
    },
    armor: { name: 'Hide', acBonus: 2 },
  },
  {
    id: 'ogre',
    name: 'Ogre',
    disposition: 'hostile',
    maxHP: 59,
    stats: { STR: 19, DEX: 8, CON: 16, INT: 5, WIS: 7, CHA: 7, AC: 9 },
    level: 4,
    tier: 'legend',
    cr: 2,
    weapon: {
      name: 'Greatclub',
      kind: 'melee',
      category: 'simple',
      properties: ['two-handed'],
      damage: [{ count: 2, sides: 8, damageType: 'bludgeoning' }],
    },
    armor: { name: 'Hide', acBonus: 2 },
  },
  {
    id: 'acolyte',
    name: 'Acolyte',
    disposition: 'hostile',
    maxHP: 9,
    stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 14, CHA: 11, AC: 10 },
    level: 1,
    tier: 'mob',
    cr: 0.25,
    proficiencies: { saves: [], skills: ['medicine', 'religion'] },
    class: 'cleric',
    casterLevel: 1,
    // Bless stands in for sanctuary, which the catalog lacks.
    spellbook: {
      cantrips: ['sacred-flame', 'guidance', 'light'],
      known: ['bless', 'cure-wounds'],
      prepared: ['bless', 'cure-wounds'],
    },
    weapon: {
      name: 'Club',
      kind: 'melee',
      category: 'simple',
      properties: ['light'],
      damage: [{ count: 1, sides: 4, damageType: 'bludgeoning' }],
    },
    armor: null,
  },
  {
    id: 'cult-fanatic',
    name: 'Cult Fanatic',
    disposition: 'hostile',
    maxHP: 33,
    stats: { STR: 11, DEX: 14, CON: 12, INT: 10, WIS: 13, CHA: 14, AC: 12 },
    level: 4,
    tier: 'legend',
    cr: 2,
    proficiencies: { saves: [], skills: ['deception', 'persuasion', 'religion'] },
    class: 'cleric',
    casterLevel: 4,
    // Bane, healing word, and hold person stand in for command, inflict
    // wounds, and spiritual weapon, which the catalog lacks.
    spellbook: {
      cantrips: ['sacred-flame'],
      known: ['bane', 'healing-word', 'hold-person'],
      prepared: ['bane', 'healing-word', 'hold-person'],
    },
    weapon: {
      name: 'Dagger',
      kind: 'melee',
      category: 'simple',
      properties: ['finesse', 'light'],
      damage: [{ count: 1, sides: 4, damageType: 'piercing' }],
    },
    armor: { name: 'Leather Armor', acBonus: 1 },
  },
  {
    id: 'mage',
    name: 'Mage',
    disposition: 'hostile',
    maxHP: 40,
    stats: { STR: 9, DEX: 14, CON: 11, INT: 17, WIS: 12, CHA: 11, AC: 12 },
    level: 9,
    tier: 'legend',
    cr: 6,
    proficiencies: { saves: ['INT', 'WIS'], skills: ['arcana', 'history'] },
    class: 'wizard',
    casterLevel: 9,
    // This spell list is a house choice for the app, not the SRD Mage list.
    // It keeps to spells the corpus models with a full effect.
    spellbook: {
      cantrips: ['fire-bolt', 'light', 'shocking-grasp'],
      known: [
        'mage-armor',
        'magic-missile',
        'scorching-ray',
        'hold-person',
        'counterspell',
        'fireball',
        'lightning-bolt',
        'ice-storm',
        'cone-of-cold',
      ],
      prepared: [
        'mage-armor',
        'magic-missile',
        'scorching-ray',
        'hold-person',
        'counterspell',
        'fireball',
        'lightning-bolt',
        'ice-storm',
        'cone-of-cold',
      ],
    },
    weapon: {
      name: 'Dagger',
      kind: 'melee',
      category: 'simple',
      properties: ['finesse', 'light'],
      damage: [{ count: 1, sides: 4, damageType: 'piercing' }],
    },
    armor: null,
  },
  {
    id: 'innkeeper',
    name: 'Innkeeper',
    disposition: 'friendly',
    role: 'Innkeeper',
    notes: 'Keeps the local inn and hears every rumor worth a mug of ale.',
    maxHP: 4,
    stats: { STR: 10, DEX: 10, CON: 11, INT: 10, WIS: 11, CHA: 12, AC: 10 },
    weapon: null,
    armor: null,
  },
  {
    id: 'town-guard',
    name: 'Town Guard',
    disposition: 'neutral',
    role: 'Guard',
    notes: 'Watches the gate and asks pointed questions after dark.',
    maxHP: 4,
    stats: { STR: 13, DEX: 11, CON: 12, INT: 10, WIS: 10, CHA: 10, AC: 10 },
    weapon: null,
    armor: null,
  },
  {
    id: 'traveling-merchant',
    name: 'Traveling Merchant',
    disposition: 'friendly',
    role: 'Merchant',
    notes: "Buys and sells oddities; prices drift with the buyer's desperation.",
    maxHP: 4,
    stats: { STR: 9, DEX: 10, CON: 10, INT: 12, WIS: 11, CHA: 13, AC: 10 },
    weapon: null,
    armor: null,
  },
  {
    id: 'village-elder',
    name: 'Village Elder',
    disposition: 'friendly',
    role: 'Elder',
    notes: "Holds the settlement's history and the favors owed within it.",
    maxHP: 4,
    stats: { STR: 8, DEX: 8, CON: 10, INT: 12, WIS: 14, CHA: 11, AC: 9 },
    weapon: null,
    armor: null,
  },
  {
    id: 'cult-initiate',
    name: 'Cult Initiate',
    disposition: 'hostile',
    role: 'Cultist',
    notes: 'Serves a hidden master and carries a sign of the order.',
    // HP and AC follow the SRD Cultist, so 25 XP buys a foe of the rated worth.
    maxHP: 9,
    cr: 0.125,
    proficiencies: { saves: [], skills: ['deception', 'religion'] },
    stats: { STR: 11, DEX: 12, CON: 10, INT: 10, WIS: 8, CHA: 11, AC: 12 },
    weapon: null,
    armor: null,
  },
]);
