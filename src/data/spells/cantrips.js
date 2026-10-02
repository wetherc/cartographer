/** @typedef {import('../../types/spell.js').Spell} Spell */

/**
 * The built-in cantrips (level 0).
 * @type {Spell[]}
 */
export const CANTRIPS = [
  {
    id: 'fire-bolt',
    name: 'Fire Bolt',
    level: 0,
    school: 'evocation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '120 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'A mote of fire streaks at a target; a hit deals 1d10 fire damage.',
    effect: { kind: 'attack', damage: [{ count: 1, sides: 10, damageType: 'fire' }] },
    scaling: { damagePerLevel: [{ count: 1, sides: 10, damageType: 'fire' }] },
  },
  {
    id: 'produce-flame',
    name: 'Produce Flame',
    level: 0,
    school: 'conjuration',
    classes: ['druid'],
    castingTime: { kind: 'action' },
    range: 'Self',
    components: ['V', 'S'],
    duration: { kind: 'minutes', amount: 10 },
    concentration: false,
    ritual: false,
    description:
      'A flame in your hand hurls at a creature within 30 feet, and a ranged spell attack ' +
      'deals 1d8 fire on a hit. The flame sheds bright light in a 10-foot radius and dim ' +
      'light for 10 feet more until the caster hurls it or the spell ends. The GM rules the ' +
      'light, and a hurl as an action on a later turn is a new cast.',
    effect: { kind: 'attack', damage: [{ count: 1, sides: 8, damageType: 'fire' }] },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'fire' }] },
  },
  {
    id: 'ray-of-frost',
    name: 'Ray of Frost',
    level: 0,
    school: 'evocation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A frigid beam deals 1d8 cold damage on a hit. The target also loses 10 feet of ' +
      "speed until the start of the caster's next turn, which the GM rules.",
    effect: { kind: 'attack', damage: [{ count: 1, sides: 8, damageType: 'cold' }] },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'cold' }] },
  },
  {
    id: 'shocking-grasp',
    name: 'Shocking Grasp',
    level: 0,
    school: 'evocation',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Lightning springs from your hand for 1d8 lightning damage on a hit. The attack has ' +
      'advantage against a target in metal armor, and a target that is hit takes no ' +
      'reactions until the start of its next turn. The GM rules both.',
    effect: { kind: 'attack', damage: [{ count: 1, sides: 8, damageType: 'lightning' }] },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'lightning' }] },
  },
  {
    id: 'eldritch-blast',
    name: 'Eldritch Blast',
    level: 0,
    school: 'evocation',
    classes: ['warlock'],
    castingTime: { kind: 'action' },
    range: '120 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A crackling beam of force deals 1d10 damage. Higher levels fire more beams, and ' +
      'the caster aims each beam at the same creature or at a different one.',
    // One beam at 1st level and one more at each cantrip breakpoint, which is
    // exactly the SRD's beam schedule, so the damage below is per beam.
    effect: {
      kind: 'attack',
      damage: [{ count: 1, sides: 10, damageType: 'force' }],
      projectiles: { count: 1, perStep: 1 },
    },
  },
  {
    id: 'sacred-flame',
    name: 'Sacred Flame',
    level: 0,
    school: 'evocation',
    classes: ['cleric'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'Radiance falls on a target, which must make a DEX save or take 1d8 radiant.',
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [{ count: 1, sides: 8, damageType: 'radiant' }],
      halfOnSave: false,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'radiant' }] },
  },
  {
    id: 'vicious-mockery',
    name: 'Vicious Mockery',
    level: 0,
    school: 'enchantment',
    classes: ['bard'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Stinging words deal 1d4 psychic on a failed WIS save. The target also has ' +
      'disadvantage on its next attack roll before the end of its next turn.',
    effect: {
      kind: 'save',
      saveAbility: 'WIS',
      damage: [{ count: 1, sides: 4, damageType: 'psychic' }],
      halfOnSave: false,
      condition: 'Vicious Mockery',
      until: 'target-end',
      mods: { attacks: 'disadvantage', once: true },
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 4, damageType: 'psychic' }] },
  },
  {
    id: 'acid-splash',
    name: 'Acid Splash',
    level: 0,
    school: 'conjuration',
    classes: ['sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '60 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A bubble of acid deals 1d6 acid to one creature, or to two that stand within ' +
      '5 feet of each other. A DEX save avoids it.',
    targetCount: 2,
    effect: {
      kind: 'save',
      saveAbility: 'DEX',
      damage: [{ count: 1, sides: 6, damageType: 'acid' }],
      halfOnSave: false,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 6, damageType: 'acid' }] },
  },
  {
    id: 'poison-spray',
    name: 'Poison Spray',
    level: 0,
    school: 'conjuration',
    classes: ['druid', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '10 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'A puff of poison deals 1d12 poison on a failed CON save.',
    effect: {
      kind: 'save',
      saveAbility: 'CON',
      damage: [{ count: 1, sides: 12, damageType: 'poison' }],
      halfOnSave: false,
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 12, damageType: 'poison' }] },
  },
  {
    id: 'chill-touch',
    name: 'Chill Touch',
    level: 0,
    school: 'necromancy',
    classes: ['sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '120 feet',
    components: ['V', 'S'],
    duration: { kind: 'rounds', amount: 1 },
    concentration: false,
    ritual: false,
    description:
      'A skeletal hand deals 1d8 necrotic on a hit. The target regains no hit points until ' +
      "the start of the caster's next turn. An undead target also attacks the caster at " +
      "disadvantage until the end of the caster's next turn.",
    effect: {
      kind: 'attack',
      damage: [{ count: 1, sides: 8, damageType: 'necrotic' }],
      onHit: {
        condition: 'Chill Touch',
        until: 'caster-start',
        mods: { noHealing: true },
        typed: {
          types: ['undead'],
          condition: 'Chill Touch (undead)',
          until: 'caster-end',
          mods: { disadvantageVsSource: true },
        },
      },
    },
    scaling: { damagePerLevel: [{ count: 1, sides: 8, damageType: 'necrotic' }] },
  },
  {
    id: 'resistance',
    name: 'Resistance',
    level: 0,
    school: 'abjuration',
    classes: ['cleric', 'druid'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'a miniature cloak', consumed: false },
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description: 'The target adds 1d4 to one saving throw of its choice.',
    targetCount: 1,
    effect: {
      kind: 'buff',
      condition: 'Resistance',
      rider: { rolls: ['save'], dice: 1, die: 'd4', once: true },
    },
  },
  {
    id: 'spare-the-dying',
    name: 'Spare the Dying',
    level: 0,
    school: 'necromancy',
    classes: ['cleric'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A living creature at 0 hit points becomes stable. The spell has no effect on undead ' +
      'or constructs.',
    // A creature dies at 0 HP in the app, so only a dying character can be
    // stabilized.
    effect: {
      kind: 'heal',
      healing: [],
      stabilizes: true,
      typeRules: { skip: ['undead', 'construct'] },
    },
  },
  {
    id: 'guidance',
    name: 'Guidance',
    level: 0,
    school: 'divination',
    classes: ['cleric', 'druid'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S'],
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description: 'The target adds 1d4 to one ability check of its choice.',
    targetCount: 1,
    effect: {
      kind: 'buff',
      condition: 'Guidance',
      rider: { rolls: ['check'], dice: 1, die: 'd4', once: true },
    },
  },
  {
    id: 'mage-hand',
    name: 'Mage Hand',
    level: 0,
    school: 'conjuration',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '30 feet',
    components: ['V', 'S'],
    duration: { kind: 'minutes', amount: 1 },
    concentration: false,
    ritual: false,
    description:
      'A spectral hand appears within range. On each use, an action moves it up to 30 feet ' +
      'and lets it handle an object, open an unlocked door or container, stow or fetch an ' +
      'item, or pour out a vial. It cannot attack, activate a magic item, or carry more than ' +
      '10 pounds, and it vanishes more than 30 feet from the caster or on a new cast.',
    effect: { kind: 'utility' },
  },
  {
    id: 'prestidigitation',
    name: 'Prestidigitation',
    level: 0,
    school: 'transmutation',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '10 feet',
    components: ['V', 'S'],
    duration: { kind: 'hours', amount: 1, upTo: true },
    concentration: false,
    ritual: false,
    description:
      'A minor magical trick: a harmless sensory effect, a candle or small fire lit or put ' +
      'out, a 1-foot cube of material cleaned or soiled, nonliving material chilled, warmed, ' +
      'or flavored, a small mark or symbol for an hour, or a trinket or illusory image that ' +
      'lasts until the end of the next turn. Up to three effects that last can be active.',
    effect: { kind: 'utility' },
  },
  {
    id: 'thaumaturgy',
    name: 'Thaumaturgy',
    level: 0,
    school: 'transmutation',
    classes: ['cleric'],
    castingTime: { kind: 'action' },
    range: '30 feet',
    components: ['V'],
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: false,
    ritual: false,
    description:
      'A minor wonder: a voice three times as loud, flames that flicker or change color, ' +
      'harmless tremors, a sound from a point in range, a door or window thrown open or ' +
      'slammed shut, or eyes that change. Up to three effects that last a minute can be active.',
    effect: { kind: 'utility' },
  },
  {
    id: 'druidcraft',
    name: 'Druidcraft',
    level: 0,
    school: 'transmutation',
    classes: ['druid'],
    castingTime: { kind: 'action' },
    range: '30 feet',
    components: ['V', 'S'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'A small nature effect: a sensory cue that predicts the weather for 24 hours, a flower ' +
      'that blooms or a seed pod that opens, a harmless sensory effect in a 5-foot cube, or a ' +
      'candle, torch, or small campfire lit or put out.',
    effect: { kind: 'utility' },
  },
  {
    id: 'mending',
    name: 'Mending',
    level: 0,
    school: 'transmutation',
    classes: ['bard', 'cleric', 'druid', 'sorcerer', 'wizard'],
    castingTime: { kind: 'minutes', amount: 1 },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'two lodestones', consumed: false },
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'Repair a single break or tear in an object, such as a broken chain link or a torn ' +
      'cloak, no larger than 1 foot in any dimension. A magic item can be physically ' +
      'repaired, but its magic does not return.',
    effect: { kind: 'utility' },
  },
  {
    id: 'message',
    name: 'Message',
    level: 0,
    school: 'transmutation',
    classes: ['bard', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '120 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a short piece of copper wire', consumed: false },
    duration: { kind: 'rounds', amount: 1 },
    concentration: false,
    ritual: false,
    description:
      'Whisper a message to a creature in range, and only it hears. It can reply in a ' +
      'whisper that only the caster hears. The spell passes around corners, and 1 foot of ' +
      'stone, 1 inch of common metal, a thin sheet of lead, or 3 feet of wood blocks it.',
    effect: { kind: 'utility' },
  },
  {
    id: 'minor-illusion',
    name: 'Minor Illusion',
    level: 0,
    school: 'illusion',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '30 feet',
    components: ['S', 'M'],
    materials: { text: 'a bit of fleece', consumed: false },
    duration: { kind: 'minutes', amount: 1 },
    concentration: false,
    ritual: false,
    description:
      'Create a sound or an image of an object no larger than a 5-foot cube. A creature that ' +
      'uses its action to study it sees through it with an Intelligence (Investigation) ' +
      "check against the caster's spell save DC, and physical contact reveals an image. The " +
      'GM rolls the check.',
    effect: { kind: 'utility' },
  },
  {
    id: 'dancing-lights',
    name: 'Dancing Lights',
    level: 0,
    school: 'evocation',
    classes: ['bard', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '120 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a bit of phosphorus or wychwood, or a glowworm', consumed: false },
    duration: { kind: 'minutes', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'Up to four torch-sized lights, or one glowing humanoid form, each shed dim light in a ' +
      '10-foot radius. A bonus action moves the lights up to 60 feet, and a light more than ' +
      '20 feet from another or out of range winks out.',
    effect: { kind: 'utility' },
  },
  {
    id: 'light',
    name: 'Light',
    level: 0,
    school: 'evocation',
    classes: ['bard', 'cleric', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'M'],
    materials: { text: 'a firefly or phosphorescent moss', consumed: false },
    duration: { kind: 'hours', amount: 1 },
    concentration: false,
    ritual: false,
    description: 'An object sheds bright light in a 20-foot radius.',
    effect: { kind: 'utility' },
  },
];
