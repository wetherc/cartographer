import { createCreature, defaultEnemyGear } from '../entities/Creature.js';
import { enemyArmor } from '../entities/EquipmentPresets.js';
import { defaultEnemyStats } from '../entities/Modifiers.js';
import {
  ACOLYTE,
  BANDIT,
  BANDIT_CAPTAIN,
  BUGBEAR,
  CULTIST,
  DAGGER,
  DIRE_WOLF,
  DROWNED,
  GOBLIN,
  GOBLIN_BOSS,
  GREEN_HAG,
  HARPY,
  HOUSE_GUARD,
  KNOCKER,
  OSTRAND,
  SCORPION,
  SKELETON,
  WIGHT,
  WINTER_WOLF,
  WOLF,
  WRAITH,
  WYVERN,
  ZOMBIE,
  trained,
} from './ExampleStatBlocks.js';
import { people } from './ExamplePeople.js';

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('../types/creature.js').CreatureTemplate} CreatureTemplate */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */
/** @typedef {import('../types/entities.js').EnemyWeapon} EnemyWeapon */
/** @typedef {import('./ExampleWorld.js').Place} Place */

/**
 * The options that a creature adds to its stats: gear, training, damage
 * defenses, and GM notes. Anything left out takes the default of
 * `createCreature`, and the gear takes the level and tier default.
 * @typedef {Omit<Parameters<typeof createCreature>[2], 'stats' | 'location'>} Kit
 */

/**
 * The gear of a beast or a monster: one natural melee attack and no armor.
 * Its stat block AC is its natural armor.
 * @param {string} name @param {number} count @param {number} sides
 * @param {string} damageType
 * @param {EnemyWeapon['properties']} [properties] a finesse bite rolls with DEX
 * @returns {{ weapon: EnemyWeapon, armor: null }}
 */
const natural = (name, count, sides, damageType, properties) => ({
  weapon: {
    name,
    kind: 'melee',
    category: null,
    ...(properties ? { properties } : {}),
    damage: [{ count, sides, damageType }],
  },
  armor: null,
});

/** @param {string[]} immune @param {string[]} [resist] @param {string[]} [vulnerable] */
const guards = (immune, resist = [], vulnerable = []) => ({
  defenses: { resist, vulnerable, immune },
});

const SCIMITAR = {
  name: 'Scimitar',
  kind: /** @type {'melee'} */ ('melee'),
  category: /** @type {'martial'} */ ('martial'),
  properties: /** @type {EnemyWeapon['properties']} */ (['finesse', 'light']),
  damage: [{ count: 1, sides: 6, damageType: 'slashing' }],
};

// The Brute trait of a bugbear adds one die to each melee hit, so the
// morningstar rolls 2d8 where a person rolls 1d8.
const BRUTE_MORNINGSTAR = {
  name: 'Morningstar',
  kind: /** @type {'melee'} */ ('melee'),
  category: /** @type {'martial'} */ ('martial'),
  damage: [{ count: 2, sides: 8, damageType: 'piercing' }],
};

// The gear, training, and defenses of each kind of creature, shared by the
// placed creatures and the bestiary.
// Leather Armor and a shield give a goblin AC 15.
const SNEAK = {
  weapon: SCIMITAR,
  armor: enemyArmor('Leather Armor'),
  ...trained([], ['stealth']),
};
// A wolf has Pack Tactics, and its bite knocks a target that fails a DC 11
// Strength save prone.
const BITE = natural('Bite', 2, 4, 'piercing', ['finesse']);
const PACK = {
  creatureType: /** @type {const} */ ('beast'),
  weapon: { ...BITE.weapon, onHitSave: { ability: 'STR', dc: 11, condition: 'Prone' } },
  armor: null,
  packTactics: true,
  ...trained([], ['perception', 'stealth']),
};
// A dire wolf bites for 2d6, and its bite knocks a target that fails a DC 13
// Strength save prone.
const DIRE_PACK = {
  ...PACK,
  weapon: {
    ...natural('Bite', 2, 6, 'piercing').weapon,
    onHitSave: { ability: 'STR', dc: 13, condition: 'Prone' },
  },
};
// A Thornhold guard fights with a longsword in Chain Mail, which gives AC 16.
const HOUSE = {
  weapon: {
    name: 'Longsword',
    kind: /** @type {'melee'} */ ('melee'),
    category: /** @type {'martial'} */ ('martial'),
    damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
  },
  multiattack: 2,
  armor: enemyArmor('Chain Mail'),
  ...trained([], ['athletics', 'perception']),
};
const UNDEAD = {
  creatureType: /** @type {const} */ ('undead'),
  conditionImmunities: ['Poisoned'],
};
const SKELETAL = { ...UNDEAD, ...guards(['poison'], [], ['bludgeoning']) };
const ROTTING = {
  ...UNDEAD,
  ...natural('Slam', 1, 6, 'bludgeoning'),
  ...guards(['poison']),
  ...trained(['WIS'], []),
};
const DROWNING = {
  ...UNDEAD,
  ...natural('Slam', 1, 6, 'bludgeoning'),
  ...guards(['poison'], ['cold']),
};
const HARPY_KIT = {
  creatureType: /** @type {const} */ ('monstrosity'),
  ...natural('Claws', 2, 4, 'slashing'),
};
const SCORPION_KIT = {
  creatureType: /** @type {const} */ ('beast'),
  ...natural('Claw', 1, 8, 'bludgeoning'),
};
const WINTER_KIT = {
  creatureType: /** @type {const} */ ('monstrosity'),
  ...natural('Bite', 2, 6, 'piercing'),
  ...guards(['cold']),
  ...trained([], ['perception', 'stealth']),
};
const CULTIST_KIT = trained([], ['deception', 'religion']);

