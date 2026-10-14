/**
 * Built-in spells that move or carry creatures: teleports, flight, climbing,
 * and falling. They are `utility` entries, because no rule in the app moves a
 * token by feet. The GM applies what the description says.
 * @type {import('../../types/spell.js').Spell[]}
 */
export const TRAVEL_SPELLS = [
  {
    id: 'feather-fall',
    name: 'Feather Fall',
    level: 1,
    school: 'transmutation',
    classes: ['bard', 'sorcerer', 'wizard'],
    castingTime: {
      kind: 'reaction',
      trigger: 'which you take when you or a creature within 60 feet of you falls',
    },
    range: '60 feet',
    components: ['V', 'M'],
    materials: { text: 'a small feather or piece of down', consumed: false },
    duration: { kind: 'minutes', amount: 1 },
    concentration: false,
    ritual: false,
    description:
      'Up to five falling creatures fall only 60 feet per round. A creature that lands ' +
      'before the spell ends takes no falling damage and lands on its feet.',
    effect: { kind: 'utility' },
  },
  {
    id: 'longstrider',
    name: 'Longstrider',
    level: 1,
    school: 'transmutation',
    classes: ['bard', 'druid', 'ranger', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'a pinch of dirt', consumed: false },
    duration: { kind: 'hours', amount: 1 },
    concentration: false,
    ritual: false,
    description:
      'The speed of the creature you touch rises by 10 feet. Each slot level above 1st ' +
      'adds one more creature.',
    effect: { kind: 'utility' },
  },
  {
    id: 'misty-step',
    name: 'Misty Step',
    level: 2,
    school: 'conjuration',
    classes: ['sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'bonus' },
    range: 'Self',
    components: ['V'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description: 'You teleport up to 30 feet to an unoccupied space that you can see.',
    effect: { kind: 'utility' },
  },
  {
    id: 'spider-climb',
    name: 'Spider Climb',
    level: 2,
    school: 'transmutation',
    classes: ['sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'a drop of bitumen and a spider', consumed: false },
    duration: { kind: 'hours', amount: 1, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'A willing creature can move up, down, and across vertical surfaces and upside down ' +
      'along ceilings, with its hands free. It gains a climbing speed equal to its walking ' +
      'speed.',
    effect: { kind: 'utility' },
  },
  {
    id: 'fly',
    name: 'Fly',
    level: 3,
    school: 'transmutation',
    classes: ['sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: 'Touch',
    components: ['V', 'S', 'M'],
    materials: { text: 'a wing feather from any bird', consumed: false },
    duration: { kind: 'minutes', amount: 10, upTo: true },
    concentration: true,
    ritual: false,
    description:
      'A willing creature gains a flying speed of 60 feet. When the spell ends, a target ' +
      'still aloft falls unless it can stop the fall. Each slot level above 3rd adds one ' +
      'more creature.',
    effect: { kind: 'utility' },
  },
  {
    id: 'water-breathing',
    name: 'Water Breathing',
    level: 3,
    school: 'transmutation',
    classes: ['druid', 'ranger', 'sorcerer', 'wizard'],
    castingTime: { kind: 'action' },
    range: '30 feet',
    components: ['V', 'S', 'M'],
    materials: { text: 'a short reed or piece of straw', consumed: false },
    duration: { kind: 'hours', amount: 24 },
    concentration: false,
    ritual: true,
    description:
      'Up to ten willing creatures can breathe underwater, and they keep their normal ' +
      'breathing too.',
    effect: { kind: 'utility' },
  },
  {
    id: 'dimension-door',
    name: 'Dimension Door',
    level: 4,
    school: 'conjuration',
    classes: ['bard', 'sorcerer', 'warlock', 'wizard'],
    castingTime: { kind: 'action' },
    range: '500 feet',
    components: ['V'],
    duration: { kind: 'instantaneous' },
    concentration: false,
    ritual: false,
    description:
      'You teleport up to 500 feet to a spot that you can see, picture, or describe by ' +
      'distance and direction. You can bring one willing creature of your size or smaller ' +
      'within 5 feet of you. If you would arrive in an occupied space, you and the creature ' +
      'each take 4d6 force damage and the spell fails.',
    effect: { kind: 'utility' },
  },
];
