import { createCreature } from '../entities/Creature.js';
import { enemyArmor } from '../entities/EquipmentPresets.js';
import { DAGGER, trained } from './ExampleStatBlocks.js';

/** @typedef {import('../types/creature.js').Creature} Creature */
/** @typedef {import('./ExampleWorld.js').Place} Place */

/**
 * The people of the Marches. The `role` of each one shows to the players, so
 * it names only what the town knows. The secrets live in the GM notes. The
 * party starts with Dorn's caravan, Wren owes Corvin a run, and Aldric
 * served House Vane, so those four are known from the start.
 * @param {(name: string) => Place} at
 * @returns {Creature[]}
 */
export function people(at) {
  return [
    createCreature('caravan-master-dorn', 'Dorn', {
      creatureType: 'humanoid',
      role: 'Caravan master, stranded at the crossroads',
      disposition: 'neutral',
      met: true,
      notes:
        'Blunt and impatient. He came west from the Eastmarch with six crates sealed in gray wax and a fee paid twice over not to open them. They go to "the Castellan, Thornhold". He does not know what is inside, and he does not want to know. He points anyone capable at Bram in Briarwick. He pays each guard 25 gp when the caravan reaches Thornhold, and 25 gp more if crate four arrives with its wax unbroken. He can ride along with the party on the escort: press Travels with party on his NPC card.',
      stats: { STR: 12, CON: 14, CHA: 12 },
      location: at('dorn'),
    }),
    createCreature('innkeeper-bram', 'Bram', {
      creatureType: 'humanoid',
      role: 'Innkeeper, the Waystation at Briarwick',
      disposition: 'friendly',
      notes:
        'Knows every road and gossips freely for a warm meal. First to mention the raids, the open graves, and the hermit Odo. A rider from Thornhold pays him to hold letters for Dorn.',
      stats: { INT: 12, WIS: 14, CHA: 13 },
      location: at('bram'),
    }),
    createCreature('reeve-maera', 'Reeve Maera', {
      creatureType: 'humanoid',
      role: 'Reeve of Briarwick',
      disposition: 'neutral',
      notes:
        'Keeps the shire records. She knows the pale crown as the seal of King Ostrand, and she knows that the seal lies in the Thornhold crypt. Wax this fresh means that someone took it out. The hand of the orders is familiar to her, but she cannot place it (DC 15 Insight to see that she fears to name a Vane). Before the party brings her the orders, she tells the legend of Ostrand, sends them to the open graves at the temple, and asks them to find out who pays the raiders.',
      stats: { INT: 14, WIS: 15, CHA: 12 },
      location: at('maera'),
    }),
    createCreature('sella-the-smith', 'Sella', {
      creatureType: 'humanoid',
      role: 'Blacksmith of Briarwick',
      disposition: 'friendly',
      notes:
        'Buys ore and sells and repairs arms. She can recast a broken warding key, but only from pale silver out of Hollowvein or the lost tithe of the Silver Road. She sold a key mold of the old pattern to a Thornhold rider last spring and regrets it. When she recasts the counter-key for the party, add an item named Warding Key to the inventory of the character who takes it, because the barrow lock opens for that name. If the Castellan or the Pale-sworn bring her the counter-key on day 6, she recasts it under threat.',
      stats: { STR: 15, CON: 14 },
      location: at('sella'),
    }),
    createCreature('sister-alwyn', 'Sister Alwyn', {
      creatureType: 'humanoid',
      role: 'Priestess of the Dawn, Briarwick temple',
      disposition: 'friendly',
      notes:
        'She wrote to the temple for Mirelle. The graves in her yard were opened from the inside, in the same month that the wardstone fell and the pale seal left the Thornhold crypt. The Reeve can confirm the dates from the shire records. She blesses weapons against the risen dead: for one day, a blessed weapon deals radiant damage.',
      stats: { INT: 12, WIS: 16, CHA: 14 },
      location: at('alwyn'),
    }),
    createCreature('farmer-hedda', 'Hedda', {
      creatureType: 'humanoid',
      role: 'Farmer, the big steading on the south road',
      disposition: 'friendly',
      notes:
        'Sells provisions and knows every field hand in the vale. She saw the burned farm the night it went up. The raiders worked in silence, in files, and a hooded rider on a gray horse watched from the road.',
      stats: { CON: 14, WIS: 13 },
      location: at('hedda'),
    }),
    createCreature('hermit-odo', 'Odo', {
      creatureType: 'humanoid',
      role: 'Hermit of Graypeak',
      disposition: 'neutral',
      notes:
        'The last of the warden line that keeps the warding key. Half-deaf and stubborn. He will not come down while Skalvyr hunts over the hermitage, and he gives the key only to someone who swears the oath of the wardens. He knows that a counter-key cut from the same silver can also open the door, but only after a smith recasts it whole with more pale silver. When he gives the key, add an item named Warding Key to the inventory of the character who swears the oath, because the barrow lock opens for that name.',
      stats: { CON: 13, INT: 13, WIS: 16 },
      location: at('odo'),
    }),
    createCreature('harbormaster-petra', 'Harbormaster Petra', {
      creatureType: 'humanoid',
      role: 'Harbormaster of Saltmere',
      disposition: 'neutral',
      notes:
        'Runs the port and taxes what Corvin thinks she cannot see. She pays 10 gp a head for the drowned dead. Her tide log shows that they first walked on the night the Gull sank off the pier head.',
      stats: { STR: 12, WIS: 14, CHA: 13 },
      location: at('petra'),
    }),
    createCreature('corvin-the-smuggler', 'Corvin', {
      creatureType: 'humanoid',
      role: 'Smuggler, the Drowned Lantern in Saltmere',
      disposition: 'neutral',
      met: true,
      notes:
        'Sells anything. A buyer who pays under a pale seal hired him to ship Hollowvein silver east, and the Gull went down with the last load. He calls in the marker of Wren: one run to Thornhold with a sealed box. He wants to know who his buyer is, because the buyer owes him a boat.',
      stats: { DEX: 15, INT: 13, CHA: 14 },
      location: at('corvin'),
    }),
    createCreature('lord-aldemar', 'Lord Aldemar Vane', {
      creatureType: 'humanoid',
      role: 'Lord of Thornhold',
      disposition: 'neutral',
      met: true,
      notes:
        "Proud and in denial. He calls the raids peasant panic and says that his house's ward cannot fail. He trusts his cousin Irenne with the keep and its keys. He softens only when he sees the pale seal on the orders, and he opens the crypt ledger once the shade in his hall is put down.",
      stats: { STR: 14, INT: 12, WIS: 13, CHA: 15 },
      location: at('aldemar'),
    }),
    createCreature('castellan-irenne', 'Castellan Irenne Vane', {
      creatureType: 'humanoid',
      role: 'Castellan of Thornhold, cousin to Lord Aldemar',
      disposition: 'neutral',
      met: true,
      notes:
        'The hidden hand. For a year the crown of Ostrand has spoken to her in dreams, and she took the pale seal from the crypt to write his orders. She paid Snagtooth to topple a wardstone and burn the farms, bought Hollowvein silver through Corvin, and had a counter-key cut in the east. The key waits in the sealed crates of Dorn. It is half a key, and she needs Sella to recast it with more pale silver. Story clock: on day 6 she reaches the forge of Sella with the key, and on day 8 she opens the barrow. If she is dead, the Pale-sworn keep the same days. She is courteous and helpful, and she asks the party to carry her letters. If crate four arrives empty, she pays Dorn in full, and that night a Pale-sworn searches the packs of the party. If she learns that the party has the counter-key, she invites them to dine and offers 200 gp for "a Vane heirloom". A refusal gets Hold Person at the table, and her guards try to take the key. Set her and her two guards hostile when she is unmasked. She runs before she fights: she turns invisible, takes the stairs down to the dungeon, and leaves for the barrow. Move her there if she gets away.',
      level: 5,
      tier: 'legend',
      cr: 2,
      maxHP: 44,
      stats: { STR: 10, DEX: 14, CON: 14, INT: 13, WIS: 12, CHA: 17 },
      weapon: DAGGER,
      armor: enemyArmor('Leather Armor'),
      ...trained(['WIS', 'CHA'], ['deception', 'insight', 'persuasion']),
      class: 'warlock',
      casterLevel: 5,
      spellbook: {
        cantrips: ['eldritch-blast', 'chill-touch'],
        known: ['hellish-rebuke', 'hold-person', 'invisibility', 'fear'],
        prepared: ['hellish-rebuke', 'hold-person', 'invisibility', 'fear'],
      },
      location: at('irenne'),
    }),
  ];
}