/**
 * A placed enemy. It combines default ability scores for the level and tier
 * with the stat block extras (AC, and DEX for armored foes) a GM needs at the
 * table. Every enemy carries a challenge rating, which is what the
 * difficulty hint adds up.
 * @param {EnemyTier} tier
 */
const foe =
  (tier) =>
  /**
   * @param {string} id @param {string} name @param {number} hp
   * @param {number} level @param {number} cr @param {Place} place
   * @param {Record<string, number>} extras @param {Kit} [kit]
   * @returns {Creature}
   */
  (id, name, hp, level, cr, place, extras, kit = {}) =>
    createCreature(id, name, {
      disposition: 'hostile',
      maxHP: hp,
      stats: { ...defaultEnemyStats(level, tier), ...extras },
      location: place,
      level,
      tier,
      cr,
      creatureType: 'humanoid',
      ...kit,
    });

/** An enemy of the rank and file, the common case. */
const mob = foe('mob');
/** An enemy above the rank and file: a named boss or a lieutenant. */
const legend = foe('legend');

/**
 * A reusable bestiary blueprint for the campaign's common enemies. The gear
 * is the level and tier default with the kit over it, stored explicitly,
 * because the merged template format has no absent-means-default rule.
 * Every template is a mob with a challenge rating, so a creature spawned
 * from one counts in the difficulty hint.
 * @param {string} id @param {string} name @param {number} hp
 * @param {number} level @param {number} cr
 * @param {Record<string, number>} extras @param {Partial<CreatureTemplate>} [kit]
 * @returns {CreatureTemplate}
 */
const template = (id, name, hp, level, cr, extras, kit = {}) => ({
  id,
  name,
  disposition: 'hostile',
  maxHP: hp,
  stats: { ...defaultEnemyStats(level, 'mob'), ...extras },
  level,
  tier: /** @type {EnemyTier} */ ('mob'),
  cr,
  creatureType: /** @type {const} */ ('humanoid'),
  ...defaultEnemyGear(level, 'mob'),
  ...kit,
});

// The spells of King Ostrand, a wizard of caster level 8.
const KING_SPELLS = [
  'ray-of-sickness',
  'hold-person',
  'blindness-deafness',
  'vampiric-touch',
  'fear',
  'blight',
];

/**
 * The enemies of the example world, from the wolves on the Vale Road to King
 * Ostrand in his tomb, each on the story place that `at` names.
 * @param {(name: string) => Place} at
 * @returns {Creature[]}
 */
