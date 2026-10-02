/** @typedef {import('../types/quest.js').Quest} Quest */
/** @typedef {import('../types/quest.js').QuestLink} QuestLink */
/** @typedef {import('../types/quest.js').QuestObjective} QuestObjective */
/** @typedef {import('../types/quest.js').QuestReward} QuestReward */
/** @typedef {import('./ExampleWorld.js').Place} Place */

/**
 * An objective that the players see once its quest is revealed.
 * @param {string} text @returns {Omit<QuestObjective, 'id'>}
 */
const step = (text) => ({ text, done: false, hidden: false });

/**
 * An objective that only a GM tab shows, even on a revealed quest. It names
 * what the players do not know yet.
 * @param {string} text @returns {Omit<QuestObjective, 'id'>}
 */
const secret = (text) => ({ text, done: false, hidden: true });

/** @param {string} creatureId @returns {QuestLink} */
const who = (creatureId) => ({ kind: 'creature', creatureId });

/** @param {string} nodeId @returns {QuestLink} */
const map = (nodeId) => ({ kind: 'place', nodeId, tileId: null });

/**
 * One active quest. The objectives get their ids from their order.
 * @param {string} id @param {string} title @param {string} notes
 * @param {{ revealed?: boolean, steps: Omit<QuestObjective, 'id'>[], links: QuestLink[], unlocks?: string[], reward?: QuestReward }} parts
 * @returns {Quest}
 */
const quest = (id, title, notes, { revealed = false, steps, links, unlocks = [], reward }) => ({
  id,
  title,
  notes,
  status: 'active',
  revealed,
  objectives: steps.map((s, i) => ({ id: `o${i + 1}`, ...s })),
  links,
  unlocks,
  ...(reward ? { reward } : {}),
});

/**
 * A reward of experience points for each character, with optional gold.
 * @param {number} xp @param {number} [gp] @returns {QuestReward}
 */
const each = (xp, gp = 0) => ({ gp, xp, per: 'each' });

/**
 * The quests of the example campaign. The main chain leads from the raids on
 * Briarwick Vale to the barrow of King Ostrand, and to the Castellan of
 * Thornhold, who opens the way for him. The side quests each give a clue to
 * the Castellan or a tool for the barrow. Only the first two quests start
 * revealed, with the personal quests of Mirelle, Wren, and Brannoc. Each
 * quest lists in `unlocks` the quests that its completion offers to reveal,
 * and the quest XP before the barrow brings the party close to level 5.
 * @param {(name: string) => Place} at the story places of the example world
 * @returns {Quest[]}
 */
