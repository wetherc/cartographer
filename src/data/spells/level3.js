/** @typedef {import('../../types/spell.js').Spell} Spell */

/**
 * The built-in 3rd-level spells.
 * @type {Spell[]}
 */
export const LEVEL_3 = [
  {
    id: 'fireball',
    name: 'Fireball',
    level: 3,
    school: 'evocation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '150 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a tiny ball of bat guano and sulfur', consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'A blast of flame deals 8d6 fire in a 20-foot radius; a DEX save halves it.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [{ count: 8, sides: 6, damageType: 'fire' }],
      halfOnSave: true,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 6, damageType: 'fire' }] },
  },
  {
    id: 'lightning-bolt',
    name: 'Lightning Bolt',
    level: 3,
    school: 'evocation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Self (100-foot line)',
    components: ['V', 'S', 'M'],
    materials: { text: 'a bit of fur and a rod of amber, crystal, or glass', consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'A stroke of lightning deals 8d6 lightning; a DEX save halves it.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [{ count: 8, sides: 6, damageType: 'lightning' }],
      halfOnSave: true,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 6, damageType: 'lightning' }] },
  },
  {
    id: 'call-lightning',
    name: 'Call Lightning',
    level: 3,
    school: 'conjuration',
    classes: ['druid'],
    castingTime: { kind: 'action' },
    range: '120 feet',
    components: ['V', 'S'],
    duration: { kind: 'minutes', amount: 10, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'A storm cloud forms above the caster, and a bolt strikes a point under it. Each ' +
      'creature within 5 feet of that point makes a DEX save: 3d10 lightning on a failure, ' +
      'half on a success. Each later turn, an action calls down another bolt. Outdoors in a ' +
      'storm, the spell takes control of that storm and deals 1d10 more, which the GM adds.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [{ count: 3, sides: 10, damageType: 'lightning' }],
      halfOnSave: true,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 10, damageType: 'lightning' }] },
    repeat: {},
  },
  {
    id: 'revivify',
    name: 'Revivify',
    level: 3,
    school: 'necromancy',
    classes: ['cleric', 'paladin'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'diamonds worth 300 gp', costGP: 300, consumed: true },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Return a creature dead no more than a minute to life with 1 hit point. The spell ' +
      'has no effect on a living creature. It cannot restore a creature that died of old ' +
      'age, and the GM checks that the creature died within the last minute.',
    // Exactly one hit point, so a flat amount with no dice behind it. The
    // `revives` flag makes the heal reach only a dead target.
    effect: {
      kind: 'heal',
      healing: [{ count: 0, sides: 4, damageType: 'healing', bonus: 1 }],
      revives: true,
    },
  },
  {
    id: 'counterspell',
    name: 'Counterspell',
    level: 3,
    school: 'abjuration',
    classes: ['sorcerer', 'warlock', 'wizard'],
    castingTime: {
      kind: 'reaction',
      trigger: 'which you take when you see a creature within 60 feet of you casting a spell',
    },
    range: '60 feet',
    components: ['S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Interrupt a creature casting a spell of 3rd level or lower. For a higher-level ' +
      'spell, the caster makes an ability check with its spellcasting ability against ' +
      'DC 10 + the spell level, and a success interrupts it. The GM rolls the check. A ' +
      'higher slot interrupts spells up to its own level with no check.',
    effect: { kind: 'utility' },
  },
  {
    id: 'conjure-animals',
    name: 'Conjure Animals',
    level: 3,
    school: 'conjuration',
    classes: ['druid', 'ranger'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S'],
    duration: { kind: 'hours', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'Summon eight wolves that fight beside the caster while it concentrates on the spell. ' +
      'A 5th-level slot doubles the count, a 7th-level slot triples it, and a 9th-level ' +
      'slot quadruples it. The printed spell offers a choice of beasts, and this version ' +
      'always summons wolves (eight beasts of challenge rating 1/4).',
    // Eight more wolves for every two slot levels above 3rd: 8, 16, 24, 32.
    effect: { kind: 'summons', creature: 'Wolf', count: 8, countPerStep: 8 },
    scaling: { levelsPerStep: 2 },
  },
  {
    id: 'mass-healing-word',
    name: 'Mass Healing Word',
    level: 3,
    school: 'evocation',
    classes: ['cleric'],
    castingTime: { kind: 'bonus' },
    range: '60 feet',
    components: ['V'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Up to six creatures each regain 1d4 + your spellcasting modifier hit points. The ' +
      'spell has no effect on undead or constructs.',
    targetCount: 6,
    effect: {
      kind: 'heal',
      healing: [{ count: 1, sides: 4, damageType: 'healing' }],
      addsModifier: true,
      typeRules: { skip: ['undead', 'construct'] },
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 4, damageType: 'healing' }] },
  },
  {
    id: 'fear',
    name: 'Fear',
    level: 3,
    school: 'illusion',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Self (30-foot cone)',
    components: ['V', 'S', 'M'],
    materials: { text: 'a white feather or the heart of a hen', consumed: false },
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'Each creature in the cone that fails a WIS save is frightened. A frightened ' +
      'creature also drops what it holds and flees, which the GM rules. It retries the ' +
      'save only when it ends its turn out of line of sight of the caster, so the GM rolls ' +
      'that retry and removes the chip on a success.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'WIS',
      damage: [],
      halfOnSave: false,
      condition: 'Frightened',
    },
  },
  {
    id: 'hypnotic-pattern',
    name: 'Hypnotic Pattern',
    level: 3,
    school: 'illusion',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '120 feet',
    components: ['S', 'M'],
    materials: {
      text: 'a glowing stick of incense or a crystal vial filled with phosphorescent material',
      consumed: false,
    },
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'Each creature in a 30-foot cube that sees the pattern makes a WIS save. On a failure ' +
      'it is charmed, and while charmed it is incapacitated with a speed of 0. The effect ' +
      'ends on a creature that takes damage. A creature that another uses an action to shake ' +
      'awake loses its chip when the GM removes it. Creatures immune to being charmed are ' +
      'not affected, and the GM leaves out a creature that cannot see the pattern.',
    targetCount: 0,
    // Charmed has no rules of its own in the app, so the chip is the
    // Incapacitated condition that the spell imposes with it.
    effect: {
      kind: 'save',
      saveAbility: 'WIS',
      damage: [],
      halfOnSave: false,
      condition: 'Incapacitated',
      endsOnDamage: true,
      typeRules: { skipImmuneTo: ['Charmed'] },
    },
  },
  {
    id: 'vampiric-touch',
    name: 'Vampiric Touch',
    level: 3,
    school: 'necromancy',
    classes: ['warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Self',
    components: ['V', 'S'],
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      "The caster's touch makes a melee spell attack for 3d6 necrotic, and the caster regains " +
      'hit points equal to half the necrotic damage dealt. Until the spell ends, the caster ' +
      'can make the attack again on each of its turns as an action.',
    effect: {
      kind: 'attack',
      damage: [{ count: 3, sides: 6, damageType: 'necrotic' }],
      melee: true,
      drain: 'half',
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 6, damageType: 'necrotic' }] },
    repeat: {},
  },
  {
    id: 'protection-from-energy',
    name: 'Protection from Energy',
    level: 3,
    school: 'abjuration',
    classes: ['cleric', 'druid', 'ranger', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S'],
    duration: { kind: 'hours', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'For the duration, the willing creature you touch has resistance to one damage type ' +
      'of your choice: acid, cold, fire, lightning, or thunder.',
    effect: { kind: 'buff', resistChoice: ['acid', 'cold', 'fire', 'lightning', 'thunder'] },
  },
  {
    id: 'haste',
    name: 'Haste',
    level: 3,
    school: 'transmutation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '30 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a shaving of licorice root', consumed: false },
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'A willing creature has its speed doubled, +2 AC, and advantage on DEX saves. On each ' +
      'of its turns it has one extra action, which it can use to Attack (one weapon attack ' +
      "only), Dash, Disengage, Hide, or Use an Object. When the spell ends, the target can't " +
      'move or take actions until after its next turn.',
    effect: { kind: 'buff', mods: { ac: 2, saveAdvantage: ['DEX'], extraAction: true } },
  },
];