function enemies(at) {
  return [
    // Field enemies on the overworld, one type for each biome.
    mob('goblin-scout', 'Goblin Scout', 7, 1, 0.25, at('goblinScout'), GOBLIN, SNEAK),
    mob('gray-wolf-1', 'Gray Wolf', 11, 1, 0.25, at('wolf1'), WOLF, PACK),
    mob('gray-wolf-2', 'Gray Wolf', 11, 1, 0.25, at('wolf1'), WOLF, PACK),
    mob('gray-wolf-3', 'Gray Wolf', 11, 1, 0.25, at('wolf1'), WOLF, PACK),
    mob('gray-wolf-4', 'Gray Wolf', 11, 1, 0.25, at('wolf1'), WOLF, PACK),
    // Two dire wolves lead the pack, so the six rate Medium for the party.
    mob('dire-wolf-1', 'Dire Wolf', 37, 3, 1, at('wolf1'), DIRE_WOLF, DIRE_PACK),
    mob('dire-wolf-2', 'Dire Wolf', 37, 3, 1, at('wolf1'), DIRE_WOLF, DIRE_PACK),
    mob('bandit-1', 'Roadside Bandit', 11, 1, 0.125, at('bandit1'), BANDIT),
    mob('bandit-2', 'Roadside Bandit', 11, 1, 0.125, at('bandit1'), BANDIT),
    // The captain makes the watchtower band a Medium fight for the party.
    legend('bandit-captain', 'Bandit Captain', 65, 4, 2, at('bandit1'), BANDIT_CAPTAIN, {
      weapon: SCIMITAR,
      multiattack: 2,
      armor: enemyArmor('Studded Leather'),
      ...trained(['STR', 'DEX', 'WIS'], ['athletics', 'deception']),
      notes:
        'Leads the band at the watchtower. A hooded rider paid her to let gray-wax crates pass and to rob every other caravan. She parries once a round (+2 AC against one melee hit) and flees at a quarter of her hit points.',
    }),
    mob('bog-zombie-1', 'Bog Zombie', 22, 2, 0.25, at('bogZombie1'), ZOMBIE, ROTTING),
    mob('bog-zombie-2', 'Bog Zombie', 22, 2, 0.25, at('bogZombie2'), ZOMBIE, ROTTING),
    mob('hill-harpy', 'Harpy', 24, 2, 1, at('harpy'), HARPY, HARPY_KIT),
    mob('giant-scorpion', 'Giant Scorpion', 26, 3, 3, at('scorpion'), SCORPION, SCORPION_KIT),
    mob('winter-wolf', 'Winter Wolf', 34, 3, 3, at('winterWolf'), WINTER_WOLF, WINTER_KIT),
    // The crew of the Gull, Corvin's lost boat, walk the Saltmere docks.
    mob('drowned-watchman-1', 'Drowned Sailor', 22, 2, 0.5, at('drowned1'), DROWNED, {
      ...DROWNING,
      notes: 'Crew of the Gull. Each one still wears a sack of pale Hollowvein silver on its belt.',
    }),
    mob('drowned-watchman-2', 'Drowned Sailor', 22, 2, 0.5, at('drowned2'), DROWNED, DROWNING),
    mob('hollowvein-knocker', 'The Knocker in the Vein', 30, 3, 2, at('knocker'), KNOCKER, {
      creatureType: 'elemental',
      conditionImmunities: ['Poisoned', 'Petrified'],
      ...natural('Claws', 1, 8, 'slashing'),
      ...trained([], ['perception', 'stealth']),
      ...guards([], ['bludgeoning']),
      notes:
        'A spirit that the wardens bound to the silver of the vein. It sleeps while the vein wards are whole. The diggers of the Castellan broke them, and it killed the last shift. It knocks three times before it strikes. A character who reads the sigils in the notes of Tam Hollowell can bind it again with a DC 13 Arcana check instead of a fight.',
    }),
    legend('grelka', 'Grelka the Mire Hag', 45, 4, 3, at('grelka'), GREEN_HAG, {
      creatureType: 'fey',
      ...natural('Claws', 2, 8, 'slashing'),
      ...trained([], ['arcana', 'deception', 'perception', 'stealth']),
      notes:
        'Green hag. Illusory Appearance: she wears the face of a lost village girl until she strikes. Mimicry: she calls for help in the voice of anyone the party has lost. Invisible Passage: she turns invisible at will until she attacks. She wants pale silver for the charms on her eaves, and she trades what she knows for it: a hooded rider from Thornhold buys her sleep charms. She fights only in the bog, stays invisible, uses Mimicry to split the party, and flees at half hit points.',
    }),
    // The Northmarch: the raiders who toppled the wardstone.
    mob('goblin-raider-1', 'Goblin Raider', 7, 1, 0.25, at('raider1'), GOBLIN, SNEAK),
    mob('goblin-raider-2', 'Goblin Raider', 7, 1, 0.25, at('raider2'), GOBLIN, SNEAK),
    // A goblin boss: a Chain Shirt and a shield give AC 17. His Multiattack
    // is two scimitar swings, and the second rolls with disadvantage. Redirect
    // Attack lets him make a goblin beside him the target of an attack.
    legend('snagtooth', 'Chieftain Snagtooth', 21, 3, 1, at('snagtooth'), GOBLIN_BOSS, {
      weapon: SCIMITAR,
      multiattack: 2,
      multiattackDisadvantage: 2,
      redirectAttack: true,
      armor: enemyArmor('Chain Shirt'),
      ...trained([], ['intimidation', 'stealth']),
      notes:
        'Redirect Attack: only another goblin within 5 feet can become the target, and the two swap places. Paid in pale silver ingots stamped with the thorn of House Vane. He never met his patron. A hooded rider brings the orders and the silver to the camp at each new moon. He surrenders at half hit points and trades the orders for his life.',
    }),
    // His camp guard: a bugbear and two goblins. With Snagtooth, the four
    // rate Medium for the level-4 party. Hide and a shield give the
    // bugbear AC 16.
    mob('camp-bugbear', 'Bugbear', 27, 3, 1, at('snagtooth'), BUGBEAR, {
      weapon: BRUTE_MORNINGSTAR,
      surpriseAttack: { count: 2, sides: 6 },
      armor: enemyArmor('Hide'),
      ...trained([], ['stealth', 'survival']),
      notes: 'Snagtooth pays it in silver, and it leaves the camp once he surrenders.',
    }),
    mob('camp-goblin1', 'Goblin Raider', 7, 1, 0.25, at('snagtooth'), GOBLIN, SNEAK),
    mob('camp-goblin2', 'Goblin Raider', 7, 1, 0.25, at('snagtooth'), GOBLIN, SNEAK),
    legend('skalvyr', 'Skalvyr the Wyvern', 68, 5, 6, at('skalvyr'), WYVERN, {
      creatureType: 'dragon',
      multiattack: 2,
      ...natural('Stinger', 2, 6, 'piercing'),
      ...trained([], ['perception']),
      notes:
        'Wyvern. Multiattack: one bite (2d6 + 4 piercing) and one sting. A creature hit by the sting makes a DC 15 CON save and takes 7d6 poison damage on a fail, or half as much on a success. It flies at 80 feet. It wants the hermitage for a nest. It dives from the peak, stings the nearest caster, and climbs out of reach. It flees at a third of its hit points and does not chase below the treeline.',
    }),
    // Thornhold: the shade in the hall, and the Pale-sworn in the dungeons.
    legend('crypt-shade', 'The Crypt Shade', 67, 5, 5, at('shade'), WRAITH, {
      creatureType: 'undead',
      conditionImmunities: [
        'Frightened',
        'Grappled',
        'Paralyzed',
        'Petrified',
        'Poisoned',
        'Prone',
        'Restrained',
      ],
      ...natural('Withering Touch', 4, 8, 'necrotic'),
      ...guards(
        ['necrotic', 'poison'],
        ['acid', 'cold', 'fire', 'lightning', 'thunder'],
        ['radiant'],
      ),
      ...trained([], ['stealth']),
      notes:
        'The shade of Edric Vane, the warden who sealed the barrow. It woke when the pale seal left the crypt, and it attacks anyone who carries House Vane blood or the Vane signet. Once put down, it leaves the crypt ledger open on the high table.',
    }),
    mob('pale-sworn-1', 'Pale-sworn Cultist', 9, 1, 0.125, at('cultist1'), CULTIST, {
      ...CULTIST_KIT,
      weapon: DAGGER,
      role: 'Pale-sworn',
      notes: 'A Thornhold servant who hears the crown through the Castellan. Guards her ledger.',
    }),
    // The Castellan's sworn guards stand with her and turn on the party
    // with her. With them, her unmasking rates Hard for the party.
    ...[1, 2].map((n) =>
      mob(`thornhold-guard-${n}`, 'Thornhold Guard', 32, 3, 1, at('irenne'), HOUSE_GUARD, {
        ...HOUSE,
        disposition: 'neutral',
        role: 'Guard of Thornhold',
        notes:
          'Sworn to the Castellan, not to Lord Aldemar. Set them hostile with her when she is unmasked. They block the stair while she runs.',
      }),
    ),
    mob('pale-sworn-2', 'Pale-sworn Acolyte', 16, 2, 0.25, at('cultist2'), ACOLYTE, {
      ...CULTIST_KIT,
      role: 'Pale-sworn',
      notes:
        'A novice of the crown. After a Parley it talks to save its life. It knows that the Castellan hears the crown in her dreams and wrote the orders under the pale seal, that the seal came out of the crypt upstairs, and that a key from the east was to come to her in the wagons of Dorn. It does not know where the hermit keeps the warding key.',
      class: 'cleric',
      casterLevel: 1,
      spellbook: {
        cantrips: ['sacred-flame', 'guidance'],
        known: ['bane', 'inflict-wounds'],
        prepared: ['bane', 'inflict-wounds'],
      },
    }),
    // The barrow: the pickets, the wight, and King Ostrand at his tomb.
    mob('barrow-skeleton-1', 'Barrow Skeleton', 13, 1, 0.25, at('skeleton1'), SKELETON, SKELETAL),
    mob('barrow-skeleton-2', 'Barrow Skeleton', 13, 1, 0.25, at('skeleton1'), SKELETON, SKELETAL),
    legend('grave-wight', 'Grave Wight', 45, 4, 3, at('wight'), WIGHT, {
      armor: enemyArmor('Studded Leather'),
      creatureType: 'undead',
      conditionImmunities: ['Poisoned'],
      ...guards(['poison'], ['necrotic']),
      ...trained([], ['perception', 'stealth']),
      multiattack: 2,
      notes:
        'Wight. Multiattack: two weapon attacks, and it can swap one for Life Drain. Life Drain: +4 to hit, 1d6 + 2 necrotic damage, and the target makes a DC 13 CON save or its hit point maximum drops by the damage until it finishes a long rest. A humanoid that Life Drain kills rises as a zombie at the next dusk. It guards the second level for the king. It shoots from the dark, then closes to drain the weakest foe. It wants the living for the guard of the king, and it spares one who kneels.',
    }),
    // Plate, the legend default from level 5, gives AC 18.
    legend('ostrand', 'King Ostrand the Risen', 110, 8, 8, at('ostrand'), OSTRAND, {
      multiattack: 3,
      legendaryActions: 2,
      legendaryResistance: 1,
      class: 'wizard',
      casterLevel: 8,
      spellbook: {
        cantrips: ['chill-touch'],
        known: KING_SPELLS,
        prepared: KING_SPELLS,
      },
      ...guards(['poison'], ['necrotic']),
      creatureType: 'undead',
      conditionImmunities: ['Poisoned'],
      ...trained(['STR', 'CON', 'WIS'], ['athletics', 'intimidation', 'perception']),
      notes:
        'While all five wardstones stand, he has disadvantage on attack rolls against a creature that carries the warding key. Legendary actions 2 and legendary resistance 1. When the turn of any other combatant ends, his card shows the row Legendary action (N left), and each weapon button there spends one legendary action on a single swing. Take the swing before you click Next turn. He gets both actions back when his own turn starts. When he fails the save of a spell or of Turn Undead, a dialog offers his one legendary resistance, and Succeed instead turns the failure into a success. The use comes back on a long rest. Crowned in pale Hollowvein silver. He speaks to the Castellan in her dreams, and he knows what the party has said near any wight or skeleton.',
    }),
  ];
}

