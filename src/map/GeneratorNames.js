import { randInt } from './GeneratorRandom.js';

/** @typedef {import('../types/map.js').GeneratedSite} GeneratedSite */

/**
 * Seeded place names for generated sub-maps. A name joins a start syllable
 * and an end syllable, sometimes with a short middle, for example "Ashford"
 * or "Kelamere". A pattern per archetype then turns the word into a place
 * name, such as "The Ashford Hills" or "Castle Kelamere". The injected RNG
 * makes each name follow the seed of its map.
 */

const START = [
  'Ash',
  'Bram',
  'Cor',
  'Dun',
  'El',
  'Fen',
  'Gal',
  'Har',
  'Iv',
  'Kel',
  'Lor',
  'Mar',
  'Nor',
  'Oak',
  'Pen',
  'Ros',
  'Sal',
  'Thorn',
  'Ul',
  'Vel',
  'Wyn',
  'Yar',
];
const MIDDLE = ['a', 'e', 'i', 'o', 'en', 'ar', 'el'];
const END = [
  'ford',
  'wick',
  'dale',
  'mere',
  'holt',
  'ton',
  'by',
  'stead',
  'moor',
  'fell',
  'gate',
  'haven',
  'brook',
  'crest',
  'den',
  'field',
];

/** Inn and tavern signs: "The {adjective} {noun}". */
const SIGN_ADJECTIVES = [
  'Red',
  'Golden',
  'Silver',
  'Laughing',
  'Drowsy',
  'Crooked',
  'Green',
  'Black',
  'Merry',
  'Wandering',
];
const SIGN_NOUNS = [
  'Stag',
  'Dragon',
  'Goose',
  'Lantern',
  'Barrel',
  'Boar',
  'Crown',
  'Anchor',
  'Griffin',
  'Kettle',
];

/**
 * The name patterns per archetype. `{w}` is the generated word.
 * @type {Record<string, string[]>}
 */
const PATTERNS = {
  wilderness: ['The {w} Vale', '{w} Wood', 'The {w} Reach'],
  highlands: ['The {w} Hills', '{w} Heights'],
  frontier: ['The {w} Wastes', '{w} March'],
  desert: ['The {w} Sands', '{w} Dunes'],
  wetlands: ['The {w} Fens', '{w} Marsh'],
  island: ['{w} Isle'],
  world: ['{w}'],
  town: ['{w}'],
  dungeon: ['The Crypt of {w}', '{w} Barrow', 'The Vaults of {w}'],
  cave: ['{w} Caves', 'The {w} Hollow'],
  castle: ['Castle {w}', '{w} Keep'],
};

/**
 * One generated word, for example "Ashford".
 * @param {() => number} rng
 * @returns {string}
 */
export function placeWord(rng) {
  const middle = rng() < 0.3 ? MIDDLE[randInt(rng, MIDDLE.length)] : '';
  return `${START[randInt(rng, START.length)]}${middle}${END[randInt(rng, END.length)]}`;
}

/**
 * The name of a generated sub-map. An inn or a tavern gets a sign name,
 * such as "The Laughing Goose". A home gets a family name, such as "The
 * Ashford house". Any other building takes its label, for example
 * "Blacksmith" or "Wizard tower". Every other archetype uses its patterns.
 * @param {Pick<GeneratedSite, 'archetype' | 'label'>} site
 * @param {() => number} rng
 * @returns {string}
 */
export function placeName(site, rng) {
  if (site.archetype === 'building') {
    if (site.label === 'inn' || site.label === 'tavern') {
      const adjective = SIGN_ADJECTIVES[randInt(rng, SIGN_ADJECTIVES.length)];
      return `The ${adjective} ${SIGN_NOUNS[randInt(rng, SIGN_NOUNS.length)]}`;
    }
    const label = site.label.replace(/-/g, ' ');
    if (['house', 'cottage', 'farm'].includes(site.label)) return `The ${placeWord(rng)} ${label}`;
    return `${label[0].toUpperCase()}${label.slice(1)}`;
  }
  const patterns = PATTERNS[site.archetype] ?? PATTERNS.town;
  return patterns[randInt(rng, patterns.length)].replace('{w}', placeWord(rng));
}

/**
 * The name of a node that the GM regenerates as `archetype`. A name that
 * follows a pattern of another archetype takes the pattern of `archetype`
 * at the same place in its list, with the same word. For example, "The
 * Ashford Hills" regenerated as a desert becomes "The Ashford Sands". Any
 * other name stays, so a name that the GM typed is kept. A one-word name
 * matches no pattern, because the world and town pattern is the word alone
 * and cannot tell a generated name from a typed one. An archetype with no
 * patterns, such as a building, keeps the name, because a building takes
 * its name from its label.
 * @param {string} name
 * @param {string} archetype
 * @returns {string}
 */
export function renamedFor(name, archetype) {
  const target = PATTERNS[archetype];
  if (!target) return name;
  for (const [from, patterns] of Object.entries(PATTERNS)) {
    for (let i = 0; i < patterns.length; i++) {
      if (patterns[i] === '{w}') continue;
      const match = name.match(new RegExp(`^${patterns[i].replace('{w}', '([A-Z][a-z]+)')}$`));
      if (!match) continue;
      if (from === archetype) return name;
      return target[i % target.length].replace('{w}', match[1]);
    }
  }
  return name;
}
