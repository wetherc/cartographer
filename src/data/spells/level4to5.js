/** @typedef {import('../../types/spell.js').Spell} Spell */

/**
 * The built-in 4th-level and 5th-level spells.
 * @type {Spell[]}
 */
export const LEVEL_4_TO_5 = [
  {
    id: 'ice-storm',
    name: 'Ice Storm',
    level: 4,
    school: 'evocation',
    classes: ['druid', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '300 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a pinch of dust and a few drops of water', consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'Hail deals 2d8 bludgeoning + 4d6 cold; a DEX save halves it.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [
        { count: 2, sides: 8, damageType: 'bludgeoning' },
        { count: 4, sides: 6, damageType: 'cold' },
      ],
      halfOnSave: true,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'bludgeoning' }] },
  },
  {
    id: 'blight',
    name: 'Blight',
    level: 4,
    school: 'necromancy',
    classes: ['druid', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '30 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Life drains from the target for 8d8 necrotic. A CON save halves it. A plant ' +
      'creature saves at disadvantage and takes the maximum damage. The spell has no ' +
      'effect on undead or constructs.',
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [{ count: 8, sides: 8, damageType: 'necrotic' }],
      halfOnSave: true,
      typeRules: { skip: ['undead', 'construct'], disadvantage: ['plant'], maxDamage: ['plant'] },
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'necrotic' }] },
  },
  {
    id: 'greater-invisibility',
    name: 'Greater Invisibility',
    level: 4,
    school: 'illusion',
    classes: ['bard', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S'],
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'The target becomes invisible: it attacks at advantage, and attacks against it are ' +
      'at disadvantage. Unlike Invisibility, the spell does not end when the target ' +
      'attacks or casts.',
    effect: { kind: 'buff', condition: 'Invisible' },
  },
  {
    id: 'stoneskin',
    name: 'Stoneskin',
    level: 4,
    school: 'abjuration',
    classes: ['druid', 'ranger', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'diamond dust worth 100 gp', costGP: 100, consumed: true },
    duration: { kind: 'hours', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      "The target's flesh turns hard as stone, and it resists bludgeoning, piercing, " +
      'and slashing damage from nonmagical weapons.',
    effect: { kind: 'buff', mods: { resistNonmagical: true } },
  },
  {
    id: 'phantasmal-killer',
    name: 'Phantasmal Killer',
    level: 4,
    school: 'illusion',
    classes: ['wizard'],
    castingTime: { kind: 'action' },
    range: '120 feet',
    components: ['V', 'S'],
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'A creature must succeed on a WIS save or be frightened. At the end of each of its ' +
      'turns it repeats the save: a failure deals 4d10 psychic, and a success ends the spell.',
    effect: {
      kind: 'save',
      saveAbility: 'WIS',
      damage: [],
      halfOnSave: false,
      condition: 'Frightened',
      saveEnds: true,
      // Only the damage of the later turns grows with the slot.
      ongoing: {
        damage: [{ count: 4, sides: 10, damageType: 'psychic' }],
        perStep: [{ count: 1, sides: 10, damageType: 'psychic' }],
      },
    },
  },
  // 5th level
  {
    id: 'cone-of-cold',
    name: 'Cone of Cold',
    level: 5,
    school: 'evocation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Self (60-foot cone)',
    components: ['V', 'S', 'M'],
    materials: { text: 'a small crystal or glass cone', consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'A blast of cold deals 8d8 cold; a CON save halves it.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [{ count: 8, sides: 8, damageType: 'cold' }],
      halfOnSave: true,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'cold' }] },
  },
  {
    id: 'greater-restoration',
    name: 'Greater Restoration',
    level: 5,
    school: 'abjuration',
    classes: ['bard', 'cleric', 'druid'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'diamond dust worth 100 gp', costGP: 100, consumed: true },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'End one effect on the target: one level of exhaustion, the charmed or petrified ' +
      'condition, one curse, a reduction to one ability score, or a reduction to its hit ' +
      'point maximum. The app ends a Charmed, Petrified, or Bestow Curse chip, or one ' +
      'level of exhaustion. The GM rules a curse without a chip and the two reductions.',
    effect: {
      kind: 'heal',
      healing: [],
      removesOneOf: ['Exhaustion', 'Charmed', 'Petrified', 'Bestow Curse'],
    },
  },
  {
    id: 'raise-dead',
    name: 'Raise Dead',
    level: 5,
    school: 'necromancy',
    classes: ['bard', 'cleric', 'paladin'],
    castingTime: { kind: 'hours', amount: 1 },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'a diamond worth at least 500 gp', costGP: 500, consumed: true },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Return a creature dead no longer than 10 days to life with 1 hit point. The spell ' +
      'has no effect on a living creature or on undead, and it cannot restore a missing ' +
      'body part or a creature that died of old age. The GM checks the 10 days, and that ' +
      'the soul is free and willing. The spell also neutralizes poisons and nonmagical ' +
      'diseases, and the creature takes a -4 penalty to attack rolls, saving throws, and ' +
      'ability checks, which drops by 1 at each long rest. The GM rules both.',
    // One hit point, as Revivify. The `revives` flag makes the heal reach
    // only a dead target.
    effect: {
      kind: 'heal',
      healing: [{ count: 0, sides: 4, damageType: 'healing', bonus: 1 }],
      revives: true,
      typeRules: { skip: ['undead'] },
    },
  },
  {
    id: 'mass-cure-wounds',
    name: 'Mass Cure Wounds',
    level: 5,
    school: 'evocation',
    classes: ['bard', 'cleric', 'druid'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Up to six creatures each regain 3d8 + your spellcasting modifier hit points. The ' +
      'spell has no effect on undead or constructs.',
    targetCount: 6,
    effect: {
      kind: 'heal',
      healing: [{ count: 3, sides: 8, damageType: 'healing' }],
      addsModifier: true,
      typeRules: { skip: ['undead', 'construct'] },
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'healing' }] },
  },
  {
    id: 'flame-strike',
    name: 'Flame Strike',
    level: 5,
    school: 'evocation',
    classes: ['cleric'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a pinch of sulfur', consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A column of divine fire deals 4d6 fire and 4d6 radiant. A DEX save halves both. ' +
      'The printed spell raises either die pool at a higher slot; this version raises the fire.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [
        { count: 4, sides: 6, damageType: 'fire' },
        { count: 4, sides: 6, damageType: 'radiant' },
      ],
      halfOnSave: true,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 6, damageType: 'fire' }] },
  },
  {
    id: 'hold-monster',
    name: 'Hold Monster',
    level: 5,
    school: 'enchantment',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '90 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a small, straight piece of iron', consumed: false },
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'A creature that is not undead must succeed on a WIS save or be paralyzed, retrying ' +
      'the save at the end of each of its turns.',
    effect: {
      kind: 'save',
      saveAbility: 'WIS',
      damage: [],
      halfOnSave: false,
      condition: 'Paralyzed',
      saveEnds: true,
      typeRules: { skip: ['undead'] },
    },
    scaling: { targetsPerLevel: 1 },
  },
  {
    id: 'destructive-wave',
    name: 'Destructive Wave',
    level: 5,
    school: 'evocation',
    classes: ['paladin'],
    castingTime: { kind: 'action' },
    range: 'Self (30-foot radius)',
    components: ['V'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'The ground pulses for 5d6 thunder and 5d6 radiant, and knocks the target prone. ' +
      'A CON save halves the damage and keeps the target on its feet. The printed spell ' +
      'lets the caster pick radiant or necrotic for the second pool, and this version ' +
      'always deals radiant, so the GM changes the damage type by hand for necrotic.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [
        { count: 5, sides: 6, damageType: 'thunder' },
        { count: 5, sides: 6, damageType: 'radiant' },
      ],
      halfOnSave: true,
      condition: 'Prone',
    },
  },
];