export function exampleQuests(at) {
  /** @param {string} name @returns {QuestLink} */
  const spot = (name) => ({ kind: 'place', ...at(name) });
  return [
    quest(
      'rumors-at-the-waystation',
      'Rumors at the Waystation',
      "Dorn's caravan waits at the crossroads until the roads are safe. Bram at the Waystation in Briarwick knows what has the vale scared: goblin raids, open graves, and wolves on the road. He also holds a letter for Dorn from Thornhold, and he names the hermit Odo as the one man who knows the barrow.",
      {
        revealed: true,
        steps: [
          step('Find Bram at the Waystation in Briarwick'),
          step('Learn what has the vale scared'),
          secret('Notice the Thornhold letter that Bram holds for Dorn'),
          secret('Bram names the hermit Odo'),
        ],
        links: [map('briarwick'), who('innkeeper-bram'), who('caravan-master-dorn')],
        unlocks: ['the-goblin-raids', 'the-hermit-of-graypeak', 'dorns-sealed-cargo'],
        reward: each(100),
      },
    ),
    quest(
      'wolves-on-the-vale-road',
      'Wolves on the Vale Road',
      'A wolf pack hunts the road through Briarwick Vale, and Dorn will not move his wagons until it is gone. He pays each of them 25 gp. If the party asks about his cargo on the road, he says only that it is sealed and paid for.',
      {
        revealed: true,
        steps: [
          step('Find the pack on the Vale Road'),
          step('Drive the wolves off'),
          step('Collect from Dorn'),
          secret('See the Thornhold address on his sealed crates'),
        ],
        links: [spot('wolf1'), who('gray-wolf-1'), who('caravan-master-dorn')],
        reward: each(200, 25),
      },
    ),
    quest(
      'the-goblin-raids',
      'The Goblin Raids',
      'Goblins out of the Northmarch burned a farm in the vale. Hedda saw them work in silence, in files, watched by a hooded rider. Chieftain Snagtooth camps in the old forest of the Northmarch, and the way there runs north through the Saltreach. He is paid, not hungry, and he gives up his orders to save his life.',
      {
        steps: [
          step('Look over the burned farm'),
          step('Find the goblin camp in the Northmarch'),
          step('Deal with Chieftain Snagtooth'),
          secret('Find his orders under the pale seal, and the silver that paid him'),
        ],
        links: [spot('farm'), who('farmer-hedda'), spot('snagtooth'), who('snagtooth')],
        unlocks: ['the-pale-seal', 'the-fallen-wardstone'],
        reward: each(300),
      },
    ),
    quest(
      'the-pale-seal',
      "The Pale King's Seal",
      "Snagtooth's orders carry a pale crown pressed into gray wax. Reeve Maera knows it as the seal of King Ostrand, and she knows that the seal lies in the crypt of Thornhold. Fresh wax means that someone at Thornhold took it out. The shire records show that the seal left the crypt in the month the graves of Sister Alwyn opened.",
      {
        steps: [
          step('Show the orders to Reeve Maera'),
          step('Learn who King Ostrand was'),
          secret('Maera knows the seal belongs in the Thornhold crypt'),
        ],
        links: [who('reeve-maera'), map('thornhold')],
        unlocks: ['the-lord-of-thornhold'],
        reward: each(300),
      },
    ),
    quest(
      'the-hermit-of-graypeak',
      'The Hermit of Graypeak',
      'Odo keeps the warding key of the barrow, as his line has since the sealing. Skalvyr the wyvern nests in the eyrie above the hermitage, and Odo will not come out while it hunts. He gives the key only to someone who swears the oath of the wardens, and he warns that a counter-key cut from the same silver fits the lock once a smith recasts it whole with more pale silver.',
      {
        steps: [
          step('Climb to the hermitage in Graypeak'),
          step('Drive off or kill Skalvyr'),
          step('Win the trust of Odo'),
          step('Swear the oath and take the warding key'),
          secret('Odo tells of the counter-key'),
        ],
        links: [spot('odo'), who('hermit-odo'), who('skalvyr'), map('graypeak')],
        unlocks: ['the-barrow-king'],
        reward: each(300),
      },
    ),
    quest(
      'the-fallen-wardstone',
      'The Fallen Wardstone',
      "Five wardstones stand in the Northmarch, and the ward on the barrow is only as strong as the circle. One stone lies toppled, pulled down with goblin ropes. Raising it takes a DC 15 Athletics check or a team of oxen from Hedda. While the circle is whole, Ostrand's reach past the barrow door is weaker, and he fights at a disadvantage against the bearer of the key.",
      {
        steps: [
          step('Find the Wardstone Circle'),
          step('Read the oath of the wardens'),
          step('Raise the fallen stone'),
          secret('Goblin rope marks show who pulled it down'),
        ],
        links: [spot('wardstones'), who('snagtooth'), who('farmer-hedda')],
        reward: each(200),
      },
    ),
    quest(
      'the-lord-of-thornhold',
      'The Lord of Thornhold',
      'House Vane swore the ward that sealed the barrow, and Lord Aldemar calls the raids peasant panic. Bring him the orders under the pale seal. The shade of his ancestor Edric haunts the hall, and once it is put down, Aldemar opens the crypt ledger. The ledger tells how the sealing was done, and the crypt shows that the seal is gone. Castellan Irenne greets the party warmly and offers them rooms.',
      {
        steps: [
          step('Ride to Thornhold Keep'),
          step('Show Lord Aldemar the pale seal'),
          step('Put down the shade in the hall'),
          step('Read the crypt ledger'),
          secret('Find the empty place of the seal in the crypt'),
        ],
        links: [map('thornhold'), who('lord-aldemar'), who('crypt-shade'), who('castellan-irenne')],
        unlocks: ['the-hand-that-writes', 'the-hollowvein-knocking'],
        reward: each(300),
      },
    ),
    quest(
      'the-hand-that-writes',
      'The Hand That Writes',
      'Someone at Thornhold writes the orders of Ostrand. It is Castellan Irenne Vane. The crown has spoken to her in dreams for a year. Clues: her hand matches the orders; Corvin was paid under her seal; the crates of Dorn are addressed to her; her Pale-sworn servants guard a ledger in the keep dungeons. Unmasked, she runs for the forge of Sella with the counter-key if she has it, because it is half a key until it is recast. Story clock: on day 6 she (or the Pale-sworn, if she is dead) reaches Sella with the counter-key, and on day 8 they open the barrow.',
      {
        steps: [
          step('Learn who at Thornhold could reach the crypt'),
          step('Compare the hand of the orders with the letters of the keep'),
          secret('The letters of Castellan Irenne match the orders'),
          secret('Find the Pale-sworn and their ledger under the keep'),
          secret('Confront Irenne before she reaches the barrow'),
        ],
        links: [
          who('castellan-irenne'),
          who('pale-sworn-1'),
          who('pale-sworn-2'),
          spot('cultist1'),
          map('thornhold'),
        ],
        reward: each(400),
      },
    ),
    quest(
      'the-barrow-king',
      'The Barrow of the Old King',
      'King Ostrand has risen in his tomb, and the ward is all that keeps him there. The barrow map starts locked and needs an item named Warding Key. Odo gives one, or Sella recasts the counter-key into one. Open the door with the warding key, go down through his court of skeletons and the grave wight, and end him at his tomb. If Irenne recasts the counter-key and opens the door first (on day 8, unless the party stops her), the dead of the barrow walk the Barrowdowns until he falls.',
      {
        steps: [
          step('Open the barrow door with the warding key'),
          step('Pass the skeletons and the grave wight'),
          step('Destroy King Ostrand'),
          secret('Stop Irenne from opening the door first'),
        ],
        links: [
          spot('barrowDoor'),
          map('barrow'),
          who('grave-wight'),
          who('ostrand'),
          who('castellan-irenne'),
        ],
        reward: each(500),
      },
    ),
    quest(
      'dorns-sealed-cargo',
      "Dorn's Sealed Cargo",
      'The six crates of Dorn go to "the Castellan, Thornhold". One holds a silver key of the old pattern: the counter-key, cut in the east from Hollowvein silver. If the party keeps Dorn at the crossroads, Irenne sends her Pale-sworn to fetch it. If they open a crate, Dorn is furious but does not stop them. The counter-key is half a key, because the cutter in the east had too little pale silver for the ward. Sella in Briarwick can recast it whole with pale silver from Hollowvein or the Silver Road.',
      {
        steps: [
          step('Ask Dorn where his cargo goes'),
          secret('Open a crate and find the counter-key'),
          secret('Keep the counter-key from the Castellan'),
        ],
        links: [who('caravan-master-dorn'), spot('dorn'), who('castellan-irenne')],
        unlocks: ['the-silver-road'],
        reward: each(200),
      },
    ),
    quest(
      'dead-water',
      'Dead Water',
      'Drowned sailors walk the Saltmere docks, and the fishing boats stay in. They are the crew of the Gull, which sank off the pier head with a load of Hollowvein silver. Harbormaster Petra pays 10 gp a head. The pale silver on their belts draws them back to shore, and it is stamped with the thorn of House Vane.',
      {
        steps: [
          step('Ask Harbormaster Petra about the drowned'),
          step('Put down the dead on the docks'),
          secret('Read the tide log: the dead first walked when the Gull sank'),
          secret('Find the thorn stamp on the silver'),
        ],
        links: [
          map('saltmere'),
          who('harbormaster-petra'),
          who('drowned-watchman-1'),
          spot('drowned1'),
        ],
        reward: each(100, 10),
      },
    ),
    quest(
      'the-hollowvein-knocking',
      'The Hollowvein Knocking',
      'The Hollowvein mine gave the silver of the crown of Ostrand. The wardens closed its deep gallery and bound a spirit to it. Last spring, diggers paid by Irenne broke the vein wards, and the Knocker killed the last shift. Sella can recast a broken warding key from its silver.',
      {
        steps: [
          step('Go down into Hollowvein'),
          step('Deal with the Knocker in the Vein'),
          step('Bring pale silver to Sella'),
          secret('The diggers were paid under the pale seal'),
        ],
        links: [map('hollowvein'), who('hollowvein-knocker'), who('sella-the-smith')],
        unlocks: ['the-barrow-king'],
        reward: each(300),
      },
    ),
    quest(
      'the-mire-hags-bargain',
      "The Mire Hag's Bargain",
      'Grelka brews a grave-ward: a draught that gives resistance to necrotic damage for one hour. She never takes coin. Her price is a lock of hair from the one who dreams of the crown, and she tells the party that this person "sleeps with the window open to the barrow". The hair gives her power over Irenne, which is a problem for later.',
      {
        steps: [
          step('Find the hut of Grelka in the Mirefen'),
          step('Hear her price'),
          secret('Her price points at Irenne'),
        ],
        links: [spot('grelka'), who('grelka'), who('bog-zombie-1')],
        reward: each(100),
      },
    ),
    quest(
      'the-silver-road',
      'The Silver Road',
      'The tithe caravans of Ostrand died in the sand of the Ashen Reach, and their wagons lie in the ruins of the Silver Road. The last wagon holds a cask of pale silver and the tithe roll, which names the five warden houses: Vane, the line of Odo, Hollowell, and two lost to the sand. Sella can use the silver in place of Hollowvein silver.',
      {
        steps: [
          step('Cross the Ashen Reach to the Silver Road'),
          step('Search the last wagon'),
          secret('The tithe roll names Hollowell as a warden house'),
        ],
        links: [spot('silverRoad'), who('giant-scorpion'), map('ashen-reach')],
        unlocks: ['the-barrow-king'],
        reward: each(200),
      },
    ),
    quest(
      'wrens-debt',
      "Wren's Debt",
      'Wren owes Corvin one cargo run. He calls it in: carry a sealed box to Thornhold and leave it with the Castellan. Inside is a letter from Corvin that asks who will pay for the Gull, and the torn ledger page that shows the silver he shipped. If Wren opens the box and learns the buyer, Corvin clears the debt.',
      {
        revealed: true,
        steps: [
          step('Find Corvin at the Drowned Lantern in Saltmere'),
          step('Carry his sealed box to Thornhold'),
          secret('Learn that the buyer of the silver is Irenne'),
        ],
        links: [who('corvin-the-smuggler'), map('saltmere'), who('castellan-irenne')],
        reward: each(200),
      },
    ),
    quest(
      'hollowells-last-shift',
      "Hollowell's Last Shift",
      'Tam Hollowell, the father of Brannoc, led the last shift into Hollowvein, and his lamp was found burning at the mine mouth. He died in the deepest gallery, where he tried to mend the vein wards. His notes can bind the Knocker again, and his body wears the old warden ring of House Hollowell.',
      {
        revealed: true,
        steps: [
          step('Learn what happened on the last shift'),
          step('Find Tam Hollowell in the deep gallery'),
          secret('His warden ring marks Brannoc as heir to a warden house'),
        ],
        links: [map('hollowvein'), spot('knocker'), who('hollowvein-knocker')],
        reward: each(200),
      },
    ),
    quest(
      'the-opened-graves',
      'The Opened Graves',
      'Sister Alwyn wrote to the temple for Mirelle. Three graves in her yard at Briarwick were opened from the inside, and the dead walked east toward the Barrowdowns. They opened in the same month that the wardstone fell and the pale seal left the Thornhold crypt. The Reeve can confirm the dates from the shire records. Alwyn blesses weapons against the risen dead: for one day, a blessed weapon deals radiant damage.',
      {
        revealed: true,
        steps: [
          step('Answer the letter of Sister Alwyn at the temple in Briarwick'),
          step('Look over the open graves'),
          step('Ask Sister Alwyn what she saw'),
          secret('The graves opened in the month the pale seal left Thornhold'),
        ],
        links: [who('sister-alwyn'), spot('graveyard'), who('reeve-maera')],
        reward: each(200),
      },
    ),
  ];
}
