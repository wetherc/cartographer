import { deepFreeze } from '../util/deepFreeze.js';

/** @typedef {import('../types/table.js').RandomTable} RandomTable */

/**
 * The built-in random tables of the library. A GM can edit one, which stores
 * an override, or add new tables beside them. The weights follow the habit
 * of printed tables: a common result has a high weight, and a rare one has 1.
 * The name table uses the `{place}` token, which a roll fills from the place
 * name syllables of the map generator.
 * @type {readonly RandomTable[]}
 */
export const DEFAULT_TABLES = deepFreeze([
  {
    name: 'Wilderness encounters',
    rows: [
      { weight: 6, text: 'No encounter. The road is quiet.' },
      { weight: 3, text: 'A pack of 1d4 + 2 wolves follows the party at a distance.' },
      { weight: 2, text: 'A merchant wagon with a broken wheel blocks the road.' },
      { weight: 2, text: '1d6 bandits wait in ambush at a ford.' },
      { weight: 2, text: 'A hunting party of 1d4 elves crosses the path.' },
      { weight: 1, text: 'An owlbear crashes out of the trees.' },
      { weight: 1, text: 'A lone pilgrim asks for an escort to the next shrine.' },
      { weight: 1, text: 'Fresh tracks of a large beast lead off the road.' },
    ],
  },
  {
    name: 'Trinkets and loot',
    rows: [
      { weight: 4, text: '2d10 copper pieces in a torn purse' },
      { weight: 3, text: '1d6 silver pieces and a bone die' },
      { weight: 2, text: 'A silver locket with a faded portrait' },
      { weight: 2, text: 'A map fragment that shows part of a coast' },
      { weight: 2, text: 'A crystal that glows faintly in moonlight' },
      { weight: 1, text: 'A potion of healing in a cracked vial' },
      { weight: 1, text: 'A gold ring engraved with an unknown crest' },
      { weight: 1, text: 'A key with no lock, warm to the touch' },
    ],
  },
  {
    name: 'Settlement names',
    rows: [
      { weight: 4, text: '{place}' },
      { weight: 2, text: 'Old {place}' },
      { weight: 2, text: '{place} Crossing' },
      { weight: 1, text: '{place} Mill' },
      { weight: 1, text: 'Upper {place}' },
    ],
  },
]);
