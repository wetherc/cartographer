import { deepFreeze } from '../util/deepFreeze.js';

/**
 * The eldritch invocations of the SRD warlock. `entities/Invocations.js`
 * reads the prerequisites and the effects. An entry with no effect is text
 * only, and the GM applies its description.
 * @type {import('../types/invocation.js').Invocation[]}
 */
export const INVOCATIONS = deepFreeze([
  {
    id: 'agonizing-blast',
    name: 'Agonizing Blast',
    level: 2,
    cantrip: 'eldritch-blast',
    description: 'You add your CHA modifier to the damage of each Eldritch Blast beam that hits.',
    effect: { kind: 'blast', addsModifier: true },
  },
  {
    id: 'armor-of-shadows',
    name: 'Armor of Shadows',
    level: 2,
    description: 'You can cast Mage Armor on yourself at will, with no slot and no material.',
    effect: { kind: 'atWill', spellId: 'mage-armor', self: true, noMaterial: true },
  },
  {
    id: 'ascendant-step',
    name: 'Ascendant Step',
    level: 9,
    description: 'You can cast Levitate on yourself at will, with no slot and no material.',
    effect: { kind: 'atWill', spellId: 'levitate', self: true, noMaterial: true },
  },
  {
    id: 'beast-speech',
    name: 'Beast Speech',
    level: 2,
    description: 'You can cast Speak with Animals at will, with no slot.',
    effect: { kind: 'atWill', spellId: 'speak-with-animals' },
  },
  {
    id: 'beguiling-influence',
    name: 'Beguiling Influence',
    level: 2,
    description: 'You gain proficiency in the Deception and Persuasion skills.',
    effect: { kind: 'skills', skills: ['deception', 'persuasion'] },
  },
  {
    id: 'bewitching-whispers',
    name: 'Bewitching Whispers',
    level: 7,
    description: 'Once per long rest, you can cast Compulsion with a warlock spell slot.',
    effect: { kind: 'oncePerRest', spellId: 'compulsion' },
  },
  {
    id: 'book-of-ancient-secrets',
    name: 'Book of Ancient Secrets',
    level: 2,
    pact: 'tome',
    description:
      'Your Book of Shadows holds two 1st-level ritual spells from any class list. You can cast them as rituals, and you can copy in more ritual spells of up to half your warlock level.',
  },
  {
    id: 'chains-of-carceri',
    name: 'Chains of Carceri',
    level: 15,
    pact: 'chain',
    description:
      'You can cast Hold Monster at will on a celestial, a fiend, or an elemental, with no slot and no material. You cannot target the same creature again until a long rest.',
    effect: { kind: 'atWill', spellId: 'hold-monster', noMaterial: true },
  },
  {
    id: 'devils-sight',
    name: "Devil's Sight",
    level: 2,
    description: 'You see normally in darkness, magical or not, out to 120 feet.',
  },
  {
    id: 'dreadful-word',
    name: 'Dreadful Word',
    level: 7,
    description: 'Once per long rest, you can cast Confusion with a warlock spell slot.',
    effect: { kind: 'oncePerRest', spellId: 'confusion' },
  },
  {
    id: 'eldritch-sight',
    name: 'Eldritch Sight',
    level: 2,
    description: 'You can cast Detect Magic at will, with no slot.',
    effect: { kind: 'atWill', spellId: 'detect-magic' },
  },
  {
    id: 'eldritch-spear',
    name: 'Eldritch Spear',
    level: 2,
    cantrip: 'eldritch-blast',
    description: 'The range of your Eldritch Blast is 300 feet.',
    effect: { kind: 'blast', range: '300 feet' },
  },
  {
    id: 'eyes-of-the-rune-keeper',
    name: 'Eyes of the Rune Keeper',
    level: 2,
    description: 'You can read all writing.',
  },
  {
    id: 'fiendish-vigor',
    name: 'Fiendish Vigor',
    level: 2,
    description:
      'You can cast False Life on yourself at will as a 1st-level spell, with no slot and no material.',
    effect: { kind: 'atWill', spellId: 'false-life', self: true, noMaterial: true },
  },
  {
    id: 'gaze-of-two-minds',
    name: 'Gaze of Two Minds',
    level: 2,
    description:
      'As an action, you touch a willing humanoid and perceive through its senses until the end of your next turn. You can use your action on later turns to keep the link.',
  },
  {
    id: 'lifedrinker',
    name: 'Lifedrinker',
    level: 12,
    pact: 'blade',
    description:
      'Your pact weapon deals extra necrotic damage equal to your CHA modifier (minimum 1) when it hits.',
    effect: { kind: 'pactDamage', damageType: 'necrotic' },
  },
  {
    id: 'mask-of-many-faces',
    name: 'Mask of Many Faces',
    level: 2,
    description: 'You can cast Disguise Self at will, with no slot.',
    effect: { kind: 'atWill', spellId: 'disguise-self' },
  },
  {
    id: 'master-of-myriad-forms',
    name: 'Master of Myriad Forms',
    level: 15,
    description: 'You can cast Alter Self at will, with no slot.',
    effect: { kind: 'atWill', spellId: 'alter-self' },
  },
  {
    id: 'minions-of-chaos',
    name: 'Minions of Chaos',
    level: 9,
    description: 'Once per long rest, you can cast Conjure Elemental with a warlock spell slot.',
    effect: { kind: 'oncePerRest', spellId: 'conjure-elemental' },
  },
  {
    id: 'mire-the-mind',
    name: 'Mire the Mind',
    level: 5,
    description: 'Once per long rest, you can cast Slow with a warlock spell slot.',
    effect: { kind: 'oncePerRest', spellId: 'slow' },
  },
  {
    id: 'misty-visions',
    name: 'Misty Visions',
    level: 2,
    description: 'You can cast Silent Image at will, with no slot and no material.',
    effect: { kind: 'atWill', spellId: 'silent-image', noMaterial: true },
  },
  {
    id: 'one-with-shadows',
    name: 'One with Shadows',
    level: 5,
    description:
      'In dim light or darkness, you can use your action to become invisible until you move or take an action or a reaction.',
  },
  {
    id: 'otherworldly-leap',
    name: 'Otherworldly Leap',
    level: 9,
    description: 'You can cast Jump on yourself at will, with no slot and no material.',
    effect: { kind: 'atWill', spellId: 'jump', self: true, noMaterial: true },
  },
  {
    id: 'repelling-blast',
    name: 'Repelling Blast',
    level: 2,
    cantrip: 'eldritch-blast',
    description:
      'When you hit a creature with Eldritch Blast, you can push the creature up to 10 feet away from you in a straight line.',
    effect: { kind: 'blast', push: 10 },
  },
  {
    id: 'sculptor-of-flesh',
    name: 'Sculptor of Flesh',
    level: 7,
    description: 'Once per long rest, you can cast Polymorph with a warlock spell slot.',
    effect: { kind: 'oncePerRest', spellId: 'polymorph' },
  },
  {
    id: 'sign-of-ill-omen',
    name: 'Sign of Ill Omen',
    level: 5,
    description: 'Once per long rest, you can cast Bestow Curse with a warlock spell slot.',
    effect: { kind: 'oncePerRest', spellId: 'bestow-curse' },
  },
  {
    id: 'thief-of-five-fates',
    name: 'Thief of Five Fates',
    level: 2,
    description: 'Once per long rest, you can cast Bane with a warlock spell slot.',
    effect: { kind: 'oncePerRest', spellId: 'bane' },
  },
  {
    id: 'thirsting-blade',
    name: 'Thirsting Blade',
    level: 5,
    pact: 'blade',
    description: 'You attack twice with your pact weapon when you take the Attack action.',
    effect: { kind: 'pactAttack' },
  },
  {
    id: 'visions-of-distant-realms',
    name: 'Visions of Distant Realms',
    level: 15,
    description: 'You can cast Arcane Eye at will, with no slot.',
    effect: { kind: 'atWill', spellId: 'arcane-eye' },
  },
  {
    id: 'voice-of-the-chain-master',
    name: 'Voice of the Chain Master',
    level: 2,
    pact: 'chain',
    description:
      'You can talk through your familiar and perceive through its senses at any distance on the same plane.',
  },
  {
    id: 'whispers-of-the-grave',
    name: 'Whispers of the Grave',
    level: 9,
    description: 'You can cast Speak with Dead at will, with no slot.',
    effect: { kind: 'atWill', spellId: 'speak-with-dead' },
  },
  {
    id: 'witch-sight',
    name: 'Witch Sight',
    level: 15,
    description:
      'You see the true form of a shapechanger or a creature under an illusion within 30 feet.',
  },
]);

/** The pact boons a warlock picks at 3rd level, in the order the picker lists them. */
export const PACT_BOONS = deepFreeze([
  { id: 'chain', name: 'Pact of the Chain' },
  { id: 'blade', name: 'Pact of the Blade' },
  { id: 'tome', name: 'Pact of the Tome' },
]);
