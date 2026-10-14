/** @typedef {import('../types/handout.js').Handout} Handout */
/** @typedef {import('./ExampleWorld.js').Place} Place */

/**
 * One handout. `at` binds it to one tile, and `nodeId` binds it to a whole
 * node. With neither, it shows everywhere.
 * @param {string} id @param {string} title @param {string} body
 * @param {{ at?: Place, nodeId?: string, audience?: string[] }} [where]
 * @returns {Handout}
 */
const handout = (id, title, body, { at, nodeId, audience } = {}) => ({
  id,
  title,
  body,
  nodeId: at?.nodeId ?? nodeId ?? null,
  tileId: at?.tileId ?? null,
  // A personal hook is in the hands of its character from the start.
  revealed: Boolean(audience),
  image: null,
  audience: audience ?? null,
});

/**
 * The handouts of the example campaign. The lore and the clues start hidden,
 * and each one sits on the node or the tile where the party finds it, so
 * the GM reveals it there. Each character also starts with one personal
 * hook that only the tab of that character sees.
 * @param {(name: string) => Place} at
 * @returns {Handout[]}
 */
export function exampleHandouts(at) {
  return [
    handout(
      'summons-to-thornhold',
      'A Summons to Thornhold',
      'Folded thick paper under the thorn seal of House Vane, in a cramped, elegant hand: "Ser Aldric. His lordship calls his sworn knights home. Meet the caravan of Master Dorn at the Briarwick crossroads and see it safe to the keep. Its cargo is for my hand alone. Written for Lord Aldemar by his Castellan."',
      { audience: ['aldric'] },
    ),
    handout(
      'letter-from-sister-alwyn',
      'A Letter from Sister Alwyn',
      '"Sister Mirelle. I write to the temple because I have no one else to ask. Three graves in my yard at Briarwick are open, and the earth is thrown out, not in. Whoever lay in them left on their own feet. Come quickly, and bring the Dawn with you."',
      { audience: ['mirelle'] },
    ),
    handout(
      'corvins-marker',
      "Corvin's Marker",
      'A scrap of sailcloth with a knot tied in one corner, the old sign of a debt between smugglers. On the back, in tar: "One run, Wren. Come to the Drowned Lantern. Bring nothing that floats. C."',
      { audience: ['wren'] },
    ),
    handout(
      'the-last-shift',
      'The Last Shift',
      'A note from the mine clerk of Hollowvein, sent to the Hollowell house: "The last shift did not come up. We found the lamp of your father still burning at the mine mouth, and we heard knocking below. The company has closed the deep gallery and will not send men down again. His notes on the vein wards are yours, with our regrets."',
      { audience: ['brannoc'] },
    ),
    handout(
      'waystation-rumor',
      'A Rumor at the Waystation',
      "Bram leans over the bar: \"Goblins, aye. But goblins don't march in files, and they don't carry writs. Something up in the old barrow is giving orders. And there's a letter behind my bar for Master Dorn, sealed at Thornhold, that nobody has come to collect.\"",
      { at: at('bram') },
    ),
    handout(
      'letter-for-dorn',
      'A Letter for Master Dorn',
      'Folded paper under the thorn seal of House Vane, in a cramped, elegant hand: "Master Dorn. Stop no more than one night at the crossroads, and let no one near crate four. You will have the second half of your fee only if its wax is whole when it reaches my hand. The Castellan, Thornhold."',
      { at: at('bram') },
    ),
    handout(
      'dorns-manifest',
      "Dorn's Manifest",
      'A bill of lading pinned inside the lead wagon. "Six crates, sealed, from the east road. Consigned to the Castellan, Thornhold. Paid in full in advance. Crate four: lock fittings, silver, one piece. To be opened by the Castellan\'s own hand and by no other."',
      { at: at('dorn') },
    ),
    handout(
      'snagtooth-orders',
      "Snagtooth's Orders",
      'A crumpled writ in a cramped, elegant hand: "Burn the farms. Pull down the stone at the circle. Keep the road watched, and let none reach the mountain hermit before my crown is brought to me." It is sealed with a pale crown pressed into gray wax. The purse beside it is full of silver stamped with a thorn.',
      { at: at('snagtooth') },
    ),
    handout(
      'wardens-oath',
      "The Wardens' Oath",
      'Cut into the tallest wardstone, worn shallow: "WHILE STONE STANDS AND SILVER SLEEPS, THE KING KEEPS HIS BED. FIVE SWORE. FIVE KEEP." Below it, much newer, scratched as if with a knife-point: "four".',
      { at: at('wardstones') },
    ),
    handout(
      'odos-warning',
      "Odo's Warning",
      '"The key turns a lock, not a king. Ostrand was buried with his sword, his crown, and his pride. The ward kept folk out, and it kept him in as well. And mind this: a key cut from the same silver fits the same door once a smith makes it whole. Break the ward, go down, and finish what the old rites could not."',
      { at: at('odo') },
    ),
    handout(
      'petras-tide-log',
      "Petra's Tide Log",
      'The harbor log of Saltmere, in a neat square hand. "Spring tide, 3rd. The Gull out of the Saltreach, Corvin master, the last load of silver for the east. Sank off the pier head in fair weather, all hands. 5th. Men seen walking the shallows at dusk. 9th. The fishing boats stay in. 12th. Watchman Hobb found drowned on the dock on a dry night."',
      { at: at('petra') },
    ),
    handout(
      'smugglers-chart',
      "A Smuggler's Chart",
      'Corvin\'s chart of the Saltreach coast, greasy and precise. Every cove is marked with a price. Inland, over the Barrowdowns, someone has inked a pale crown and beneath it: NO CARGO. NOT FOR TRIPLE. The margin has a newer note in fresh ink: "Silver east, three loads. Paid under the seal. Who?"',
      { at: at('corvin') },
    ),
    handout(
      'torn-ledger-page',
      'A Torn Ledger Page',
      'One page from the book of Corvin, with the edge torn where he cut it out. "Hollowvein silver, pale grade. Received at night from the Barrowdowns road, 40 weight. Shipped east on the Gull for a key-cutter, name not given. Paid under a pale crown in gray wax. Balance owed: one boat."',
      { at: at('corvin') },
    ),
    handout(
      'legend-of-ostrand',
      'The Legend of King Ostrand',
      'Every fireside in the Marches tells it differently, but the bones agree. A king beggared his shires to build a tomb grander than his keep. He was crowned in pale silver, and his own council sealed him in. He was patient.',
    ),
    handout(
      'crypt-ledger',
      'The Crypt Ledger of Thornhold',
      'The sealing, in the hand of the first Vane: "Five stones raised and sworn at the circle, one for each warden house. A key cut of Hollowvein silver, the same vein that crowned him, because like binds like. A key with less silver in it than the crown will not turn. The door stays shut while the circle stands and a warden\'s line keeps the key. We do not write where the key is kept. He listens."',
      { nodeId: at('shade').nodeId },
    ),
    // The shade stands watch where the seal was kept.
    handout(
      'empty-seal-niche',
      'An Empty Niche in the Crypt',
      'A niche cut into the crypt wall under the Vane banner. The dust on its shelf keeps the clean outline of a small square box. A brass plate reads: "THE SEAL OF THE SEALING. LET NO HAND MOVE IT." Drops of gray wax, still soft, mark the floor below.',
      { at: at('shade') },
    ),
    handout(
      'irennes-letter',
      'A Letter under the Keep',
      'Found with the Pale-sworn, in the cramped, elegant hand of the orders: "The key comes up the east road in the wagons of Dorn. If the caravan stops at the crossroads, take crate four and bring it to me, not to the keep. He is patient, and so am I. The smith at Briarwick will finish it. When the circle breaks, the door is ours." It is sealed with a pale crown in gray wax.',
      { at: at('cultist1') },
    ),
    handout(
      'barrow-inscription',
      'Inscription over the Barrow Door',
      'Carved in the old tongue above the lintel: "HERE LIES OSTRAND, KING OF THE MARCHES, WHO WOULD NOT LIE STILL. SEALED IN THE FORTIETH YEAR. PRAY THE WARD OUTLASTS HIS PATIENCE."',
      { at: at('barrowDoor') },
    ),
  ];
}
