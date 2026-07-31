import { createCharacter, withHP } from '../entities/Character.js';
import { assembleProficiencies } from '../entities/Proficiencies.js';
import { withProficiencies } from '../entities/Progression.js';
import { classMaxHP, withHitDice } from '../entities/HitDice.js';
import { withSpellSlots } from '../entities/SpellSlots.js';
import { createEncounter } from '../entities/Encounter.js';
import { createClock } from '../time/GameClock.js';
import { createNPC } from '../entities/NPC.js';
import { defaultEnemyStats } from '../entities/Modifiers.js';
import { buildingTile } from './ExampleWorld.js';

/** @typedef {import('../map/TilePalette.js').TilePalette} TilePalette */
/** @typedef {import('../types/entities.js').EnemyTier} EnemyTier */
/** @typedef {import('./ExampleWorld.js').ExampleWorld} ExampleWorld */

/**
 * A placed enemy: tiered default ability scores for its level, plus the
 * stat-block extras (AC, Speed...) a GM would want at the table.
 * @param {string} id @param {string} name @param {number} hp
 * @param {number} level @param {EnemyTier} tier
 * @param {string} nodeId @param {string} tileId
 * @param {Record<string, number>} extras
 */
const enemy = (id, name, hp, level, tier, nodeId, tileId, extras) =>
  createEncounter(
    id,
    name,
    hp,
    { ...defaultEnemyStats(level, tier), ...extras },
    { nodeId, tileId },
    { level, tier },
  );

/**
 * A reusable bestiary blueprint for the campaign's rank-and-file enemies.
 * @param {string} id @param {string} name @param {number} hp
 * @param {number} level @param {EnemyTier} tier
 * @param {Record<string, number>} extras
 * @returns {import('../types/entities.js').EncounterTemplate}
 */
const template = (id, name, hp, level, tier, extras) => ({
  id,
  name,
  maxHP: hp,
  statBlock: { ...defaultEnemyStats(level, tier), ...extras },
  level,
  tier,
});

/**
 * The example party: a front-line knight and a half-elf cleric, both level 3,
 * with enough kit to demo inventory, equipment slots, and spell-slot tracking.
 * @returns {import('../types/entities.js').Character[]}
 */