/**
 * Every creature of the example campaign: the enemies and the people, in one
 * list.
 * @param {(name: string) => Place} at
 * @returns {Creature[]}
 */
export function exampleCreatures(at) {
  return [...enemies(at), ...people(at)];
}

/**
 * The bestiary of the example campaign: a template for each common enemy, so
 * a GM can spawn more of them.
 * @returns {CreatureTemplate[]}
 */
export function exampleBestiary() {
  return [
    template('goblin', 'Goblin', 7, 1, 0.25, GOBLIN, SNEAK),
    template('gray-wolf', 'Gray Wolf', 11, 1, 0.25, WOLF, PACK),
    template('dire-wolf', 'Dire Wolf', 37, 3, 1, DIRE_WOLF, DIRE_PACK),
    template('bandit', 'Bandit', 11, 1, 0.125, BANDIT),
    template('thornhold-guard', 'Thornhold Guard', 32, 3, 1, HOUSE_GUARD, HOUSE),
    template('bog-zombie', 'Bog Zombie', 22, 2, 0.25, ZOMBIE, ROTTING),
    template('harpy', 'Harpy', 24, 2, 1, HARPY, HARPY_KIT),
    template('giant-scorpion', 'Giant Scorpion', 26, 3, 3, SCORPION, SCORPION_KIT),
    template('winter-wolf', 'Winter Wolf', 34, 3, 3, WINTER_WOLF, WINTER_KIT),
    template('barrow-skeleton', 'Barrow Skeleton', 13, 1, 0.25, SKELETON, SKELETAL),
    template('drowned-sailor', 'Drowned Sailor', 22, 2, 0.5, DROWNED, DROWNING),
    template('pale-sworn', 'Pale-sworn Cultist', 9, 1, 0.125, CULTIST, {
      ...CULTIST_KIT,
      weapon: DAGGER,
      role: 'Pale-sworn',
    }),
  ];
}
