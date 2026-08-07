/**
 * The built-in feat catalog. Each entry pairs description text with the
 * structured effects the engine can apply: a +1 ability increase, proficiency
 * grants, or a standing roll rider. An effect the engine cannot model stays
 * in the description, and the GM applies it at the table. The schema is
 * identical to a GM-authored or imported feat, so the catalog grows by
 * hand-authoring or JSON import with no code change.
 *
 * @typedef {import('../types/feat.js').Feat} Feat
 */

import { deepFreeze } from '../util/deepFreeze.js';

/** The effect kinds a feat can carry. @type {import('../types/feat.js').FeatEffect['kind'][]} */
export const FEAT_EFFECT_KINDS = ['asi', 'proficiency', 'rider'];

/** @type {Feat[]} */
export const DEFAULT_FEATS = deepFreeze([
  {
    id: 'actor',
    name: 'Actor',
    description:
      'Your Charisma rises by 1. You have advantage on Deception and Performance ' +
      'checks made to pass yourself off as someone else, and you can mimic the ' +
      'speech of a person you have heard.',
    effects: [{ kind: 'asi', abilities: ['CHA'] }],
  },
  {
    id: 'athlete',
    name: 'Athlete',
    description:
      'Your Strength or Dexterity rises by 1. Standing up from prone costs only ' +
      '5 feet of movement, climbing does not slow you, and you make running ' +
      'jumps after only 5 feet on foot.',
    effects: [{ kind: 'asi', abilities: ['STR', 'DEX'] }],
  },
  {
    id: 'durable',
    name: 'Durable',
    description:
      'Your Constitution rises by 1. When you roll a Hit Die to regain hit ' +
      'points, you regain at least twice your Constitution modifier.',
    effects: [{ kind: 'asi', abilities: ['CON'] }],
  },
  {
    id: 'grappler',
    name: 'Grappler',
    prerequisite: 'Strength 13 or higher',
    description:
      'You have advantage on attack rolls against a creature you are grappling, ' +
      'and you can try to pin a grappled creature: both of you are restrained ' +
      'until the grapple ends.',
    effects: [],
  },
  {
    id: 'heavily-armored',
    name: 'Heavily Armored',
    prerequisite: 'Proficiency with medium armor',
    description: 'Your Strength rises by 1, and you gain proficiency with heavy armor.',
    effects: [
      { kind: 'asi', abilities: ['STR'] },
      { kind: 'proficiency', armor: ['heavy'] },
    ],
  },
  {
    id: 'keen-mind',
    name: 'Keen Mind',
    description:
      'Your Intelligence rises by 1. You always know which way is north and how ' +
      'long until the next sunrise or sunset, and you recall anything you saw or ' +
      'heard in the past month.',
    effects: [{ kind: 'asi', abilities: ['INT'] }],
  },
  {
    id: 'lightly-armored',
    name: 'Lightly Armored',
    description:
      'Your Strength or Dexterity rises by 1, and you gain proficiency with light armor.',
    effects: [
      { kind: 'asi', abilities: ['STR', 'DEX'] },
      { kind: 'proficiency', armor: ['light'] },
    ],
  },
  {
    id: 'lucky',
    name: 'Lucky',
    description:
      'You have 3 luck points. Spend one to roll an extra d20 for an attack ' +
      'roll, ability check, or saving throw you or an attacker makes, and choose ' +
      'which d20 counts. You regain spent points on a long rest.',
    effects: [],
  },
  {
    id: 'moderately-armored',
    name: 'Moderately Armored',
    prerequisite: 'Proficiency with light armor',
    description:
      'Your Strength or Dexterity rises by 1, and you gain proficiency with ' +
      'medium armor and shields.',
    effects: [
      { kind: 'asi', abilities: ['STR', 'DEX'] },
      { kind: 'proficiency', armor: ['medium', 'shield'] },
    ],
  },
  {
    id: 'resilient',
    name: 'Resilient',
    description:
      'Choose one ability. That ability rises by 1, and you gain proficiency in ' +
      'saving throws with it.',
    effects: [
      { kind: 'asi', abilities: [] },
      { kind: 'proficiency', saves: { choose: 1, from: [] } },
    ],
  },
  {
    id: 'savage-attacker',
    name: 'Savage Attacker',
    description:
      'Once per turn when you roll damage for a melee weapon attack, you can ' +
      'reroll the damage dice and use either total.',
    effects: [],
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    description:
      'A creature you hit with an opportunity attack drops to 0 feet of speed ' +
      'for the turn. Creatures within your reach provoke opportunity attacks ' +
      'even when they Disengage, and you can strike a creature that attacks a ' +
      'target other than you.',
    effects: [],
  },
  {
    id: 'skill-expert',
    name: 'Skill Expert',
    description:
      'One ability of your choice rises by 1. You gain proficiency in one ' +
      'skill, and expertise in one skill you are proficient in.',
    effects: [
      { kind: 'asi', abilities: [] },
      {
        kind: 'proficiency',
        skills: { choose: 1, from: [] },
        expertise: { choose: 1, from: [] },
      },
    ],
  },
  {
    id: 'skilled',
    name: 'Skilled',
    repeatable: true,
    description: 'You gain proficiency in any three skills of your choice.',
    effects: [{ kind: 'proficiency', skills: { choose: 3, from: [] } }],
  },
  {
    id: 'tough',
    name: 'Tough',
    description:
      'Your hit point maximum rises by 2 for each level you have, and by 2 more ' +
      'at each later level. The app does not apply this: set the maximum by ' +
      'hand on the sheet, which holds it from then on.',
    effects: [],
  },
  {
    id: 'war-caster',
    name: 'War Caster',
    prerequisite: 'The ability to cast at least one spell',
    description:
      'You have advantage on Constitution saving throws to keep concentration ' +
      'on a spell when you take damage. You can cast with weapons or a shield ' +
      'in hand, and cast a single-target spell as an opportunity attack.',
    effects: [],
  },
]);