function exampleParty() {
  let aldric = createCharacter('aldric', 'Ser Aldric', { STR: 16, DEX: 12, CON: 14 }, 'Human');
  aldric = {
    ...aldric,
    level: 3,
    raceId: 'human',
    background: 'soldier',
    classes: [{ classId: 'fighter', level: 3, subclass: 'Champion' }],
  };
  aldric = withHitDice(withHP(aldric, classMaxHP(aldric) ?? 0));
  aldric = withProficiencies(
    aldric,
    assembleProficiencies(aldric, { skills: ['athletics', 'intimidation'] }),
  );
  aldric.inventory = [
    {
      id: 'longsword',
      name: 'Longsword',
      quantity: 1,
      notes: '',
      type: 'weapon',
      handling: 'melee',
      damage: [{ count: 1, sides: 8, damageType: 'slashing' }],
    },
    {
      id: 'ember-blade',
      name: 'Ember Blade',
      quantity: 1,
      notes: '',
      type: 'weapon',
      handling: 'melee',
      description: 'A greatsword with a smoldering edge.',
      damage: [
        { count: 2, sides: 6, damageType: 'slashing' },
        { count: 1, sides: 4, damageType: 'fire' },
      ],
      statusEffects: ['burning'],
    },
    { id: 'oak-shield', name: 'Oak Shield', quantity: 1, notes: '', type: 'shield' },
    {
      id: 'chain-mail',
      name: 'Chain Mail',
      quantity: 1,
      notes: '',
      type: 'armor',
      armorWeight: 'heavy',
      baseAC: 16,
    },
    { id: 'steel-helm', name: 'Steel Helm', quantity: 1, notes: '', type: 'helmet', acBonus: 1 },
    {
      id: 'ring-of-vigor',
      name: 'Ring of Vigor',
      quantity: 1,
      notes: '',
      type: 'ring',
      statBonuses: { STR: 2 },
    },
    {
      id: 'healing-potion',
      name: 'Potion of Healing',
      quantity: 2,
      notes: 'Restores 2d4+2 HP.',
      type: 'consumable',
    },
    { id: 'torch', name: 'Torch', quantity: 5, notes: '', type: 'gear' },
  ];
  aldric.equipment = {
    helmet: 'steel-helm',
    chest: 'chain-mail',
    gloves: null,
    greaves: null,
    mainHand: 'longsword',
    offHand: 'oak-shield',
    ranged: null,
    accessory: 'ring-of-vigor',
    accessory2: null,
  };

  let mirelle = createCharacter('mirelle', 'Mirelle', { WIS: 16, CHA: 13, CON: 12 }, 'Half-elf');
  mirelle = {
    ...mirelle,
    level: 3,
    raceId: 'half-elf',
    background: 'acolyte',
    classes: [{ classId: 'cleric', level: 3, subclass: 'Life Domain' }],
  };
  mirelle = withHitDice(withSpellSlots(withHP(mirelle, classMaxHP(mirelle) ?? 0)));
  mirelle = withProficiencies(
    mirelle,
    assembleProficiencies(mirelle, { skills: ['insight', 'religion'] }),
  );
  // A ready-made Cleric spellbook so the sheet's spell section and combat Cast
  // buttons have something to show in the example campaign.
  mirelle.spellbook = {
    cantrips: ['sacred-flame', 'guidance', 'light'],
    known: ['cure-wounds', 'healing-word', 'guiding-bolt', 'hold-person'],
    prepared: ['cure-wounds', 'guiding-bolt', 'hold-person'],
  };
  mirelle.inventory = [
    {
      id: 'mace',
      name: 'Mace',
      quantity: 1,
      notes: '',
      type: 'weapon',
      handling: 'melee',
      damage: [{ count: 1, sides: 6, damageType: 'bludgeoning' }],
    },
    { id: 'holy-symbol', name: 'Symbol of the Dawn', quantity: 1, notes: '', type: 'gear' },
    {
      id: 'healing-herbs',
      name: 'Healing Herbs',
      quantity: 3,
      notes: 'Poultice; stabilizes a downed ally.',
      type: 'consumable',
    },
  ];
  mirelle.equipment = {
    helmet: null,
    chest: null,
    gloves: null,
    greaves: null,
    mainHand: 'mace',
    offHand: null,
    ranged: null,
    accessory: null,
    accessory2: null,
  };

  return [aldric, mirelle];
}

/**
 * Everything that populates the example world: the party, placed enemies,
 * the quest chain, the NPCs of Briarwick, Saltmere, and Thornhold, handouts,
 * and the bestiary. Takes the
 * built maps so NPCs and bosses land on the staged story tiles (generated
 * layouts are random per load). The maps themselves come from
 * ExampleWorld.js; Campaigns.js assembles the two halves.
 * @param {TilePalette} palette
 * @param {ExampleWorld} world
 * @returns {Omit<import('./Campaigns.js').Campaign, 'grid'>}
 */
