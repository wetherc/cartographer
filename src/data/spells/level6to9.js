/** @typedef {import('../../types/spell.js').Spell} Spell */

/**
 * The built-in spells of 6th level and higher.
 * @type {Spell[]}
 */
export const LEVEL_6_TO_9 = [
  {
    id: 'chain-lightning',
    name: 'Chain Lightning',
    level: 6,
    school: 'evocation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '150 feet',
    components: ['V', 'S', 'M'],
    materials: {
      text: 'three needles, a rod of amber, crystal, or glass, and a piece of fur or hair from each creature',
      consumed: false,
    },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A bolt arcs to up to four targets, each taking 10d8 lightning; a DEX save halves it.',
    // One primary target and three the bolt arcs to, so four at 6th level.
    // Each higher slot adds one more arc.
    targetCount: 4,
    scaling: { targetsPerLevel: 1 },
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [{ count: 10, sides: 8, damageType: 'lightning' }],
      halfOnSave: true,
    },
  },
  {
    id: 'circle-of-death',
    name: 'Circle of Death',
    level: 6,
    school: 'necromancy',
    classes: ['sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '150 feet',
    components: ['V', 'S', 'M'],
    materials: {
      text: 'the powder of a crushed black pearl worth at least 500 gp',
      costGP: 500,
      consumed: false,
    },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A sphere of negative energy deals 8d6 necrotic in a 60-foot radius. A CON save halves it.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [{ count: 8, sides: 6, damageType: 'necrotic' }],
      halfOnSave: true,
    },
    scaling: { damagePerLevel: [{ count: 2, sides: 6, damageType: 'necrotic' }] },
  },
  {
    id: 'disintegrate',
    name: 'Disintegrate',
    level: 6,
    school: 'transmutation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a lodestone and a pinch of dust', consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A thin green ray deals 10d6 + 40 force on a failed DEX save, and nothing on a ' +
      'successful one. A target reduced to 0 hit points crumbles to dust, which the GM ' +
      'rules. A character left as dust returns only through a spell such as True ' +
      'Resurrection or Wish.',
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [{ count: 10, sides: 6, damageType: 'force', bonus: 40 }],
      halfOnSave: false,
    },
    scaling: { damagePerLevel: [{ count: 3, sides: 6, damageType: 'force' }] },
  },
  {
    id: 'freezing-sphere',
    name: 'Freezing Sphere',
    level: 6,
    school: 'evocation',
    classes: ['wizard'],
    castingTime: { kind: 'action' },
    range: '300 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a small crystal sphere', consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'A globe of cold bursts for 10d6 cold in a 60-foot radius. A CON save halves it.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [{ count: 10, sides: 6, damageType: 'cold' }],
      halfOnSave: true,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 6, damageType: 'cold' }] },
  },
  {
    id: 'sunbeam',
    name: 'Sunbeam',
    level: 6,
    school: 'evocation',
    classes: ['druid', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Self (60-foot line)',
    components: ['V', 'S', 'M'],
    materials: { text: 'a magnifying glass', consumed: false },
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    targetCount: 0,
    description:
      'A beam of light fills a line. Each creature in it makes a CON save: 6d8 radiant and ' +
      "blinded until the caster's next turn on a failure, half and not blinded on a " +
      'success. Each later turn, an action makes a new line. Undead and oozes save at ' +
      'disadvantage.',
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [{ count: 6, sides: 8, damageType: 'radiant' }],
      halfOnSave: true,
      condition: 'Blinded',
      until: 'caster-start',
      typeRules: { disadvantage: ['undead', 'ooze'] },
    },
    repeat: {},
  },
  {
    id: 'heal',
    name: 'Heal',
    level: 6,
    school: 'evocation',
    classes: ['cleric', 'druid'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'The target regains 70 hit points, and its blindness, deafness, and diseases end. ' +
      'A flat amount, so no dice roll behind it. The app ends the Blinded and Deafened ' +
      'chips. It tracks no diseases, so the GM rules those. The spell has no effect on ' +
      'undead or constructs.',
    effect: {
      kind: 'heal',
      healing: [{ count: 0, sides: 8, damageType: 'healing', bonus: 70 }],
      removes: ['Blinded', 'Deafened'],
      typeRules: { skip: ['undead', 'construct'] },
    },
    scaling: { damagePerLevel: [{ count: 0, sides: 8, damageType: 'healing', bonus: 10 }] },
  },
  {
    id: 'finger-of-death',
    name: 'Finger of Death',
    level: 7,
    school: 'necromancy',
    classes: ['sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Negative energy deals 7d8+30 necrotic; a CON save halves it. A humanoid killed by ' +
      "the spell rises at the start of the caster's next turn as a zombie that obeys the " +
      'caster, which the GM adds by hand.',
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [{ count: 7, sides: 8, damageType: 'necrotic', bonus: 30 }],
      halfOnSave: true,
    },
  },
  {
    id: 'fire-storm',
    name: 'Fire Storm',
    level: 7,
    school: 'evocation',
    classes: ['cleric', 'druid', 'sorcerer'],
    castingTime: { kind: 'action' },
    range: '150 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'Sheets of roaring flame deal 7d10 fire. A DEX save halves it.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [{ count: 7, sides: 10, damageType: 'fire' }],
      halfOnSave: true,
    },
  },
  {
    id: 'arcane-sword',
    name: 'Arcane Sword',
    level: 7,
    school: 'evocation',
    classes: ['bard', 'wizard'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S', 'M'],
    materials: {
      text: 'a miniature platinum sword with a grip and pommel of copper and zinc, worth 250 gp',
      costGP: 250,
      consumed: false,
    },
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'A sword of force hovers in range and makes a melee spell attack against a target ' +
      'within 5 feet of it for 3d10 force. Each later turn, a bonus action moves it up to ' +
      '20 feet and attacks the same target or a different one. The GM tracks where it is.',
    effect: { kind: 'attack', damage: [{ count: 3, sides: 10, damageType: 'force' }], melee: true },
    repeat: { cost: 'bonus' },
  },
  {
    id: 'power-word-stun',
    name: 'Power Word Stun',
    level: 8,
    school: 'enchantment',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A creature with 150 hit points or fewer is stunned until it succeeds on a ' +
      'CON save at the end of one of its turns.',
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [],
      halfOnSave: false,
      condition: 'Stunned',
      saveEnds: true,
      hpLimit: 150,
    },
  },
  {
    id: 'power-word-kill',
    name: 'Power Word Kill',
    level: 9,
    school: 'enchantment',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A creature with 100 hit points or fewer dies instantly. A creature with more is not ' +
      'affected.',
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [],
      halfOnSave: false,
      hpLimit: 100,
      kills: true,
    },
  },
  {
    id: 'weird',
    name: 'Weird',
    level: 9,
    school: 'illusion',
    classes: ['wizard'],
    castingTime: { kind: 'action' },
    range: '120 feet',
    components: ['V', 'S'],
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      "Each creature of the caster's choice in a 30-foot-radius sphere makes a WIS save or " +
      'is frightened. At the end of each of its turns, a frightened creature repeats the ' +
      'save: a failure deals 4d10 psychic, and a success ends the spell for that creature.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'WIS',
      damage: [],
      halfOnSave: false,
      condition: 'Frightened',
      saveEnds: true,
      ongoing: { damage: [{ count: 4, sides: 10, damageType: 'psychic' }] },
    },
  },
  {
    id: 'sunburst',
    name: 'Sunburst',
    level: 8,
    school: 'evocation',
    classes: ['druid', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '150 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'fire and a piece of sunstone', consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Brilliant sunlight deals 12d6 radiant and blinds for 1 minute. A CON save halves ' +
      'the damage and avoids the blindness. A blinded creature retries the save at the ' +
      'end of each of its turns. The blindness lasts at most 1 minute, and the chip has ' +
      'no round counter, so the GM removes it after 10 rounds. Undead and oozes save at ' +
      'disadvantage.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [{ count: 12, sides: 6, damageType: 'radiant' }],
      halfOnSave: true,
      condition: 'Blinded',
      saveEnds: true,
      typeRules: { disadvantage: ['undead', 'ooze'] },
    },
  },
  {
    id: 'meteor-swarm',
    name: 'Meteor Swarm',
    level: 9,
    school: 'evocation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '1 mile',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'Fiery orbs deal 20d6 fire + 20d6 bludgeoning; a DEX save halves it.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [
        { count: 20, sides: 6, damageType: 'fire' },
        { count: 20, sides: 6, damageType: 'bludgeoning' },
      ],
      halfOnSave: true,
    },
  },
];
