/** @typedef {import('../../types/spell.js').Spell} Spell */

/**
 * The built-in 2nd-level spells.
 * @type {Spell[]}
 */
export const LEVEL_2 = [
  {
    id: 'scorching-ray',
    name: 'Scorching Ray',
    level: 2,
    school: 'evocation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '120 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Three rays each deal 2d6 fire on a hit, rolled separately and aimed wherever the caster likes.',
    // 2d6 per ray with its own attack roll. A higher slot adds a ray.
    effect: {
      kind: 'attack',
      damage: [{ count: 2, sides: 6, damageType: 'fire' }],
      projectiles: { count: 3, perStep: 1 },
    },
  },
  {
    id: 'hold-person',
    name: 'Hold Person',
    level: 2,
    school: 'enchantment',
    classes: ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a small, straight piece of iron', consumed: false },
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'A humanoid must succeed on a WIS save or be paralyzed, retrying the save ' +
      'at the end of each of its turns.',
    // One humanoid at 2nd level. Each higher slot adds one more target.
    scaling: { targetsPerLevel: 1 },
    effect: {
      kind: 'save',
      saveAbility: 'WIS',
      damage: [],
      halfOnSave: false,
      condition: 'Paralyzed',
      saveEnds: true,
      typeRules: { only: ['humanoid'] },
    },
  },
  {
    id: 'lesser-restoration',
    name: 'Lesser Restoration',
    level: 2,
    school: 'abjuration',
    classes: ['bard', 'cleric', 'druid', 'paladin', 'ranger'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'End one disease or the blinded, deafened, paralyzed, or poisoned condition. ' +
      'The caster picks the condition when the target has more than one. The app tracks ' +
      'no diseases, so the GM rules a disease.',
    effect: {
      kind: 'heal',
      healing: [],
      removesOneOf: ['Blinded', 'Deafened', 'Paralyzed', 'Poisoned'],
    },
  },
  {
    id: 'blindness-deafness',
    name: 'Blindness/Deafness',
    level: 2,
    school: 'necromancy',
    classes: ['bard', 'cleric', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '30 feet',
    components: ['V'],
    duration: { kind: 'minutes', amount: 1 },
    concentration: false,
    ritual: false,
    description:
      'A creature that fails a CON save is blinded, retrying the save at the end of each ' +
      'of its turns. The printed spell also offers deafness, which has no rule here, ' +
      'so this version always blinds.',
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [],
      halfOnSave: false,
      condition: 'Blinded',
      saveEnds: true,
    },
    scaling: { targetsPerLevel: 1 },
  },
  {
    id: 'shatter',
    name: 'Shatter',
    level: 2,
    school: 'evocation',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a chip of mica', consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A ringing burst deals 3d8 thunder in a 10-foot sphere. A CON save halves it. A ' +
      'creature made of inorganic material such as stone, crystal, or metal saves at ' +
      'disadvantage. The save mode in the cast dialog applies to every target of one ' +
      'cast, so the GM rolls that save by hand when the burst also catches other creatures.',
    targetCount: 0,
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [{ count: 3, sides: 8, damageType: 'thunder' }],
      halfOnSave: true,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'thunder' }] },
  },
  {
    id: 'prayer-of-healing',
    name: 'Prayer of Healing',
    level: 2,
    school: 'evocation',
    classes: ['cleric'],
    castingTime: { kind: 'minutes', amount: 10 },
    range: '30 feet',
    components: ['V'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Up to six creatures each regain 2d8 + your spellcasting modifier hit points. The ' +
      'spell has no effect on undead or constructs.',
    targetCount: 6,
    effect: {
      kind: 'heal',
      healing: [{ count: 2, sides: 8, damageType: 'healing' }],
      addsModifier: true,
      typeRules: { skip: ['undead', 'construct'] },
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'healing' }] },
  },
  {
    id: 'invisibility',
    name: 'Invisibility',
    level: 2,
    school: 'illusion',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'an eyelash encased in gum arabic', consumed: false },
    duration: { kind: 'hours', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'The target becomes invisible: it attacks at advantage, and attacks against it are ' +
      'at disadvantage. The spell ends when the target attacks or casts, which the GM rules.',
    effect: { kind: 'buff', condition: 'Invisible' },
    scaling: { targetsPerLevel: 1 },
  },
  {
    id: 'blur',
    name: 'Blur',
    level: 2,
    school: 'illusion',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Self',
    components: ['V'],
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      "The caster's body blurs, and attack rolls against it have disadvantage. An " +
      'attacker with blindsight or truesight, or one that does not rely on sight, is ' +
      'immune to this, which the GM rules.',
    effect: { kind: 'buff', mods: { attacksAgainst: 'disadvantage' } },
  },
  {
    id: 'acid-arrow',
    name: 'Acid Arrow',
    level: 2,
    school: 'evocation',
    classes: ['wizard'],
    castingTime: { kind: 'action' },
    range: '90 feet',
    components: ['V', 'S', 'M'],
    materials: { text: "powdered rhubarb leaf and an adder's stomach", consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A green arrow makes a ranged spell attack. A hit deals 4d4 acid now and 2d4 acid at ' +
      "the end of the target's next turn. A miss splashes the target for half the first " +
      'damage and nothing later.',
    effect: {
      kind: 'attack',
      damage: [{ count: 4, sides: 4, damageType: 'acid' }],
      halfOnMiss: true,
      ongoing: {
        damage: [{ count: 2, sides: 4, damageType: 'acid' }],
        perStep: [{ count: 1, sides: 4, damageType: 'acid' }],
      },
    },
    // Both the first damage and the later damage gain 1d4 per slot level.
    scaling: { damagePerLevel: [{ count: 1, sides: 4, damageType: 'acid' }] },
  },
  {
    id: 'spiritual-weapon',
    name: 'Spiritual Weapon',
    level: 2,
    school: 'evocation',
    classes: ['cleric'],
    castingTime: { kind: 'bonus' },
    range: '60 feet',
    components: ['V', 'S'],
    duration: { kind: 'minutes', amount: 1 },
    concentration: false,
    ritual: false,
    description:
      'A floating spectral weapon makes a melee spell attack for 1d8 force plus the ' +
      'spellcasting modifier. Each later turn of the minute, a bonus action moves it up to ' +
      '20 feet and attacks again. The weapon is not a creature, and the GM tracks where it is.',
    effect: {
      kind: 'attack',
      damage: [{ count: 1, sides: 8, damageType: 'force' }],
      melee: true,
      addsModifier: true,
    },
    // One more 1d8 for every two slot levels above 2nd.
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'force' }], levelsPerStep: 2 },
    repeat: {},
  },
  {
    id: 'barkskin',
    name: 'Barkskin',
    level: 2,
    school: 'transmutation',
    classes: ['druid', 'ranger'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'a handful of oak bark', consumed: false },
    duration: { kind: 'hours', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      "A willing creature's skin turns rough as bark, and its AC can't be less than 16, " +
      'whatever armor it wears.',
    effect: { kind: 'buff', mods: { acMin: 16 } },
  },
  {
    id: 'aid',
    name: 'Aid',
    level: 2,
    school: 'abjuration',
    classes: ['cleric', 'paladin'],
    castingTime: { kind: 'action' },
    range: '30 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a tiny strip of white cloth', consumed: false },
    duration: { kind: 'hours', amount: 8 },
    concentration: false,
    ritual: false,
    description:
      'Up to three creatures each raise their hit point maximum and current hit points by 5 ' +
      'for the duration, and by 5 more for each slot level above 2nd.',
    targetCount: 3,
    effect: { kind: 'buff', mods: { maxHP: 5 }, modsPerStep: { maxHP: 5 } },
  },
];