export function buildExampleContent(palette, world) {
  const { gens, spots } = world;
  const {
    campTile,
    raiderTiles,
    eyrieTile,
    hermitTile,
    tombTile,
    wightTile,
    boneTiles,
    shadeTile,
    lordTile,
  } = spots;
  return {
    party: { nodeId: 'world', tileId: '16,16' },
    characters: exampleParty(),
    encounters: [
      // Field enemies on the overworld, one flavor per biome.
      enemy('goblin-scout', 'Goblin Scout', 7, 1, 'mob', 'world', '18,15', { AC: 13, Speed: 30 }),
      enemy('gray-wolf-1', 'Gray Wolf', 11, 1, 'mob', 'world', '24,16', { AC: 13, Speed: 40 }),
      enemy('gray-wolf-2', 'Gray Wolf', 11, 1, 'mob', 'world', '25,17', { AC: 13, Speed: 40 }),
      enemy('bandit-1', 'Roadside Bandit', 11, 1, 'mob', 'world', '11,18', { AC: 12, Speed: 30 }),
      enemy('bandit-2', 'Roadside Bandit', 11, 1, 'mob', 'world', '13,20', { AC: 12, Speed: 30 }),
      enemy('bog-zombie-1', 'Bog Zombie', 22, 2, 'mob', 'world', '16,28', { AC: 8, Speed: 20 }),
      enemy('bog-zombie-2', 'Bog Zombie', 22, 2, 'mob', 'world', '19,29', { AC: 8, Speed: 20 }),
      enemy('hill-harpy', 'Harpy', 24, 2, 'mob', 'world', '23,12', { AC: 11, Speed: 20 }),
      enemy('giant-scorpion', 'Giant Scorpion', 26, 3, 'mob', 'world', '27,29', {
        AC: 15,
        Speed: 40,
      }),
      enemy('winter-wolf', 'Winter Wolf', 34, 3, 'mob', 'world', '26,3', { AC: 13, Speed: 50 }),
      // The bay: drowned dead walking the shallows below Saltmere, and the
      // thing knocking in the abandoned silver mine.
      enemy('drowned-watchman-1', 'Drowned Watchman', 22, 2, 'mob', 'world', '6,10', {
        AC: 11,
        Speed: 20,
        Swim: 30,
      }),
      enemy('drowned-watchman-2', 'Drowned Watchman', 22, 2, 'mob', 'world', '7,14', {
        AC: 11,
        Speed: 20,
        Swim: 30,
      }),
      enemy('hollowvein-knocker', 'The Knocker in the Vein', 30, 3, 'mob', 'world', '21,11', {
        AC: 14,
        Speed: 30,
      }),
      // Minor bosses: the mire hag in the southern marsh, the goblin chieftain
      // at his camp, and the wyvern over the hermitage.
      enemy('grelka', 'Grelka the Mire Hag', 45, 4, 'legend', 'world', '20,29', {
        AC: 15,
        Speed: 30,
      }),
      enemy('goblin-raider-1', 'Goblin Raider', 7, 1, 'mob', 'northmarch', raiderTiles[0], {
        AC: 13,
        Speed: 30,
      }),
      enemy('goblin-raider-2', 'Goblin Raider', 7, 1, 'mob', 'northmarch', raiderTiles[1], {
        AC: 13,
        Speed: 30,
      }),
      enemy('snagtooth', 'Chieftain Snagtooth', 36, 3, 'legend', 'northmarch', campTile, {
        AC: 16,
        Speed: 30,
      }),
      enemy('skalvyr', 'Skalvyr the Wyvern', 68, 5, 'legend', 'graypeak', eyrieTile, {
        AC: 16,
        Speed: 20,
        Fly: 80,
      }),
      // The barrow: pickets, the seneschal, and the major boss at the tomb.
      enemy('barrow-skeleton-1', 'Barrow Skeleton', 13, 1, 'mob', 'barrow', boneTiles[0], {
        AC: 13,
        Speed: 30,
      }),
      enemy('barrow-skeleton-2', 'Barrow Skeleton', 13, 1, 'mob', 'barrow', boneTiles[1], {
        AC: 13,
        Speed: 30,
      }),
      enemy('grave-wight', 'Grave Wight', 45, 4, 'legend', 'barrow', wightTile, {
        AC: 14,
        Speed: 30,
      }),
      // Thornhold: the shade of the warden who sealed the barrow, risen in
      // the keep's own hall now that the ward is failing.
      enemy('crypt-shade', 'The Crypt Shade', 40, 4, 'legend', 'thornhold', shadeTile, {
        AC: 14,
        Speed: 30,
      }),
      enemy('ostrand', 'King Ostrand the Risen', 110, 8, 'legend', 'barrow', tombTile, {
        AC: 18,
        Speed: 30,
      }),
    ],
    travelog: [],
    quests: [
      {
        id: 'rumors-at-the-waystation',
        title: 'Rumors at the Waystation',
        notes:
          "Dorn's caravan is stuck at the crossroads until the roads are safe. Ask Bram at the Waystation inn in Briarwick what has the north country spooked.",
        status: 'active',
      },
      {
        id: 'wolves-on-the-highway',
        title: 'Wolves on the Highway',
        notes:
          'A wolf pack has been running down travelers on the east highway below the Graypeak foothills. Drive it off so the caravans can move again.',
        status: 'active',
      },
      {
        id: 'the-goblin-raids',
        title: 'The Goblin Raids',
        notes:
          'Goblins out of the Northmarch have burned two farms. Find their camp in the deep forest and deal with Chieftain Snagtooth — then search the camp. The raids are far too organized for goblins.',
        status: 'active',
      },
      {
        id: 'the-pale-seal',
        title: "The Pale King's Seal",
        notes:
          "Snagtooth's orders bear a pale crown pressed into gray wax. Bring them to Reeve Maera in Briarwick; she keeps the shire records of the barrow and the king inside it.",
        status: 'active',
      },
      {
        id: 'the-hermit-of-graypeak',
        title: 'The Hermit of Graypeak',
        notes:
          "Odo the hermit keeps the warding key that seals the barrow's door. He hasn't come down for supplies since the wyvern Skalvyr nested above his hermitage.",
        status: 'active',
      },
      {
        id: 'the-mire-hags-bargain',
        title: "The Mire Hag's Bargain (optional)",
        notes:
          "Grelka the mire hag brews a grave-ward that turns a wight's chill. She trades fair, but never for coin — she names her price when asked, and it is always strange.",
        status: 'active',
      },
      {
        id: 'dead-water',
        title: 'Dead Water',
        notes:
          "Drowned sailors are walking the shallows of Saltmere's bay, and the fishing fleet won't put out. Harbormaster Petra pays by the head — and wants to know why the dead are coming up-current, from the river's mouth.",
        status: 'active',
      },
      {
        id: 'the-lord-of-thornhold',
        title: 'The Lord of Thornhold',
        notes:
          "House Vane swore the ward that sealed the barrow, and Lord Aldemar calls the raids peasant panic. Bring him Snagtooth's sealed orders as proof; the crypt ledger of Thornhold records how the sealing was done, and something in his own hall does not want it read.",
        status: 'active',
      },
      {
        id: 'the-hollowvein-knocking',
        title: 'The Hollowvein Knocking (optional)',
        notes:
          'The Hollowvein — the mine whose silver crowned Ostrand — was abandoned mid-shift when something in the dark began knocking back. Sella needs Hollowvein silver if the warding key is ever to be reforged.',
        status: 'active',
      },
      {
        id: 'the-wardstone-circle',
        title: 'The Wardstone Circle (optional)',
        notes:
          'One of the five wardstones in the northern forest lies toppled, and the ward on the barrow fails with it. Raising the fallen stone will not hold Ostrand — but it will thin his court, and his reach past the barrow door with it.',
        status: 'active',
      },
      {
        id: 'the-barrow-king',
        title: 'The Barrow of the Old King',
        notes:
          'King Ostrand has risen and his reach is spreading. Take the warding key into the barrow, put down his risen court, and end him at his tomb.',
        status: 'active',
      },
    ],
    clock: createClock(),
    npcs: [
      createNPC('caravan-master-dorn', 'Dorn', {
        role: 'Caravan master, stranded at the crossroads',
        disposition: 'neutral',
        notes:
          'Blunt and impatient. Pays for road news, and points anyone who looks capable at Bram in Briarwick.',
        stats: { STR: 12, CON: 14, CHA: 12 },
        location: { nodeId: 'world', tileId: '15,16' },
      }),
      createNPC('innkeeper-bram', 'Bram', {
        role: 'Innkeeper, the Waystation at Briarwick',
        disposition: 'friendly',
        notes:
          'Knows every road north and gossips freely for a warm meal. First to mention the raids, the open graves, and the hermit Odo.',
        stats: { INT: 12, WIS: 14, CHA: 13 },
        location: { nodeId: 'briarwick', tileId: buildingTile(gens.briarwick, palette, 'inn') },
      }),
      createNPC('reeve-maera', 'Reeve Maera', {
        role: 'Reeve of Briarwick',
        disposition: 'neutral',
        notes:
          "Keeps the shire records. Recognizes the pale crown as King Ostrand's seal — and knows the barrow was warded shut for a reason.",
        stats: { INT: 14, WIS: 15, CHA: 12 },
        location: {
          nodeId: 'briarwick',
          tileId: `${Math.floor(gens.briarwick.width / 2)},${Math.floor(gens.briarwick.height / 2)}`,
        },
      }),
      createNPC('sella-the-smith', 'Sella', {
        role: 'Blacksmith of Briarwick',
        disposition: 'friendly',
        notes:
          'Buys ore, sells and repairs arms. Can reforge the warding key if it comes back from the barrow broken — but only from Hollowvein silver, and the mine stands abandoned.',
        stats: { STR: 15, CON: 14 },
        location: {
          nodeId: 'briarwick',
          tileId: buildingTile(gens.briarwick, palette, 'blacksmith'),
        },
      }),
      createNPC('sister-alwyn', 'Sister Alwyn', {
        role: 'Priestess of the Dawn, Briarwick temple',
        disposition: 'friendly',
        notes:
          'Blesses weapons against the risen dead once the party learns what walks in the barrow. Quietly terrified of the open graves.',
        stats: { INT: 12, WIS: 16, CHA: 14 },
        location: { nodeId: 'briarwick', tileId: buildingTile(gens.briarwick, palette, 'temple') },
      }),
      createNPC('hermit-odo', 'Odo', {
        role: 'Hermit, keeper of the warding key',
        disposition: 'neutral',
        notes:
          "Half-deaf and stubborn. Won't leave the hermitage while Skalvyr circles; hands over the key once the wyvern is dealt with.",
        stats: { CON: 13, INT: 13, WIS: 16 },
        location: { nodeId: 'graypeak', tileId: hermitTile },
      }),
      createNPC('harbormaster-petra', 'Harbormaster Petra', {
        role: 'Harbormaster of Saltmere',
        disposition: 'neutral',
        notes:
          'Runs the port and taxes what Corvin thinks she cannot see. Pays a bounty on the drowned dead and keeps the tide-log that shows they walk up-current from the river mouth.',
        stats: { STR: 12, WIS: 14, CHA: 13 },
        location: {
          nodeId: 'saltmere',
          tileId: `${Math.floor(gens.saltmere.width / 2)},${Math.floor(gens.saltmere.height / 2)}`,
        },
      }),
      createNPC('corvin-the-smuggler', 'Corvin', {
        role: 'Smuggler, working out of the Saltmere taproom',
        disposition: 'neutral',
        notes:
          'Sells anything, including his chart of the coast. Refuses cargo bound near the barrow and will say why for coin: his last crew there came back one man short, and the man came back anyway.',
        stats: { DEX: 15, INT: 13, CHA: 14 },
        location: {
          nodeId: 'saltmere',
          tileId: buildingTile(gens.saltmere, palette, 'tavern'),
        },
      }),
      createNPC('lord-aldemar', 'Lord Aldemar Vane', {
        role: 'Lord of Thornhold, heir to the wardens',
        disposition: 'hostile',
        notes:
          "Proud and in denial: the raids are peasant panic and his house's ward cannot fail. Softens only when shown Snagtooth's orders under the pale seal; opens the crypt ledger once the shade in his hall is put down.",
        stats: { STR: 14, INT: 12, WIS: 13, CHA: 15 },
        location: { nodeId: 'thornhold', tileId: lordTile },
      }),
      createNPC('farmer-hedda', 'Hedda', {
        role: 'Farmer, the big steading on the south road',
        disposition: 'friendly',
        notes:
          'Sells provisions and knows every field hand between Briarwick and the coast. Saw the burned farm the night it went up: the raiders worked in silence, in files, to a drum nobody was beating.',
        stats: { CON: 14, WIS: 13 },
        location: { nodeId: 'world', tileId: '9,20' },
      }),
    ],
    handouts: [
      {
        id: 'waystation-rumor',
        title: 'A Rumor at the Waystation',
        body: '"Goblins, aye — but goblins don\'t march in files, and they don\'t carry writs. Something up in the old barrow has been giving orders." — Bram, over a mug',
        nodeId: 'world',
        revealed: false,
        image: null,
      },
      {
        id: 'snagtooth-orders',
        title: "Snagtooth's Orders",
        body: 'A crumpled writ in a cramped, elegant hand: "Burn the farms. Keep the road watched. Let none reach the mountain hermit before my crown is brought to me." It is sealed with a pale crown pressed into gray wax.',
        nodeId: 'northmarch',
        revealed: false,
        image: null,
      },
      {
        id: 'odos-warning',
        title: "Odo's Warning",
        body: '"The key turns a lock, not a king. Ostrand was buried with his sword, his crown, and his pride — the ward kept folk out, but it kept him in just as well. Break it, go down, and finish what the old rites could not."',
        nodeId: 'graypeak',
        revealed: false,
        image: null,
      },
      {
        id: 'barrow-inscription',
        title: 'Inscription over the Barrow Door',
        body: 'Carved in the old tongue above the lintel: "HERE LIES OSTRAND, KING OF THE MARCHES, WHO WOULD NOT LIE STILL. SEALED IN THE FORTIETH YEAR. PRAY THE WARD OUTLASTS HIS PATIENCE."',
        nodeId: 'barrow',
        revealed: false,
        image: null,
      },
      {
        id: 'legend-of-ostrand',
        title: 'The Legend of King Ostrand',
        body: 'Every fireside in the Marches tells it differently, but the bones agree: a king who beggared his shires building a tomb grander than his keep, crowned in pale silver, sealed in by his own council — and patient.',
        nodeId: null,
        revealed: false,
        image: null,
      },
      {
        id: 'smugglers-chart',
        title: "A Smuggler's Chart",
        body: "Corvin's coast chart, greasy and precise. Every landing on the bay is marked with a price — except one reach of the river mouth, crossed out entirely. Over the barrow inland someone has inked a pale crown and, beneath it: NO CARGO. NOT FOR TRIPLE.",
        nodeId: 'saltmere',
        revealed: false,
        image: null,
      },
      {
        id: 'crypt-ledger',
        title: 'The Crypt Ledger of Thornhold',
        body: 'The sealing, in the first Vane\'s own hand: "Five stones raised and sworn at the circle. A key cut of Hollowvein silver, the same vein that crowned him — like binds like. The door holds while the circle stands and a warden\'s line keeps the key. We do not write where the key is kept. He listens."',
        nodeId: 'thornhold',
        revealed: false,
        image: null,
      },
      {
        id: 'wardens-oath',
        title: "The Wardens' Oath",
        body: 'Cut into the tallest wardstone, worn shallow: "WHILE STONE STANDS AND SILVER SLEEPS, THE KING KEEPS HIS BED. FIVE SWORE. FIVE KEEP." Below, much newer, scratched as if with a knife-point: "four".',
        nodeId: 'world',
        revealed: false,
        image: null,
      },
    ],
    bestiary: [
      template('goblin', 'Goblin', 7, 1, 'mob', { AC: 13, Speed: 30 }),
      template('gray-wolf', 'Gray Wolf', 11, 1, 'mob', { AC: 13, Speed: 40 }),
      template('bandit', 'Bandit', 11, 1, 'mob', { AC: 12, Speed: 30 }),
      template('bog-zombie', 'Bog Zombie', 22, 2, 'mob', { AC: 8, Speed: 20 }),
      template('harpy', 'Harpy', 24, 2, 'mob', { AC: 11, Speed: 20 }),
      template('giant-scorpion', 'Giant Scorpion', 26, 3, 'mob', { AC: 15, Speed: 40 }),
      template('winter-wolf', 'Winter Wolf', 34, 3, 'mob', { AC: 13, Speed: 50 }),
      template('barrow-skeleton', 'Barrow Skeleton', 13, 1, 'mob', { AC: 13, Speed: 30 }),
      template('drowned-watchman', 'Drowned Watchman', 22, 2, 'mob', {
        AC: 11,
        Speed: 20,
        Swim: 30,
      }),
    ],
    splitParty: false,
    combat: null,
  };
}
